-- Crisis activation and ranked list (roadmap S-03, US-01, FR-009, FR-010).
--
-- The crisis data model and the single ranking implementation. Every access guarantee lives
-- here, so the app layer cannot weaken it:
--   * only a coordinator (`is_coordinator()`) activates a crisis or reads its list, enforced
--     inside the security-definer RPCs as well as by the app's route gate;
--   * the ranking is a snapshot written at activation, in the same transaction as the crisis;
--   * no `user_id`, raw distance or score leaves the database: clients have no privileges on
--     `crisis_matches` and `get_crisis_matches` returns display-ready rows only;
--   * deleting a resident removes them from every snapshot (cascade through `profiles`).

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- Reference data: one row per crisis type, with its ranking weights.
create table public.crisis_types (
  slug text primary key,
  name_pl text not null,
  sort smallint not null,
  w_distance numeric not null check (w_distance between 0 and 1),
  w_skill numeric not null check (w_skill between 0 and 1),
  w_level numeric not null check (w_level between 0 and 1),
  w_availability numeric not null check (w_availability between 0 and 1),
  constraint crisis_types_weights_sum_to_one check (w_distance + w_skill + w_level + w_availability = 1)
);

-- Reference data: the matrix. Which skills match a crisis type, and at which tier.
create table public.crisis_type_skills (
  crisis_type_slug text not null references public.crisis_types (slug),
  skill_slug text not null references public.skills (slug),
  tier text not null check (tier in ('priority', 'supporting')),
  primary key (crisis_type_slug, skill_slug)
);

-- The epicentre is not personal data, so it is stored as given (not coarsened).
-- `activated_by` has no FK to auth.users on purpose, like coordinator_role_events: the record
-- outlives the account and never blocks account erasure (S-14 decides retention).
create table public.crises (
  id uuid primary key default gen_random_uuid(),
  crisis_type_slug text not null references public.crisis_types (slug),
  epicentre extensions.geography(Point, 4326) not null,
  radius_m integer not null check (radius_m in (1000, 2000, 5000, 10000, 20000)),
  status text not null default 'active' check (status in ('active', 'ended')),
  activated_by uuid not null,
  activated_at timestamptz not null default now(),
  ended_at timestamptz,
  match_count integer not null default 0
);

create index crises_status_idx on public.crises (status);

-- The ranking snapshot. `position` is the stable per-crisis order behind "Osoba #N".
-- matched_skills: [{"slug": text, "tier": text, "level": int | null}], best skill first.
create table public.crisis_matches (
  crisis_id uuid not null references public.crises (id) on delete cascade,
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  rank integer not null,
  position integer not null,
  score numeric not null,
  distance_m integer not null,
  matched_skills jsonb not null,
  primary key (crisis_id, user_id),
  unique (crisis_id, position)
);

-- Resident deletion cascades here.
create index crisis_matches_user_id_idx on public.crisis_matches (user_id);

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

-- Activates a crisis and writes its ranking snapshot. Returns the crisis id.
--
-- Ranking rule, for type T (weights wd, ws, wl, wa), epicentre E and radius R metres:
--   candidates: profile_is_matchable, st_dwithin(location, E, R) (inclusive), and at least
--   one skill in the matrix for T;
--   distance_score = 1 - d / R;
--   per matched skill: tier_value 1.0 (priority) or 0.5 (supporting), level_value level / 3
--   (no level counts as 2 / 3); the best skill has the highest (tier_value, level_value);
--   skill_score = (best.tier_value + least(0.10, 0.05 * extra)) / 1.10, extra = other matches;
--   level_score = best.level_value; availability_score = 0 until S-07;
--   score = round(wd * distance + ws * skill + wl * level + wa * availability, 6);
--   rank = competition rank (ties share a place), position = row_number with a per-crisis
--   hash tiebreak that favours no one by id or registration time.
create function public.activate_crisis(
  p_crisis_type text,
  p_location_source text,
  p_postcode text,
  p_lat double precision,
  p_lng double precision,
  p_radius_km integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type public.crisis_types%rowtype;
  v_radius_m integer;
  v_epicentre extensions.geography;
  v_crisis_id uuid;
  v_count integer;
begin
  if not public.is_coordinator() then
    raise exception 'not_coordinator';
  end if;

  select * into v_type from public.crisis_types where slug = p_crisis_type;
  if not found then
    raise exception 'unknown_crisis_type';
  end if;

  if p_radius_km is null or p_radius_km not in (1, 2, 5, 10, 20) then
    raise exception 'invalid_radius';
  end if;
  v_radius_m := p_radius_km * 1000;

  if p_location_source = 'postcode' and p_postcode is not null then
    -- The raw centroid: the epicentre is not personal data.
    select centroid into v_epicentre from public.postcodes where postcode = p_postcode;
    if v_epicentre is null then
      raise exception 'unknown_postcode';
    end if;
  elsif p_location_source = 'pin' and p_lat is not null and p_lng is not null then
    -- The same bounding box as the profile trigger.
    if p_lat not between 49.0 and 54.9 or p_lng not between 14.1 and 24.2 then
      raise exception 'outside_poland';
    end if;
    v_epicentre := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography;
  else
    raise exception 'location_required';
  end if;

  insert into public.crises (crisis_type_slug, epicentre, radius_m, activated_by)
  values (v_type.slug, v_epicentre, v_radius_m, (select auth.uid()))
  returning id into v_crisis_id;

  insert into public.crisis_matches (crisis_id, user_id, rank, position, score, distance_m, matched_skills)
  with candidates as (
    -- The driving filter: st_dwithin on the GIST-indexed location.
    select p.user_id, extensions.st_distance(p.location, v_epicentre)::numeric as d
    from public.profiles p
    where extensions.st_dwithin(p.location, v_epicentre, v_radius_m)
  ),
  matched as (
    select
      c.user_id,
      c.d,
      ps.skill_slug,
      cts.tier,
      ps.level,
      case cts.tier when 'priority' then 1.0 else 0.5 end as tier_value,
      coalesce(ps.level, 2)::numeric / 3 as level_value
    from candidates c
    join public.profile_skills ps on ps.user_id = c.user_id
    join public.crisis_type_skills cts
      on cts.skill_slug = ps.skill_slug
     and cts.crisis_type_slug = v_type.slug
    where public.profile_is_matchable(c.user_id)
  ),
  ordered as (
    select
      m.*,
      row_number() over (
        partition by m.user_id
        order by m.tier_value desc, m.level_value desc, m.skill_slug
      ) as skill_rank,
      count(*) over (partition by m.user_id) as match_n
    from matched m
  ),
  scored as (
    select
      o.user_id,
      o.d,
      round(
        v_type.w_distance * (1 - o.d / v_radius_m)
        + v_type.w_skill * (o.tier_value + least(0.10, 0.05 * (o.match_n - 1))) / 1.10
        + v_type.w_level * o.level_value
        + v_type.w_availability * 0,
        6
      ) as score
    from ordered o
    where o.skill_rank = 1
  ),
  skills_json as (
    select
      o.user_id,
      jsonb_agg(
        jsonb_build_object('slug', o.skill_slug, 'tier', o.tier, 'level', o.level)
        order by o.skill_rank
      ) as matched_skills
    from ordered o
    group by o.user_id
  )
  select
    v_crisis_id,
    s.user_id,
    rank() over (order by s.score desc),
    row_number() over (order by s.score desc, md5(v_crisis_id::text || s.user_id::text)),
    s.score,
    round(s.d)::integer,
    j.matched_skills
  from scored s
  join skills_json j on j.user_id = s.user_id;

  get diagnostics v_count = row_count;

  update public.crises set match_count = v_count where id = v_crisis_id;

  return v_crisis_id;
end;
$$;

-- The display-ready ranked list of a crisis, in `position` order: no user_id, no score, and
-- the distance rounded to 0.5 km inside the database.
create function public.get_crisis_matches(p_crisis_id uuid, p_limit integer default 200)
returns table (rank integer, "position" integer, distance_km_rounded numeric, matched_skills jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_coordinator() then
    raise exception 'not_coordinator';
  end if;

  if not exists (select 1 from public.crises c where c.id = p_crisis_id) then
    raise exception 'unknown_crisis';
  end if;

  return query
  select m.rank, m.position, round(m.distance_m / 500.0) * 0.5, m.matched_skills
  from public.crisis_matches m
  where m.crisis_id = p_crisis_id
  order by m.position
  limit p_limit;
end;
$$;

alter function public.activate_crisis(text, text, text, double precision, double precision, integer) owner to postgres;
alter function public.get_crisis_matches(uuid, integer) owner to postgres;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.crisis_types enable row level security;
alter table public.crisis_type_skills enable row level security;
alter table public.crises enable row level security;
alter table public.crisis_matches enable row level security;

-- Reference data: readable by everyone, writable only by migrations.
create policy "crisis_types: anon can read" on public.crisis_types
  for select to anon using (true);
create policy "crisis_types: authenticated can read" on public.crisis_types
  for select to authenticated using (true);

create policy "crisis_type_skills: anon can read" on public.crisis_type_skills
  for select to anon using (true);
create policy "crisis_type_skills: authenticated can read" on public.crisis_type_skills
  for select to authenticated using (true);

-- Every coordinator sees every crisis (shift handover). Writes only through activate_crisis.
create policy "crises: coordinators can read" on public.crises
  for select to authenticated using ((select public.is_coordinator()));

-- crisis_matches: no policies. Clients read the list only through get_crisis_matches.

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

-- Supabase grants table privileges to anon and authenticated by default. RLS already blocks
-- these writes; revoking them as well makes them fail with permission denied.
revoke insert, update, delete, truncate, references, trigger on public.crisis_types from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.crisis_type_skills from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.crises from anon, authenticated;
revoke all on public.crises from anon;
revoke all on public.crisis_matches from anon, authenticated;

-- Supabase also grants execute on new functions to anon and authenticated by default.
revoke execute on function public.activate_crisis(text, text, text, double precision, double precision, integer) from public, anon;
revoke execute on function public.get_crisis_matches(uuid, integer) from public, anon;
grant execute on function public.activate_crisis(text, text, text, double precision, double precision, integer) to authenticated;
grant execute on function public.get_crisis_matches(uuid, integer) to authenticated;
