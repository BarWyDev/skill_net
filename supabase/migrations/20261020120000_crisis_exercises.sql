-- Crisis exercises and ready scenarios.
--
-- A coordinator can run a crisis as an exercise: for training, or to show the product to a council
-- before it has residents. An exercise is a normal crisis in every way that does not reach a
-- resident, so the coordinator practises on the real flow:
--   * `crises.is_exercise` is set once, at activation, and never changes (clients have no write
--     privileges on `crises`; only the security-definer RPCs write it);
--   * the ranking, the list, the teams, the audit of activations and list views, the rate limit and
--     the end of the crisis are exactly those of a real crisis;
--   * break-glass is refused: `reveal_crisis_contacts` raises `exercise_no_reveal` before it logs
--     anything, so an exercise never shows a resident's number and never appears in a resident's
--     "who saw my number" list;
--   * S-07 (crisis SMS) must not alert anyone for an exercise. Its sender must skip crises with
--     `is_exercise`.
--
-- `crisis_scenarios` holds ready exercises: a type, a postcode, a radius and a reason, started with
-- one click. It is reference data for coordinators only. It is empty here: places depend on the
-- council, so the local demo scenarios are in supabase/seed.sql, and production gets its own rows by
-- hand when a council wants them. Like the crisis matrix, scenarios are not edited in the app (FR-018).
--
-- Expand only: a new column with a default, a new table, a replaced `reveal_crisis_contacts` body
-- and an `activate_crisis` with one new trailing parameter that defaults to false, so the 7-argument
-- named call from the code on `master` keeps working (the 7-argument version is dropped so the call
-- is not ambiguous).

-- ---------------------------------------------------------------------------
-- Columns and tables
-- ---------------------------------------------------------------------------

alter table public.crises add column is_exercise boolean not null default false;

create table public.crisis_scenarios (
  slug text primary key check (slug ~ '^[a-z0-9-]{1,40}$'),
  name_pl text not null,
  crisis_type_slug text not null references public.crisis_types (slug),
  postcode text not null references public.postcodes (postcode),
  radius_km integer not null check (radius_km in (1, 2, 5, 10, 20)),
  -- Stored as the activation reason, so it must pass check_reason (activate_crisis checks it again).
  reason text not null,
  sort smallint not null
);

create index crisis_scenarios_crisis_type_slug_idx on public.crisis_scenarios (crisis_type_slug);

alter table public.crisis_scenarios enable row level security;

create policy "crisis_scenarios: coordinators can read" on public.crisis_scenarios
  for select to authenticated using ((select public.is_coordinator()));

-- Tables start closed to clients (20261010170000_narrow_table_grants.sql). Writes only by migration
-- or by hand.
grant select on public.crisis_scenarios to authenticated;

-- ---------------------------------------------------------------------------
-- activate_crisis
-- ---------------------------------------------------------------------------

drop function public.activate_crisis(text, text, text, double precision, double precision, integer, text);

-- activate_crisis from 20261019120000, with `p_exercise`. Only the insert into `crises` changes.
create function public.activate_crisis(
  p_crisis_type text,
  p_location_source text,
  p_postcode text,
  p_lat double precision,
  p_lng double precision,
  p_radius_km integer,
  p_reason text default null,
  p_exercise boolean default false
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
  v_postcode text;
  v_reason text;
begin
  if not public.is_coordinator() then
    raise exception 'not_coordinator';
  end if;

  -- Null only while the code that sends no reason is still deployed (see the activation audit
  -- migration). A reason that is sent must pass the same check as a break-glass reason.
  if p_reason is not null then
    v_reason := public.check_reason(p_reason);
  end if;

  -- Serialises one coordinator's activations, so two parallel requests cannot both pass the count.
  perform pg_advisory_xact_lock(hashtextextended('activate_crisis:' || (select auth.uid())::text, 0));

  -- Exercises count too: an exercise reads the same residents as a real crisis.
  if (
    select count(*)
    from public.crises c
    where c.activated_by = (select auth.uid())
      and c.activated_at > now() - interval '1 hour'
  ) >= 3 then
    raise exception 'activation_rate_limited';
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
    v_postcode := p_postcode;
  elsif p_location_source = 'pin' and p_lat is not null and p_lng is not null then
    -- The same outline as the profile trigger.
    if not public.is_in_poland(p_lat, p_lng) then
      raise exception 'outside_poland';
    end if;
    v_epicentre := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography;
    select postcode into v_postcode
    from public.postcodes
    order by extensions.st_distance(centroid, v_epicentre), postcode
    limit 1;
  else
    raise exception 'location_required';
  end if;

  insert into public.crises (crisis_type_slug, epicentre, epicentre_postcode, radius_m, activated_by, reason, is_exercise)
  values (v_type.slug, v_epicentre, v_postcode, v_radius_m, (select auth.uid()), v_reason, coalesce(p_exercise, false))
  returning id into v_crisis_id;

  insert into public.crisis_matches (crisis_id, user_id, rank, position, score, distance_m, matched_skills)
  -- Materialized so the radius filter on the GIST-indexed location drives the query; the
  -- planner would otherwise start from a scan over all of profile_skills.
  with candidates as materialized (
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
    join public.profile_skills ps on ps.user_id = c.user_id and ps.use_in_crisis
    join public.crisis_type_skills cts
      on cts.skill_slug = ps.skill_slug
     and cts.crisis_type_slug = v_type.slug
  ),
  -- One row per resident. Every aggregate orders the matched skills best first.
  per_user as (
    select
      m.user_id,
      min(m.d) as d,
      count(*) as match_n,
      (array_agg(m.tier_value order by m.tier_value desc, m.level_value desc, m.skill_slug))[1] as best_tier,
      (array_agg(m.level_value order by m.tier_value desc, m.level_value desc, m.skill_slug))[1] as best_level,
      jsonb_agg(
        jsonb_build_object('slug', m.skill_slug, 'tier', m.tier, 'level', m.level)
        order by m.tier_value desc, m.level_value desc, m.skill_slug
      ) as matched_skills
    from matched m
    group by m.user_id
    having public.profile_is_matchable(m.user_id)
  ),
  scored as (
    select
      u.user_id,
      u.d,
      u.matched_skills,
      round(
        v_type.w_distance * (1 - u.d / v_radius_m)
        + v_type.w_skill * (u.best_tier + least(0.10, 0.05 * (u.match_n - 1))) / 1.10
        + v_type.w_level * u.best_level
        + v_type.w_availability * 0,
        6
      ) as score
    from per_user u
  )
  select
    v_crisis_id,
    s.user_id,
    rank() over (order by s.score desc),
    row_number() over (order by s.score desc, md5(v_crisis_id::text || s.user_id::text)),
    s.score,
    round(s.d)::integer,
    s.matched_skills
  from scored s;

  get diagnostics v_count = row_count;

  update public.crises set match_count = v_count where id = v_crisis_id;

  return v_crisis_id;
end;
$$;

alter function public.activate_crisis(text, text, text, double precision, double precision, integer, text, boolean) owner to postgres;

revoke execute on function public.activate_crisis(text, text, text, double precision, double precision, integer, text, boolean) from public, anon;
grant execute on function public.activate_crisis(text, text, text, double precision, double precision, integer, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- reveal_crisis_contacts
-- ---------------------------------------------------------------------------

-- reveal_crisis_contacts from 20261019120000. An exercise is refused before anything is logged.
create or replace function public.reveal_crisis_contacts(p_crisis_id uuid, p_reason text)
returns table (
  rank integer,
  "position" integer,
  distance_km_rounded numeric,
  matched_skills jsonb,
  phone text,
  phone_verified boolean,
  availability_slots integer,
  available_now boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_exercise boolean;
  v_reason text;
  v_event_id bigint;
begin
  if not public.is_coordinator() then
    raise exception 'not_coordinator';
  end if;

  -- FOR SHARE serialises with end_crisis (FOR UPDATE): the reveal either finishes before the
  -- crisis ends or sees it ended, and never reads a half-deleted snapshot.
  select c.status, c.is_exercise into v_status, v_exercise from public.crises c where c.id = p_crisis_id for share;
  if not found then
    raise exception 'unknown_crisis';
  end if;

  if v_status <> 'active' then
    raise exception 'crisis_not_active';
  end if;

  if v_exercise then
    raise exception 'exercise_no_reveal';
  end if;

  v_reason := public.check_reason(p_reason);

  insert into public.contact_reveal_events (crisis_id, revealed_by, reason)
  values (p_crisis_id, (select auth.uid()), v_reason)
  returning id into v_event_id;

  -- One statement, one snapshot: the logged residents, the count and the returned rows are the
  -- same set. Data-modifying CTEs run to completion even though the final select does not read them.
  return query
  with revealed as materialized (
    select
      m.user_id,
      m.rank,
      m.position,
      m.distance_m,
      v.skills as matched_skills,
      pc.phone,
      pc.phone_verified_at,
      case when p.show_availability_in_crisis then p.availability_slots end as availability_slots
    from public.crisis_matches m
    join public.profile_contacts pc on pc.user_id = m.user_id
    join public.profiles p on p.user_id = m.user_id
    cross join lateral (select public.crisis_visible_skills(m.user_id, m.matched_skills) as skills) v
    where m.crisis_id = p_crisis_id
      and not public.pause_active(p.paused_at, p.paused_until, now())
      and p.allow_contact_reveal
      and v.skills is not null
  ),
  logged as (
    insert into public.contact_reveal_subjects (event_id, user_id)
    select v_event_id, r.user_id from revealed r
  ),
  counted as (
    update public.contact_reveal_events e
    set revealed_count = (select count(*) from revealed)
    where e.id = v_event_id
  )
  select
    r.rank,
    r.position,
    round(r.distance_m / 500.0) * 0.5,
    r.matched_skills,
    r.phone,
    r.phone_verified_at is not null,
    r.availability_slots,
    public.availability_covers(r.availability_slots, now())
  from revealed r
  order by r.position;
end;
$$;
