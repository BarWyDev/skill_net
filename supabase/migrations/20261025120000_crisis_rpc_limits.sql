-- Limits on the crisis RPCs (production readiness audit of 2026-10-21: R-02, R-03, O-04).
--
--   * R-02: `activate_crisis` requires a reason. The app always sends one, but a direct PostgREST
--     call with no `p_reason` still activated a crisis with a null reason and skipped the F-02 audit.
--     This is the contract step the activation audit migration announced, for the function only:
--     `crises.reason` stays nullable, so crises activated before reasons were required keep their
--     null. `p_reason` keeps its null default, because `create or replace` cannot drop a default; a
--     null now raises `reason_required` like any other bad reason.
--   * R-03: `get_crisis_matches` returns at most 200 rows whatever `p_limit` says (a null used to
--     return the whole list), and `reveal_crisis_contacts` allows at most 10 reveals per coordinator
--     per rolling hour (`reveal_rate_limited`). Refused reveals are not logged: nothing was shown.
--   * O-04: `activate_crisis` keeps only the best 1000 residents by score in the snapshot.
--     `rank` and `position` are those of the full ranking, so the kept rows are exactly the first
--     1000 positions. `match_count` is the number kept. Every reader (the list, teams, coverage,
--     break-glass) reads the snapshot, so none of them can grow past the cap. The ranking itself
--     still scores every resident in the radius; the cap saves the writes, not that scan.
--
-- Expand only for the code on `master`: it always sends a reason, asks for 200 rows and maps an
-- unknown reveal error to the generic message until the code that knows `reveal_rate_limited` is
-- deployed.

-- The rolling-hour throttle in reveal_crisis_contacts.
create index contact_reveal_events_revealed_by_occurred_at_idx
  on public.contact_reveal_events (revealed_by, occurred_at);

-- ---------------------------------------------------------------------------
-- activate_crisis
-- ---------------------------------------------------------------------------

-- activate_crisis from 20261020120000: the reason is always checked, and the snapshot is capped.
create or replace function public.activate_crisis(
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
  v_snapshot_cap constant integer := 1000;
begin
  if not public.is_coordinator() then
    raise exception 'not_coordinator';
  end if;

  -- A missing reason raises reason_required, like a blank one.
  v_reason := public.check_reason(p_reason);

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
  ),
  -- Ranked over everyone, so a kept row's rank counts the residents above it who were cut too.
  ranked as (
    select
      s.*,
      rank() over (order by s.score desc) as rnk,
      row_number() over (order by s.score desc, md5(v_crisis_id::text || s.user_id::text)) as pos
    from scored s
  )
  select v_crisis_id, r.user_id, r.rnk, r.pos, r.score, round(r.d)::integer, r.matched_skills
  from ranked r
  where r.pos <= v_snapshot_cap;

  get diagnostics v_count = row_count;

  update public.crises set match_count = v_count where id = v_crisis_id;

  return v_crisis_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- get_crisis_matches
-- ---------------------------------------------------------------------------

-- get_crisis_matches from 20261019120000. The limit is clamped to 0..200; a null means 200.
create or replace function public.get_crisis_matches(p_crisis_id uuid, p_limit integer default 200)
returns table (
  rank integer,
  "position" integer,
  distance_km_rounded numeric,
  matched_skills jsonb,
  has_phone boolean,
  availability_slots integer,
  available_now boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if not public.is_coordinator() then
    raise exception 'not_coordinator';
  end if;

  if not exists (select 1 from public.crises c where c.id = p_crisis_id) then
    raise exception 'unknown_crisis';
  end if;

  return query
  select
    m.rank,
    m.position,
    round(m.distance_m / 500.0) * 0.5,
    v.skills,
    pc.user_id is not null,
    a.slots,
    public.availability_covers(a.slots, now())
  from public.crisis_matches m
  join public.profiles p on p.user_id = m.user_id
  cross join lateral (select public.crisis_visible_skills(m.user_id, m.matched_skills) as skills) v
  cross join lateral (select case when p.show_availability_in_crisis then p.availability_slots end as slots) a
  left join public.profile_contacts pc on pc.user_id = m.user_id
  where m.crisis_id = p_crisis_id
    and not public.pause_active(p.paused_at, p.paused_until, now())
    and v.skills is not null
  order by m.position
  limit greatest(0, least(coalesce(p_limit, 200), 200));

  get diagnostics v_count = row_count;

  insert into public.crisis_list_views (crisis_id, viewed_by, list, returned_count)
  values (p_crisis_id, (select auth.uid()), 'matches', v_count);
end;
$$;

-- ---------------------------------------------------------------------------
-- reveal_crisis_contacts
-- ---------------------------------------------------------------------------

-- reveal_crisis_contacts from 20261020120000, with the hourly limit, checked after the reason and
-- before anything is logged.
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

  -- Serialises one coordinator's reveals, so two parallel requests cannot both pass the count.
  perform pg_advisory_xact_lock(hashtextextended('reveal_crisis_contacts:' || (select auth.uid())::text, 0));

  -- Across all crises: the limit is on the person, not on one crisis.
  if (
    select count(*)
    from public.contact_reveal_events e
    where e.revealed_by = (select auth.uid())
      and e.occurred_at > now() - interval '1 hour'
  ) >= 10 then
    raise exception 'reveal_rate_limited';
  end if;

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

alter function public.activate_crisis(text, text, text, double precision, double precision, integer, text, boolean) owner to postgres;
alter function public.get_crisis_matches(uuid, integer) owner to postgres;
alter function public.reveal_crisis_contacts(uuid, text) owner to postgres;
