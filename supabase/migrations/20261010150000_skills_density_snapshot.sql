-- Skills-density snapshot (security audit F-08, docs/security-audit.md).
--
-- `get_skills_density` is callable by anon straight on Supabase, bypassing the Worker and its
-- per-browser cache. Each call scanned every profile and ran `profile_is_matchable` for each one,
-- so one client looping it could load the database and slow `activate_crisis` during a crisis.
--
-- The map is now served from a stored snapshot of banded squares, one per category (and one for
-- all skills). A call reads the snapshot: O(squares), not O(residents). When a snapshot is older
-- than an hour, the call that finds it so recomputes it first, under a transaction-scoped try
-- lock: concurrent callers serve the previous snapshot instead of waiting or recomputing. So the
-- full scan runs at most about once an hour per category, however often anyone calls. Every
-- privacy rule of the S-11 migration is unchanged: the squares, the k = 5 suppression inside the
-- aggregate, the bands, and a response of cell and band only.
--
-- The map now lags by up to an hour: a new, changed, paused or erased resident shows up in (or
-- leaves) the bands at the next refresh. The snapshot holds bands of 5 or more people, never a
-- person. Expand only: two new tables, two internal functions, one replaced function body.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- `category` is '' for all skills, so it can be part of the key.
create table public.skills_density_cells (
  category text not null,
  sx integer not null,
  sy integer not null,
  band smallint not null check (band between 1 and 3),
  cell jsonb not null,
  primary key (category, sx, sy)
);

create table public.skills_density_refreshes (
  category text primary key,
  refreshed_at timestamptz not null
);

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

-- Recomputes one category's snapshot. The query is the one from 20261005120000, unchanged.
-- Internal: only get_skills_density calls it.
create function public.refresh_skills_density(p_category text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text := coalesce(p_category, '');
begin
  delete from public.skills_density_cells where category = v_key;

  insert into public.skills_density_cells (category, sx, sy, band, cell)
  with eligible as (
    select
      p.user_id,
      extensions.st_transform(p.location::extensions.geometry, 2180) as g
    from public.profiles p
    where public.profile_is_matchable(p.user_id)
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
  -- Suppression happens here, inside the aggregate: a square under 5 people never gets a band.
  squares as (
    select
      floor(extensions.st_x(e.g) / 2000)::integer as sx,
      floor(extensions.st_y(e.g) / 2000)::integer as sy,
      count(distinct e.user_id) as n
    from eligible e
    group by 1, 2
    having count(distinct e.user_id) >= 5
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
  from squares q;

  insert into public.skills_density_refreshes (category, refreshed_at)
  values (v_key, now())
  on conflict (category) do update set refreshed_at = excluded.refreshed_at;
end;
$$;

-- The public map, read from the snapshot. Same signature, output and errors as before. Volatile
-- now (a stale snapshot is refreshed), so PostgREST runs it in a read-write transaction.
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
  if (v_refreshed_at is null or v_refreshed_at < now() - interval '1 hour')
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

alter function public.refresh_skills_density(text) owner to postgres;
alter function public.get_skills_density(text) owner to postgres;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

-- No policies: only the security definer functions above read or write them.
alter table public.skills_density_cells enable row level security;
alter table public.skills_density_refreshes enable row level security;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke all on public.skills_density_cells from anon, authenticated;
revoke all on public.skills_density_refreshes from anon, authenticated;

-- Supabase grants execute on new functions to anon and authenticated by default.
revoke execute on function public.refresh_skills_density(text) from public, anon, authenticated;
