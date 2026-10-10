-- Harder k-anonymity for the skills-density map (security audit F-03, docs/security-audit.md).
--
-- The threshold (5) and the band edges (10, 25) are public and fixed, and anyone can add matchable
-- residents: an account, a pin and one skill. Adding sybil accounts one by one until a square
-- appears or changes band gave the exact number of real residents, per category, and repeated
-- observation showed when known people joined, paused or left. On top of the skills density
-- snapshot migration:
--
--   * only residents whose account is at least 14 days old and whose email is confirmed count, so
--     a sybil costs a confirmed address and two weeks before it moves a square;
--   * the snapshot is recomputed once per Warsaw calendar day instead of hourly, so joins, pauses
--     and departures show up a day late at the earliest;
--   * each square's count gets deterministic noise of up to ±2 before banding, keyed by a secret
--     salt, the category, the square and the day. The repository is public, so without the salt
--     anyone could recompute the noise and subtract it. The true count must still reach k, so the
--     noise only ever hides a square, never shows a smaller group than k;
--   * category views need 10 residents instead of 5: differencing categories against each other
--     and against all skills leaked the most.
--
-- The noise blurs the threshold and band edges for one day; averaged over many days it washes
-- out, which the 14-day age and the daily refresh slow down. Expand only: one new table, one new
-- function, two replaced function bodies.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- One row. The salt never leaves the database. `noise_amplitude` is a setting, not a client knob:
-- clients have no access to this table (tests set it to 0 to check exact bands).
create table public.skills_density_config (
  id boolean primary key default true check (id),
  salt bytea not null default extensions.gen_random_bytes(32),
  noise_amplitude smallint not null default 2 check (noise_amplitude between 0 and 5)
);

insert into public.skills_density_config default values;

alter table public.skills_density_config enable row level security;
revoke all on public.skills_density_config from anon, authenticated;

-- The day's snapshots were computed with the old rules: recompute them on the next call.
delete from public.skills_density_refreshes;

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

-- The noise for one square on one day, from -amplitude to +amplitude. Modular arithmetic instead of
-- abs(), which overflows on the smallest bigint. Internal.
create function public.density_noise(p_category text, p_sx integer, p_sy integer, p_day date)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when c.noise_amplitude = 0 then 0
    else (
      (
        hashtextextended(
          encode(c.salt, 'hex') || ':' || coalesce(p_category, '') || ':' || p_sx || ':' || p_sy || ':' || p_day,
          0
        ) % (2 * c.noise_amplitude + 1)
        + (2 * c.noise_amplitude + 1)
      ) % (2 * c.noise_amplitude + 1)
    )::integer - c.noise_amplitude
  end
  from public.skills_density_config c
$$;

-- refresh_skills_density from 20261010150000, with the eligibility, the noise and k per view.
create or replace function public.refresh_skills_density(p_category text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text := coalesce(p_category, '');
  v_day date := (now() at time zone 'Europe/Warsaw')::date;
  v_k integer := case when p_category is null then 5 else 10 end;
begin
  delete from public.skills_density_cells where category = v_key;

  insert into public.skills_density_cells (category, sx, sy, band, cell)
  with eligible as (
    select
      p.user_id,
      extensions.st_transform(p.location::extensions.geometry, 2180) as g
    from public.profiles p
    join auth.users u on u.id = p.user_id
    where public.profile_is_matchable(p.user_id)
      and u.email_confirmed_at is not null
      and u.created_at <= now() - interval '14 days'
      and (
        p_category is null
        or exists (
          select 1
          from public.profile_skills ps
          join public.skills s on s.slug = ps.skill_slug
          where ps.user_id = p.user_id
            and s.category_slug = p_category
        )
      )
  ),
  -- The true count must reach k inside the aggregate: noise can hide a square, never reveal one.
  squares as (
    select
      floor(extensions.st_x(e.g) / 2000)::integer as sx,
      floor(extensions.st_y(e.g) / 2000)::integer as sy,
      count(distinct e.user_id) as n
    from eligible e
    group by 1, 2
    having count(distinct e.user_id) >= v_k
  ),
  noisy as (
    select q.sx, q.sy, q.n + public.density_noise(p_category, q.sx, q.sy, v_day) as n
    from squares q
  )
  select
    v_key,
    q.sx,
    q.sy,
    (case when q.n >= 25 then 3 when q.n >= 10 then 2 else 1 end)::smallint,
    extensions.st_asgeojson(
      extensions.st_transform(
        extensions.st_makeenvelope(q.sx * 2000, q.sy * 2000, (q.sx + 1) * 2000, (q.sy + 1) * 2000, 2180),
        4326
      ),
      6
    )::jsonb
  from noisy q
  where q.n >= v_k;

  insert into public.skills_density_refreshes (category, refreshed_at)
  values (v_key, now())
  on conflict (category) do update set refreshed_at = excluded.refreshed_at;
end;
$$;

-- get_skills_density from 20261010150000, refreshed once per Warsaw calendar day (the noise day).
create or replace function public.get_skills_density(p_category text default null)
returns table (cell jsonb, band smallint)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_key text := coalesce(p_category, '');
  v_refreshed_at timestamptz;
begin
  if p_category is not null
     and not exists (select 1 from public.skill_categories c where c.slug = p_category) then
    raise exception 'unknown_category';
  end if;

  select r.refreshed_at into v_refreshed_at from public.skills_density_refreshes r where r.category = v_key;

  -- One refresher per category; anyone else serves the previous snapshot.
  if (
       v_refreshed_at is null
       or (v_refreshed_at at time zone 'Europe/Warsaw')::date < (now() at time zone 'Europe/Warsaw')::date
     )
     and pg_try_advisory_xact_lock(hashtextextended('skills_density:' || v_key, 0)) then
    perform public.refresh_skills_density(p_category);
  end if;

  return query
  select c.cell, c.band
  from public.skills_density_cells c
  where c.category = v_key
  order by c.sx, c.sy;
end;
$$;

alter function public.density_noise(text, integer, integer, date) owner to postgres;
alter function public.refresh_skills_density(text) owner to postgres;
alter function public.get_skills_density(text) owner to postgres;

-- Supabase grants execute on new functions to anon and authenticated by default.
revoke execute on function public.density_noise(text, integer, integer, date) from public, anon, authenticated;
