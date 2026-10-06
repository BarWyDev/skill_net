-- Pause and resume availability (roadmap S-13, FR-019).
--
-- A resident can pause their availability without deleting the account, and resume it later.
-- Pause is state on `profiles` plus one pure predicate evaluated at read time; no job runs when a
-- pause ends. Every guarantee lives here, so any write path (the RPCs, a direct PostgREST update
-- allowed by RLS, an admin script) and every read path get it:
--   * a pause "until D" holds through the whole of day D on the Europe/Warsaw calendar and ends at
--     00:00 on D+1; a pause with no end date holds until the resident resumes (`pause_active`);
--   * the end date lies between Warsaw today and today + 365 days, checked by a trigger because
--     the owner has table-level update on `profiles`;
--   * `profile_is_matchable` excludes a paused resident, so they are out of every newly activated
--     crisis and every density-map square. S-07's alert sender must use the same rule;
--   * in an active crisis the snapshot row stays, but `get_crisis_matches`, `reveal_crisis_contacts`
--     and `get_team_candidates` skip it. The reveal filters inside the `revealed` CTE, so the
--     logged set still equals the shown set. A resume brings the resident back at the same
--     `position`;
--   * `visible_match_count` gives coordinators the count of the people they can actually see in an
--     active crisis (paused and erased residents excluded), and the frozen `match_count` for an
--     ended one. Nothing tells a coordinator that someone paused;
--   * `profile_is_complete` keeps the old matchable rule (a location and a skill) for the
--     resident's own "complete profile" banner.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column paused_at timestamptz,
  add column paused_until date,
  add constraint profiles_pause_until_needs_pause check (paused_until is null or paused_at is not null);

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

-- Whether a pause is in effect at p_at. Day p_paused_until is included in full, on the
-- Europe/Warsaw calendar. A null p_paused_until means no end date.
create function public.pause_active(p_paused_at timestamptz, p_paused_until date, p_at timestamptz)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select p_paused_at is not null
    and (p_paused_until is null or p_paused_until >= (p_at at time zone 'Europe/Warsaw')::date)
$$;

-- The S-01 eligibility rule, unchanged: a location and at least one skill. It drives the
-- resident's own "complete profile" banner now that matchable also depends on a pause.
create function public.profile_is_complete(p_user_id uuid)
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
      and exists (select 1 from public.profile_skills s where s.user_id = p.user_id)
  )
$$;

-- Eligibility contract: a complete profile with no active pause. Security invoker, as before.
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
      and exists (select 1 from public.profile_skills s where s.user_id = p.user_id)
      and not public.pause_active(p.paused_at, p.paused_until, now())
  )
$$;

-- Pauses the caller's availability until p_until inclusive (null: no end date). Re-pausing
-- overwrites the previous pause. Raises `not_authenticated`, `profile_required` (no profile row)
-- and, from the trigger, `invalid_pause_until`.
create function public.pause_my_availability(p_until date)
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

  update public.profiles
  set paused_at = now(), paused_until = p_until
  where user_id = v_user_id;

  if not found then
    raise exception 'profile_required';
  end if;
end;
$$;

-- Ends the caller's pause. Idempotent: resuming an unpaused profile changes nothing.
create function public.resume_my_availability()
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

  update public.profiles
  set paused_at = null, paused_until = null
  where user_id = v_user_id
    and paused_at is not null;
end;
$$;

-- The caller's profile, or an empty profile when there is no row yet. `complete` is the old
-- location-and-skill rule; `matchable` is false while a pause is active. `paused_until` is the end
-- date of an active pause, or null when the pause has no end date or none is active.
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
        select jsonb_agg(jsonb_build_object('slug', s.skill_slug, 'level', s.level) order by s.skill_slug)
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
    'availability_slots', p.availability_slots
  )
  from (select auth.uid() as user_id) as me
  left join public.profiles p on p.user_id = me.user_id
  left join public.profile_contacts c on c.user_id = me.user_id
$$;

-- The display-ready ranked list of a crisis, as in 20261003120000, without residents whose pause
-- is active. Their snapshot row stays, so a resume restores the same `position`.
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
end;
$$;

-- The break-glass reveal, as in 20261004130000, without residents whose pause is active. The
-- filter sits inside `revealed`, so they are neither shown nor logged as subjects.
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
  v_reason text := btrim(p_reason);
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

  if v_reason is null or char_length(v_reason) < 10 then
    raise exception 'reason_required';
  end if;

  if char_length(v_reason) > 500 then
    raise exception 'reason_too_long';
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

-- Team candidates, as in 20261004140000, without residents whose pause is active. The filter sits
-- in `qualifying`, so each role's bound counts only people the coordinator can see.
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
stable
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_slots integer;
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
end;
$$;

-- PostgREST computed column `visible_match_count` on `crises`: the number of people a coordinator
-- sees in an active crisis's list (snapshot rows whose resident is not paused; erased residents
-- are already gone from the snapshot), or the frozen `match_count` of an ended crisis. 0 for
-- anyone who is not a coordinator.
create function public.visible_match_count(p_crisis public.crises)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_coordinator() then
    return 0;
  end if;

  if p_crisis.status <> 'active' then
    return p_crisis.match_count;
  end if;

  return (
    select count(*)::integer
    from public.crisis_matches m
    join public.profiles p on p.user_id = m.user_id
    where m.crisis_id = p_crisis.id
      and not public.pause_active(p.paused_at, p.paused_until, now())
  );
end;
$$;

alter function public.get_crisis_matches(uuid, integer) owner to postgres;
alter function public.reveal_crisis_contacts(uuid, text) owner to postgres;
alter function public.get_team_candidates(uuid, text, integer) owner to postgres;
alter function public.visible_match_count(public.crises) owner to postgres;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- A new end date must lie between Warsaw today and today + 365 days, whoever writes it. An
-- unchanged pause is not re-checked, so an expired end date never blocks a profile save.
create function public.profiles_check_pause()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Europe/Warsaw')::date;
begin
  if new.paused_until is not null
     and (
       tg_op = 'INSERT'
       or new.paused_until is distinct from old.paused_until
       or new.paused_at is distinct from old.paused_at
     )
     and new.paused_until not between v_today and v_today + 365 then
    raise exception 'invalid_pause_until';
  end if;
  return new;
end;
$$;

create trigger profiles_check_pause
before insert or update on public.profiles
for each row execute function public.profiles_check_pause();

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

-- Supabase grants execute on new functions to anon and authenticated by default.
revoke execute on function public.profile_is_complete(uuid) from public, anon;
revoke execute on function public.pause_my_availability(date) from public, anon;
revoke execute on function public.resume_my_availability() from public, anon;
revoke execute on function public.visible_match_count(public.crises) from public, anon;
grant execute on function public.profile_is_complete(uuid) to authenticated;
grant execute on function public.pause_my_availability(date) to authenticated;
grant execute on function public.resume_my_availability() to authenticated;
grant execute on function public.visible_match_count(public.crises) to authenticated;
grant execute on function public.pause_active(timestamptz, date, timestamptz) to anon, authenticated;
