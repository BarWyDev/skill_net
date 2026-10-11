-- Meaningful reasons (security audit F-05, docs/security-audit.md).
--
-- The break-glass reason, and the activation reason from the activation audit migration, only had
-- to be 10 characters after `btrim`, which strips plain spaces alone. Ten zero-width spaces passed,
-- and so did "aaaaaaaaaa". `check_reason` now:
--
--   * turns every run of whitespace (Unicode spaces listed explicitly, so the rule does not depend
--     on the database locale), control and invisible formatting characters (zero-width spaces and
--     joiners, direction marks, the BOM, soft hyphens, fillers) into one space, then trims, so the
--     stored text is what a reader sees;
--   * keeps the 10–500 character bounds on that text;
--   * requires at least two words of three or more letters and at least four distinct letters.
--
-- No rule stops a coordinator who is willing to write a false reason; this only makes sure the
-- audit log holds words. The same rule lives in src/lib/reason.ts for the forms; change both
-- together. Existing log rows are left as they are.
--
-- Expand only: one new function and two replaced function bodies with unchanged signatures.

-- The normalised reason, or an exception: reason_required (missing, under 10 characters, or not
-- enough words) or reason_too_long (over 500 characters).
create function public.check_reason(p_reason text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_reason text := btrim(regexp_replace(
    p_reason,
    '[[:space:][:cntrl:]\u00a0\u00ad\u034f\u061c\u115f\u1160\u1680\u17b4\u17b5\u180b-\u180f\u2000-\u200f\u2028-\u202f\u205f-\u206f\u3000\u3164\ufe00-\ufe0f\ufeff\uffa0]+',
    ' ',
    'g'
  ));
begin
  if v_reason is null or char_length(v_reason) < 10 then
    raise exception 'reason_required';
  end if;

  if char_length(v_reason) > 500 then
    raise exception 'reason_too_long';
  end if;

  if (select count(*) from regexp_matches(v_reason, '[[:alpha:]]{3,}', 'g')) < 2
     or (
       select count(distinct letter)
       from regexp_split_to_table(lower(regexp_replace(v_reason, '[^[:alpha:]]', '', 'g')), '') as letter
     ) < 4 then
    raise exception 'reason_required';
  end if;

  return v_reason;
end;
$$;

-- reveal_crisis_contacts from 20261006120000, with check_reason. Everything else is unchanged.
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
      m.matched_skills,
      pc.phone,
      pc.phone_verified_at,
      p.availability_slots
    from public.crisis_matches m
    join public.profile_contacts pc on pc.user_id = m.user_id
    join public.profiles p on p.user_id = m.user_id
    where m.crisis_id = p_crisis_id
      and not public.pause_active(p.paused_at, p.paused_until, now())
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


-- activate_crisis from 20261010120000, with check_reason. Everything else is unchanged.
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


alter function public.check_reason(text) owner to postgres;
alter function public.reveal_crisis_contacts(uuid, text) owner to postgres;
alter function public.activate_crisis(text, text, text, double precision, double precision, integer, text) owner to postgres;

-- Supabase grants execute on new functions to anon and authenticated by default. Only the security
-- definer functions above call it.
revoke execute on function public.check_reason(text) from public, anon, authenticated;
