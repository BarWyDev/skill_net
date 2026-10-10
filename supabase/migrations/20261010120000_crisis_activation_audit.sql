-- Coordinator trilateration (security audit F-02, docs/security-audit.md).
--
-- A coordinator could pin three throwaway crises a few km apart, recognise a resident across the
-- three lists by their matched skills and availability, and intersect the distance rings to find
-- their stored 500 m cell. Nothing asked why, nothing slowed it down, and nothing recorded that a
-- list was read. This migration:
--
--   * stores a reason with every activation, under the same bounds as the break-glass reason;
--   * allows at most 3 activations per coordinator per rolling hour (`activation_rate_limited`).
--     Ended crises count too, so ending a probe does not free a slot;
--   * logs every read of a crisis list (`get_crisis_matches`, `get_team_candidates`) in
--     `crisis_list_views`: who, which crisis, which list, how many rows and when.
--
-- Expand only. `p_reason` is a new last parameter with a null default, so the code on `master`,
-- which sends no reason, keeps activating crises until the code that sends one is deployed. A
-- reason that is sent is always checked. A later contract migration makes the reason required
-- and `crises.reason` not null. Push this migration before merging the code that sends `p_reason`.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

alter table public.crises
  add column reason text check (reason is null or char_length(reason) between 10 and 500);

comment on column public.crises.reason is
  'Why the coordinator activated the crisis. Null only for crises activated before reasons were required.';

-- The rolling-hour throttle in activate_crisis.
create index crises_activated_by_activated_at_idx on public.crises (activated_by, activated_at);

-- One row per read of a crisis list. `viewed_by` has no FK to auth.users on purpose, like
-- `activated_by` and `revealed_by`: the record outlives the account and never blocks erasure.
-- No resident ids: the list a coordinator saw is the crisis snapshot, which `end_crisis` deletes.
create table public.crisis_list_views (
  id bigint generated always as identity primary key,
  crisis_id uuid not null references public.crises (id),
  viewed_by uuid not null,
  list text not null check (list in ('matches', 'teams')),
  returned_count integer not null,
  viewed_at timestamptz not null default now()
);

create index crisis_list_views_crisis_id_idx on public.crisis_list_views (crisis_id);
create index crisis_list_views_viewed_by_idx on public.crisis_list_views (viewed_by, viewed_at);

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

-- A new signature, so the old one goes: two overloads would make PostgREST calls ambiguous.
drop function public.activate_crisis(text, text, text, double precision, double precision, integer);

-- activate_crisis from 20261009120000, with the reason and the throttle. The ranking is unchanged.
create function public.activate_crisis(
  p_crisis_type text,
  p_location_source text,
  p_postcode text,
  p_lat double precision,
  p_lng double precision,
  p_radius_km integer,
  p_reason text default null
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
  v_reason text := btrim(p_reason);
begin
  if not public.is_coordinator() then
    raise exception 'not_coordinator';
  end if;

  -- Null only while the code that sends no reason is still deployed (see the header).
  if p_reason is not null and char_length(v_reason) < 10 then
    raise exception 'reason_required';
  end if;

  if char_length(v_reason) > 500 then
    raise exception 'reason_too_long';
  end if;

  -- Serialises one coordinator's activations, so two parallel requests cannot both pass the count.
  perform pg_advisory_xact_lock(hashtextextended('activate_crisis:' || (select auth.uid())::text, 0));

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

  insert into public.crises (crisis_type_slug, epicentre, epicentre_postcode, radius_m, activated_by, reason)
  values (v_type.slug, v_epicentre, v_postcode, v_radius_m, (select auth.uid()), v_reason)
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
    join public.profile_skills ps on ps.user_id = c.user_id
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

-- get_crisis_matches from 20261006120000, logged. Volatile now (it writes), so PostgREST runs it
-- in a read-write transaction.
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
    m.matched_skills,
    pc.user_id is not null,
    p.availability_slots,
    public.availability_covers(p.availability_slots, now())
  from public.crisis_matches m
  join public.profiles p on p.user_id = m.user_id
  left join public.profile_contacts pc on pc.user_id = m.user_id
  where m.crisis_id = p_crisis_id
    and not public.pause_active(p.paused_at, p.paused_until, now())
  order by m.position
  limit p_limit;

  get diagnostics v_count = row_count;

  insert into public.crisis_list_views (crisis_id, viewed_by, list, returned_count)
  values (p_crisis_id, (select auth.uid()), 'matches', v_count);
end;
$$;

-- get_team_candidates from 20261006120000, logged. Only a successful read is logged: the checks
-- above it raise before anything is returned.
create or replace function public.get_team_candidates(p_crisis_id uuid, p_template text, p_teams integer)
returns table (
  rank integer,
  "position" integer,
  distance_km_rounded numeric,
  role_skills jsonb,
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
  v_status text;
  v_slots integer;
  v_count integer;
begin
  if not public.is_coordinator() then
    raise exception 'not_coordinator';
  end if;

  select c.status into v_status from public.crises c where c.id = p_crisis_id;
  if not found then
    raise exception 'unknown_crisis';
  end if;

  if v_status <> 'active' then
    raise exception 'crisis_not_active';
  end if;

  select sum(r.slots) into v_slots from public.team_template_roles r where r.template_slug = p_template;
  if v_slots is null then
    raise exception 'unknown_template';
  end if;

  if p_teams is null or p_teams not between 1 and 10 then
    raise exception 'invalid_team_count';
  end if;

  return query
  with qualifying as (
    select
      m.user_id,
      m.position,
      trs.role_slug,
      jsonb_agg(
        jsonb_build_object('slug', ps.skill_slug, 'level', ps.level)
        order by coalesce(ps.level, 2) desc, ps.skill_slug
      ) as skills
    from public.crisis_matches m
    join public.profiles pr on pr.user_id = m.user_id
    join public.profile_skills ps on ps.user_id = m.user_id
    join public.team_role_skills trs
      on trs.skill_slug = ps.skill_slug
     and trs.template_slug = p_template
    where m.crisis_id = p_crisis_id
      and not public.pause_active(pr.paused_at, pr.paused_until, now())
    group by m.user_id, m.position, trs.role_slug
  ),
  bounded as (
    select q.*, row_number() over (partition by q.role_slug order by q.position) as role_rn
    from qualifying q
  ),
  kept as (
    select b.user_id, jsonb_object_agg(b.role_slug, b.skills) as role_skills
    from bounded b
    where b.role_rn <= p_teams * v_slots
    group by b.user_id
  )
  select
    m.rank,
    m.position,
    round(m.distance_m / 500.0) * 0.5,
    k.role_skills,
    pc.user_id is not null,
    p.availability_slots,
    public.availability_covers(p.availability_slots, now())
  from kept k
  join public.crisis_matches m on m.crisis_id = p_crisis_id and m.user_id = k.user_id
  left join public.profiles p on p.user_id = m.user_id
  left join public.profile_contacts pc on pc.user_id = m.user_id
  order by m.position;

  get diagnostics v_count = row_count;

  insert into public.crisis_list_views (crisis_id, viewed_by, list, returned_count)
  values (p_crisis_id, (select auth.uid()), 'teams', v_count);
end;
$$;

alter function public.activate_crisis(text, text, text, double precision, double precision, integer, text) owner to postgres;
alter function public.get_crisis_matches(uuid, integer) owner to postgres;
alter function public.get_team_candidates(uuid, text, integer) owner to postgres;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

-- No policies: only the security definer functions above write it, and nobody reads it through
-- the API. The owner reviews it in Studio.
alter table public.crisis_list_views enable row level security;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke all on public.crisis_list_views from anon, authenticated;

-- Supabase grants execute on new functions to anon and authenticated by default.
revoke execute on function public.activate_crisis(text, text, text, double precision, double precision, integer, text) from public, anon;
grant execute on function public.activate_crisis(text, text, text, double precision, double precision, integer, text) to authenticated;
