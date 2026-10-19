-- Data visibility controls (roadmap S-12, FR-006).
--
-- A resident chooses which of their data is visible, and in which mode. The owner accepted the
-- visibility matrix on 2026-10-19 (context/changes/data-visibility-controls/
-- visibility-matrix-proposal.md, decisions D1–D8): four switches, all on by default, so existing
-- residents keep today's behaviour. As with the pause (S-13), state lives on `profiles` and
-- `profile_skills`, and every guarantee lives here, so any write path and every read path get it:
--   * V1 `profiles.show_on_map`: off, the resident is not counted on the public density map. Map
--     eligibility is now `profile_counts_on_map`, separate from crisis eligibility. The map reads
--     a daily snapshot, so the change shows from the next Warsaw-day refresh, never at once;
--   * V2 `profile_skills.use_in_crisis`, per skill: off, the skill takes no part in matching,
--     score, teams or `matched_skills`. `profile_is_matchable` needs at least one skill with V2
--     on, so a resident with every skill hidden leaves new crises, but still counts on the map
--     (D5). S-07's alert sender must take its audience from `profile_is_matchable` and alert only
--     on skills with `use_in_crisis`;
--   * V3 `profiles.show_availability_in_crisis`: off, the coordinator gets availability as "not
--     declared" (null slots, null "available now"). The ranking never used it;
--   * V4 `profiles.allow_contact_reveal`: off, break-glass skips the resident's number and does
--     not log them as a subject. The list still shows that they have a phone, and
--     `reveal_declined_count` tells the coordinator how many declined, never who (D3);
--   * in an active crisis every switch applies at read time (D6). `crisis_visible_skills` is the
--     one definition of a visible snapshot row: its `matched_skills` reduced to the skills the
--     resident still has with V2 on, or null. The list, the teams (a subset of the list), the
--     reveal (inside the `revealed` CTE, so the logged set still equals the shown set) and
--     `visible_match_count` all use it. The snapshot `position` and score stay from activation,
--     so turning a skill back on restores the same position;
--   * a new consent version, for the `/prywatnosc` wording that describes the switches (D8).
--
-- Expand only: new columns with defaults, replaced function bodies, a new computed column and
-- one dropped-and-recreated `save_my_profile` whose three new trailing parameters default to
-- null ("unchanged"), so the 7-argument named call from the code on `master` keeps working. Push
-- this migration before merging the code that uses the new consent version.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column show_on_map boolean not null default true,
  add column show_availability_in_crisis boolean not null default true,
  add column allow_contact_reveal boolean not null default true;

alter table public.profile_skills
  add column use_in_crisis boolean not null default true;

-- ---------------------------------------------------------------------------
-- Consent version
-- ---------------------------------------------------------------------------

insert into public.consent_versions (version) values ('2026-10-19');

-- ---------------------------------------------------------------------------
-- Eligibility
-- ---------------------------------------------------------------------------

-- Map eligibility (V1): a location, at least one skill whatever its crisis use, no active pause,
-- a consent row, and the map switch on. Security invoker, like profile_is_matchable.
create function public.profile_counts_on_map(p_user_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = p_user_id
      and p.show_on_map
      and p.location is not null
      and exists (select 1 from public.profile_skills s where s.user_id = p.user_id)
      and not public.pause_active(p.paused_at, p.paused_until, now())
      and exists (select 1 from public.consent_events c where c.user_id = p.user_id)
  )
$$;

-- Crisis eligibility: as in 20261006140000, but the skill must be one the resident lets crises
-- use (V2). It ignores the map switch. Security invoker, as before.
create or replace function public.profile_is_matchable(p_user_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = p_user_id
      and p.location is not null
      and exists (select 1 from public.profile_skills s where s.user_id = p.user_id and s.use_in_crisis)
      and not public.pause_active(p.paused_at, p.paused_until, now())
      and exists (select 1 from public.consent_events c where c.user_id = p.user_id)
  )
$$;

-- The elements of a snapshot's `matched_skills` whose skill the resident still has with V2 on, in
-- their snapshot order, or null when none remain. A null result means the row is hidden from
-- every crisis reader. A skill removed from the profile disappears as well: hidden = not used.
create function public.crisis_visible_skills(p_user_id uuid, p_matched jsonb)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_agg(e.skill order by e.ord)
  from jsonb_array_elements(p_matched) with ordinality as e(skill, ord)
  where exists (
    select 1
    from public.profile_skills ps
    where ps.user_id = p_user_id
      and ps.skill_slug = e.skill ->> 'slug'
      and ps.use_in_crisis
  )
$$;

-- ---------------------------------------------------------------------------
-- The density map
-- ---------------------------------------------------------------------------

-- refresh_skills_density from 20261011130000, on map eligibility (V1) instead of crisis
-- eligibility. The category filter still counts every skill, whatever its crisis use (D5).
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
    where public.profile_counts_on_map(p.user_id)
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

-- ---------------------------------------------------------------------------
-- New crises
-- ---------------------------------------------------------------------------

-- activate_crisis from 20261011120000. Only skills with V2 on are matched, so a hidden skill never
-- enters `matched_skills` or the score. Everything else is unchanged.
create or replace function public.activate_crisis(
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

-- ---------------------------------------------------------------------------
-- Active-crisis readers
-- ---------------------------------------------------------------------------

-- get_crisis_matches from 20261010120000. A row is shown only when the resident is not paused and
-- still has a matched skill with V2 on; `matched_skills` holds only those skills. Availability is
-- null when V3 is off. The logged count is the filtered count.
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
  limit p_limit;

  get diagnostics v_count = row_count;

  insert into public.crisis_list_views (crisis_id, viewed_by, list, returned_count)
  values (p_crisis_id, (select auth.uid()), 'matches', v_count);
end;
$$;

-- get_team_candidates from 20261010120000. A candidate must be a visible row of the list (teams
-- are a subset of it), and role skills come only from skills with V2 on, so a role skill outside
-- the crisis matrix cannot bring back someone the list hides. Availability is null when V3 is off.
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
    join public.profile_skills ps on ps.user_id = m.user_id and ps.use_in_crisis
    join public.team_role_skills trs
      on trs.skill_slug = ps.skill_slug
     and trs.template_slug = p_template
    where m.crisis_id = p_crisis_id
      and not public.pause_active(pr.paused_at, pr.paused_until, now())
      and public.crisis_visible_skills(m.user_id, m.matched_skills) is not null
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
    a.slots,
    public.availability_covers(a.slots, now())
  from kept k
  join public.crisis_matches m on m.crisis_id = p_crisis_id and m.user_id = k.user_id
  left join public.profiles p on p.user_id = m.user_id
  cross join lateral (select case when p.show_availability_in_crisis then p.availability_slots end as slots) a
  left join public.profile_contacts pc on pc.user_id = m.user_id
  order by m.position;

  get diagnostics v_count = row_count;

  insert into public.crisis_list_views (crisis_id, viewed_by, list, returned_count)
  values (p_crisis_id, (select auth.uid()), 'teams', v_count);
end;
$$;

-- reveal_crisis_contacts from 20261011120000. The `revealed` CTE also requires V4 on and a visible
-- row, so a resident who declined, or whose matched skills are all hidden, is neither shown nor
-- logged as a subject. `matched_skills` holds only visible skills; availability is null when V3 is
-- off. The logged subjects, `revealed_count` and the returned rows remain one set.
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
  v_reason text;
  v_event_id bigint;
begin
  if not public.is_coordinator() then
    raise exception 'not_coordinator';
  end if;

  -- FOR SHARE serialises with end_crisis (FOR UPDATE): the reveal either finishes before the
  -- crisis ends or sees it ended, and never reads a half-deleted snapshot.
  select c.status into v_status from public.crises c where c.id = p_crisis_id for share;
  if not found then
    raise exception 'unknown_crisis';
  end if;

  if v_status <> 'active' then
    raise exception 'crisis_not_active';
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

-- PostgREST computed column `visible_match_count` on `crises`, from 20261006130000: the number of
-- rows `get_crisis_matches` would return in an active crisis (not paused, a matched skill still
-- visible), or the frozen `match_count` of an ended crisis. 0 for anyone who is not a coordinator.
create or replace function public.visible_match_count(public.crises)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_crisis alias for $1;
begin
  if not public.is_coordinator() then
    return 0;
  end if;

  if v_crisis.status <> 'active' then
    return v_crisis.match_count;
  end if;

  return (
    select count(*)::integer
    from public.crisis_matches m
    join public.profiles p on p.user_id = m.user_id
    where m.crisis_id = v_crisis.id
      and not public.pause_active(p.paused_at, p.paused_until, now())
      and public.crisis_visible_skills(m.user_id, m.matched_skills) is not null
  );
end;
$$;

-- PostgREST computed column `reveal_declined_count` on `crises`: in an active crisis, the number of
-- visible rows whose resident has a phone but declined an emergency reveal (V4 off). It never says
-- who. 0 for an ended crisis and for anyone who is not a coordinator. The parameter is unnamed so
-- `supabase gen types` recognises the computed column (see 20261006130000).
create function public.reveal_declined_count(public.crises)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_crisis alias for $1;
begin
  if not public.is_coordinator() or v_crisis.status <> 'active' then
    return 0;
  end if;

  return (
    select count(*)::integer
    from public.crisis_matches m
    join public.profiles p on p.user_id = m.user_id
    join public.profile_contacts pc on pc.user_id = m.user_id
    where m.crisis_id = v_crisis.id
      and not p.allow_contact_reveal
      and not public.pause_active(p.paused_at, p.paused_until, now())
      and public.crisis_visible_skills(m.user_id, m.matched_skills) is not null
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Profile RPCs
-- ---------------------------------------------------------------------------

-- The signature changes, so the 7-argument version must go: `create or replace` would leave it
-- callable as a second overload, and PostgREST could not choose between them.
drop function public.save_my_profile(text, text, double precision, double precision, jsonb, text, integer);

-- save_my_profile from 20261003120000, with the switches. p_skills: [{"slug": text,
-- "level": int | null, "crisis": bool}], where a missing or null "crisis" means true (V2 on).
-- p_show_on_map (V1), p_show_availability_in_crisis (V3) and p_allow_contact_reveal (V4): null
-- leaves the stored value unchanged, so a caller that sends only the first seven arguments keeps
-- working.
--
-- Every location write goes through UPDATE, so the location trigger can see `old` (see
-- 20260927150000_profile_postcode_never_stored.sql).
create function public.save_my_profile(
  p_location_source text,
  p_postcode text,
  p_lat double precision,
  p_lng double precision,
  p_skills jsonb,
  p_phone text,
  p_availability_slots integer,
  p_show_on_map boolean default null,
  p_show_availability_in_crisis boolean default null,
  p_allow_contact_reveal boolean default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  insert into public.profiles (user_id) values (v_user_id)
  on conflict (user_id) do nothing;

  update public.profiles
  set location_source = p_location_source,
      postcode = case when p_location_source = 'postcode' then p_postcode end,
      location = case
        when p_location_source = 'pin' and p_lat is not null and p_lng is not null
          then extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography
      end,
      availability_slots = nullif(p_availability_slots, 0),
      show_on_map = coalesce(p_show_on_map, show_on_map),
      show_availability_in_crisis = coalesce(p_show_availability_in_crisis, show_availability_in_crisis),
      allow_contact_reveal = coalesce(p_allow_contact_reveal, allow_contact_reveal)
  where user_id = v_user_id;

  delete from public.profile_skills where user_id = v_user_id;

  insert into public.profile_skills (user_id, skill_slug, level, use_in_crisis)
  select v_user_id, e ->> 'slug', (e ->> 'level')::smallint, coalesce((e ->> 'crisis')::boolean, true)
  from jsonb_array_elements(coalesce(p_skills, '[]'::jsonb)) as e;

  if nullif(p_phone, '') is null then
    delete from public.profile_contacts where user_id = v_user_id;
  else
    if p_phone !~ '^\+48[4-8]\d{8}$' then
      raise exception 'invalid_phone';
    end if;

    -- An unchanged number keeps its verification; a changed one is reset by the trigger.
    insert into public.profile_contacts (user_id, phone) values (v_user_id, p_phone)
    on conflict (user_id) do update set phone = excluded.phone;
  end if;
end;
$$;

-- get_my_profile from 20261006120000, with the switches: `crisis` on each skill (V2) and the three
-- profile switches, which read as on when there is no profile row yet. `matchable` follows the new
-- crisis rule (false when every skill is hidden from crises); `complete` is unchanged.
create or replace function public.get_my_profile()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'location_source', p.location_source,
    'lat', extensions.st_y(p.location::extensions.geometry),
    'lng', extensions.st_x(p.location::extensions.geometry),
    'skills', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object('slug', s.skill_slug, 'level', s.level, 'crisis', s.use_in_crisis)
          order by s.skill_slug
        )
        from public.profile_skills s
        where s.user_id = me.user_id
      ),
      '[]'::jsonb
    ),
    'matchable', public.profile_is_matchable(me.user_id),
    'complete', public.profile_is_complete(me.user_id),
    'paused', public.pause_active(p.paused_at, p.paused_until, now()),
    'paused_until', case when public.pause_active(p.paused_at, p.paused_until, now()) then p.paused_until end,
    'phone', c.phone,
    'phone_verified', c.phone_verified_at is not null,
    'availability_slots', p.availability_slots,
    'show_on_map', coalesce(p.show_on_map, true),
    'show_availability_in_crisis', coalesce(p.show_availability_in_crisis, true),
    'allow_contact_reveal', coalesce(p.allow_contact_reveal, true)
  )
  from (select auth.uid() as user_id) as me
  left join public.profiles p on p.user_id = me.user_id
  left join public.profile_contacts c on c.user_id = me.user_id
$$;

alter function public.refresh_skills_density(text) owner to postgres;
alter function public.activate_crisis(text, text, text, double precision, double precision, integer, text) owner to postgres;
alter function public.get_crisis_matches(uuid, integer) owner to postgres;
alter function public.get_team_candidates(uuid, text, integer) owner to postgres;
alter function public.reveal_crisis_contacts(uuid, text) owner to postgres;
alter function public.visible_match_count(public.crises) owner to postgres;
alter function public.reveal_declined_count(public.crises) owner to postgres;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

-- Supabase grants execute on new functions to anon and authenticated by default. The two helpers
-- are called only from the security definer functions above.
revoke execute on function public.profile_counts_on_map(uuid) from public, anon, authenticated;
revoke execute on function public.crisis_visible_skills(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.reveal_declined_count(public.crises) from public, anon;
grant execute on function public.reveal_declined_count(public.crises) to authenticated;
revoke execute on function public.save_my_profile(text, text, double precision, double precision, jsonb, text, integer, boolean, boolean, boolean) from public, anon;
grant execute on function public.save_my_profile(text, text, double precision, double precision, jsonb, text, integer, boolean, boolean, boolean) to authenticated;
