-- Neighbour courses (roadmap S-17, FR-020).
--
-- A resident offers a free course tied to one of their skills; signed-in neighbours see it without
-- the organiser's identity, with its place only as the 2 km square of the public map, and sign up
-- in the app. The organiser sees how many people signed up and gives them the meeting place and
-- time through `meeting_details`, which only active sign-ups can read.
--
--   * Both tables grant nothing to clients: a course row carries the organiser's id, which no other
--     client may read. Every read and write goes through the security-definer RPCs below, so the
--     rules live here once and no trigger has to repeat them (audit F-07).
--   * A course is visible to a viewer only when it is open and opened or renewed within 90 days;
--     its organiser is not paused, still holds the skill and has a location unchanged for 7 days;
--     the organiser's current square is in today's all-skills density snapshot (k = 5, the map's
--     own rule, audit F-03); the viewer is eligible and not the organiser; and the square is at
--     most one square from the viewer's in both axes. `course_hidden_reason` and
--     `course_visible_to` are the one definition of that rule.
--   * Eligible means a location unchanged for 7 days, a confirmed email, an account at least 14
--     days old and a consent row. The 7 days stop a resident from moving their pin around to
--     browse other areas square by square: `profiles.location_changed_at` is new, owned by the
--     server for client writes, and null for locations set before this migration (they count as
--     settled).
--   * A course references `skills`, not `profile_skills`: `save_my_profile` deletes and re-inserts
--     every skill on each save, so a cascade from `profile_skills` would wipe courses. Whether the
--     organiser still holds the skill is checked at read time.
--   * Limits: 3 open, unexpired courses per organiser; 10 sign-ups per rolling hour per resident
--     (withdrawing keeps the row, so a sign-up/withdraw loop still counts); an optional capacity
--     of 1–50, checked under a row lock.
--   * The lazy daily refresh of the density snapshot moves from `get_skills_density` into
--     `ensure_skills_density_fresh`, so a course list read on a day nobody opened the map does not
--     use yesterday's snapshot.
--   * A new consent version for the `/prywatnosc` wording that describes courses.
--
-- Expand only: two new tables, one nullable column, new functions, two replaced function bodies
-- with unchanged signatures and one consent version row. Push this migration before merging the
-- code that sends the new consent version.

-- ---------------------------------------------------------------------------
-- Location changes
-- ---------------------------------------------------------------------------

alter table public.profiles add column location_changed_at timestamptz;

comment on column public.profiles.location_changed_at is
  'When the coarsened location last changed through a client write. Null: set before tracking began (counts as settled). Neighbour courses need 7 days.';

-- profiles_server_timestamps from 20261010140000, plus `location_changed_at`. Client writes (anon,
-- authenticated, which includes the security-invoker save_my_profile) cannot set it: it becomes
-- now() when the coarsened point changes and keeps its old value otherwise. Before-triggers fire
-- in name order, so profiles_resolve_and_coarsen has already produced the final point. Writes as
-- postgres (migrations, tests, Studio) may set it freely.
create or replace function public.profiles_server_timestamps()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    if new.paused_at is not null then
      new.paused_at := now();
    end if;
    if current_user in ('anon', 'authenticated') then
      new.location_changed_at := case when new.location is not null then now() end;
    end if;
  else
    new.created_at := old.created_at;
    if new.paused_at is not null and new.paused_at is distinct from old.paused_at then
      new.paused_at := now();
    end if;
    if current_user in ('anon', 'authenticated') then
      -- geography `=` compares bounding boxes; the text form is the exact EWKB.
      new.location_changed_at := case
        when new.location::text is distinct from old.location::text then now()
        else old.location_changed_at
      end;
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  organiser_id uuid not null references public.profiles (user_id) on delete cascade,
  -- Deliberately not a foreign key to profile_skills (see the header).
  skill_slug text not null references public.skills (slug),
  title text not null,
  description text not null,
  duration_minutes integer not null check (duration_minutes between 15 and 480 and duration_minutes % 15 = 0),
  capacity integer check (capacity between 1 and 50),
  meeting_details text,
  is_open boolean not null default true,
  opened_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index courses_organiser_id_idx on public.courses (organiser_id);

create table public.course_signups (
  course_id uuid not null references public.courses (id) on delete cascade,
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  signed_up_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  primary key (course_id, user_id)
);

create index course_signups_user_id_signed_up_at_idx on public.course_signups (user_id, signed_up_at);

-- RLS on with no policies, and no client privileges (audit F-12): only the RPCs read these.
alter table public.courses enable row level security;
alter table public.course_signups enable row level security;
revoke all on public.courses, public.course_signups from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Helpers (internal: no client may execute them)
-- ---------------------------------------------------------------------------

-- Course text after normalisation, or an exception: <field>_invalid (length) or <field>_contact
-- (a phone number or an email address). Whitespace and invisible characters are folded exactly as
-- in check_reason. A phone number is a run of at least 9 digits separated by at most one space or
-- dash, so "600 100 200", "600-100-200" and "+48600100200" are refused, while dates and times such
-- as "21.10.2026, 10:00-12:00" pass (a dot or colon ends the run; "600.100.200" passes too, an
-- accepted cost). With p_min = 0 an empty text is null. The same rule lives in
-- src/lib/course-text.ts for the forms; change both together.
create function public.check_course_text(p_text text, p_min integer, p_max integer, p_field text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_text text := btrim(regexp_replace(
    coalesce(p_text, ''),
    '[[:space:][:cntrl:] ­͏؜ᅟᅠ ឴឵᠋-᠏ -‏ -  -⁯　ㅤ︀-️﻿ﾠ]+',
    ' ',
    'g'
  ));
begin
  if v_text = '' and p_min = 0 then
    return null;
  end if;

  if char_length(v_text) < p_min or char_length(v_text) > p_max then
    raise exception '%_invalid', p_field;
  end if;

  if v_text ~ '[0-9]([ -]?[0-9]){8,}' or v_text ~ '[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+' then
    raise exception '%_contact', p_field;
  end if;

  return v_text;
end;
$$;

-- The 2 km square (EPSG:2180) of a point: the one copy of the density functions' expression for
-- new code. The density functions keep their inline copy.
create function public.density_square(p_location extensions.geography)
returns table (sx integer, sy integer)
language sql
stable
set search_path = ''
as $$
  select
    floor(extensions.st_x(g) / 2000)::integer,
    floor(extensions.st_y(g) / 2000)::integer
  from (select extensions.st_transform(p_location::extensions.geometry, 2180) as g) as t
$$;

-- The lazy refresh from get_skills_density (20261011130000): recompute a category's snapshot when
-- it was last refreshed on an earlier Warsaw day. One refresher per category; anyone else keeps
-- the previous snapshot.
create function public.ensure_skills_density_fresh(p_category text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_key text := coalesce(p_category, '');
  v_refreshed_at timestamptz;
begin
  select r.refreshed_at into v_refreshed_at from public.skills_density_refreshes r where r.category = v_key;

  if (
       v_refreshed_at is null
       or (v_refreshed_at at time zone 'Europe/Warsaw')::date < (now() at time zone 'Europe/Warsaw')::date
     )
     and pg_try_advisory_xact_lock(hashtextextended('skills_density:' || v_key, 0)) then
    perform public.refresh_skills_density(p_category);
  end if;
end;
$$;

-- Whether a resident may view, create and sign up for courses: 'ok', or the first missing
-- condition. Order: no_location, recent_move, too_new, unconfirmed, no_consent.
create function public.course_resident_eligible(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p.location is null then 'no_location'
    when p.location_changed_at > now() - interval '7 days' then 'recent_move'
    when u.created_at > now() - interval '14 days' then 'too_new'
    when u.email_confirmed_at is null then 'unconfirmed'
    when not exists (select 1 from public.consent_events c where c.user_id = p_user_id) then 'no_consent'
    else 'ok'
  end
  from (select p_user_id as id) as me
  left join auth.users u on u.id = me.id
  left join public.profiles p on p.user_id = me.id
$$;

-- The day a resident becomes eligible when they only wait for time (too_new, recent_move), on the
-- Warsaw calendar; null otherwise.
create function public.course_eligible_on(p_user_id uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select ((case public.course_resident_eligible(p_user_id)
    when 'recent_move' then p.location_changed_at + interval '7 days'
    when 'too_new' then u.created_at + interval '14 days'
  end) at time zone 'Europe/Warsaw')::date
  from public.profiles p
  join auth.users u on u.id = p.user_id
  where p.user_id = p_user_id
$$;

-- Why a course is hidden from every neighbour, or null when it is visible to eligible residents
-- around its square. Checked in this order: closed, expired (90 days after opening or renewal),
-- paused, skill_removed, no_location, recent_move, square_hidden (not in today's all-skills
-- snapshot). The caller refreshes the snapshot first (ensure_skills_density_fresh).
create function public.course_hidden_reason(p_course public.courses)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not p_course.is_open then 'closed'
    when p_course.opened_at <= now() - interval '90 days' then 'expired'
    when public.pause_active(p.paused_at, p.paused_until, now()) then 'paused'
    when not exists (
      select 1 from public.profile_skills s
      where s.user_id = p_course.organiser_id and s.skill_slug = p_course.skill_slug
    ) then 'skill_removed'
    when p.location is null then 'no_location'
    when p.location_changed_at > now() - interval '7 days' then 'recent_move'
    when not exists (
      select 1
      from public.density_square(p.location) q
      join public.skills_density_cells c on c.category = '' and c.sx = q.sx and c.sy = q.sy
    ) then 'square_hidden'
  end
  from public.profiles p
  where p.user_id = p_course.organiser_id
$$;

-- The visibility rule: the course is not hidden, the viewer is eligible and is not the organiser,
-- and the course's square is at most one square from the viewer's in both axes.
create function public.course_visible_to(p_course public.courses, p_viewer uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_course.organiser_id <> p_viewer
    and public.course_hidden_reason(p_course) is null
    and public.course_resident_eligible(p_viewer) = 'ok'
    and exists (
      select 1
      from public.profiles o
      cross join lateral public.density_square(o.location) oq
      join public.profiles v on v.user_id = p_viewer
      cross join lateral public.density_square(v.location) vq
      where o.user_id = p_course.organiser_id
        and abs(oq.sx - vq.sx) <= 1
        and abs(oq.sy - vq.sy) <= 1
    )
$$;

-- The GeoJSON polygon (WGS84, 6 decimals) of a block of squares from (sx0, sy0), n squares wide.
create function public.density_block_geojson(p_sx integer, p_sy integer, p_n integer)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select extensions.st_asgeojson(
    extensions.st_transform(
      extensions.st_makeenvelope(p_sx * 2000, p_sy * 2000, (p_sx + p_n) * 2000, (p_sy + p_n) * 2000, 2180),
      4326
    ),
    6
  )::jsonb
$$;

-- Active (not withdrawn) sign-ups of a course.
create function public.course_active_signups(p_course_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.course_signups s where s.course_id = p_course_id and s.withdrawn_at is null
$$;

-- Open, unexpired courses of an organiser (the 3-course limit).
create function public.course_open_count(p_organiser_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.courses c
  where c.organiser_id = p_organiser_id
    and c.is_open
    and c.opened_at > now() - interval '90 days'
$$;

-- The density snapshot from the map, refreshed through the helper. Same signature and grants.
create or replace function public.get_skills_density(p_category text default null)
returns table (cell jsonb, band smallint)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_key text := coalesce(p_category, '');
begin
  if p_category is not null
     and not exists (select 1 from public.skill_categories c where c.slug = p_category) then
    raise exception 'unknown_category';
  end if;

  perform public.ensure_skills_density_fresh(p_category);

  return query
  select c.cell, c.band
  from public.skills_density_cells c
  where c.category = v_key
  order by c.sx, c.sy;
end;
$$;

-- ---------------------------------------------------------------------------
-- Organiser RPCs
-- ---------------------------------------------------------------------------

create function public.create_course(
  p_skill_slug text,
  p_title text,
  p_description text,
  p_duration_minutes integer,
  p_capacity integer,
  p_meeting_details text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_eligible text;
  v_id uuid;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  v_eligible := public.course_resident_eligible(v_user_id);
  if v_eligible <> 'ok' then
    raise exception 'course_%', v_eligible;
  end if;

  if not exists (select 1 from public.profile_skills s where s.user_id = v_user_id and s.skill_slug = p_skill_slug) then
    raise exception 'course_skill_not_held';
  end if;

  if p_duration_minutes is null or p_duration_minutes not between 15 and 480 or p_duration_minutes % 15 <> 0 then
    raise exception 'course_duration_invalid';
  end if;

  if p_capacity is not null and p_capacity not between 1 and 50 then
    raise exception 'course_capacity_invalid';
  end if;

  -- Serialises one organiser's writes, so two parallel requests cannot both pass the count.
  perform pg_advisory_xact_lock(hashtextextended('course_open:' || v_user_id::text, 0));

  if public.course_open_count(v_user_id) >= 3 then
    raise exception 'course_limit_reached';
  end if;

  -- Closed and expired courses stay until deleted, so the total is capped too.
  if (select count(*) from public.courses c where c.organiser_id = v_user_id) >= 20 then
    raise exception 'course_total_limit_reached';
  end if;

  insert into public.courses (organiser_id, skill_slug, title, description, duration_minutes, capacity, meeting_details)
  values (
    v_user_id,
    p_skill_slug,
    public.check_course_text(p_title, 5, 80, 'title'),
    public.check_course_text(p_description, 20, 1000, 'description'),
    p_duration_minutes,
    p_capacity,
    public.check_course_text(p_meeting_details, 0, 500, 'meeting')
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- The skill is fixed; everything else may change. A capacity under the active sign-ups is refused.
create function public.update_course(
  p_id uuid,
  p_title text,
  p_description text,
  p_duration_minutes integer,
  p_capacity integer,
  p_meeting_details text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  perform 1 from public.courses c where c.id = p_id and c.organiser_id = v_user_id for update;
  if not found then
    raise exception 'course_not_found';
  end if;

  if p_duration_minutes is null or p_duration_minutes not between 15 and 480 or p_duration_minutes % 15 <> 0 then
    raise exception 'course_duration_invalid';
  end if;

  if p_capacity is not null and p_capacity not between 1 and 50 then
    raise exception 'course_capacity_invalid';
  end if;

  if p_capacity is not null and p_capacity < public.course_active_signups(p_id) then
    raise exception 'course_capacity_below_signups';
  end if;

  update public.courses
  set title = public.check_course_text(p_title, 5, 80, 'title'),
      description = public.check_course_text(p_description, 20, 1000, 'description'),
      duration_minutes = p_duration_minutes,
      capacity = p_capacity,
      meeting_details = public.check_course_text(p_meeting_details, 0, 500, 'meeting')
  where id = p_id;
end;
$$;

-- Close (stop showing and accepting sign-ups) or reopen. Reopening an unexpired course counts
-- against the 3-course limit.
create function public.set_course_open(p_id uuid, p_open boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_course public.courses;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('course_open:' || v_user_id::text, 0));

  select * into v_course from public.courses c where c.id = p_id and c.organiser_id = v_user_id for update;
  if not found then
    raise exception 'course_not_found';
  end if;

  if p_open and not v_course.is_open
     and v_course.opened_at > now() - interval '90 days'
     and public.course_open_count(v_user_id) >= 3 then
    raise exception 'course_limit_reached';
  end if;

  update public.courses set is_open = coalesce(p_open, is_open) where id = p_id;
end;
$$;

-- Restart the 90 days. Renewing an open, expired course counts against the 3-course limit.
create function public.renew_course(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_course public.courses;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('course_open:' || v_user_id::text, 0));

  select * into v_course from public.courses c where c.id = p_id and c.organiser_id = v_user_id for update;
  if not found then
    raise exception 'course_not_found';
  end if;

  if v_course.is_open
     and v_course.opened_at <= now() - interval '90 days'
     and public.course_open_count(v_user_id) >= 3 then
    raise exception 'course_limit_reached';
  end if;

  update public.courses set opened_at = now() where id = p_id;
end;
$$;

create function public.delete_course(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  delete from public.courses c where c.id = p_id and c.organiser_id = v_user_id;
  if not found then
    raise exception 'course_not_found';
  end if;
end;
$$;

-- The caller's courses, newest first, with active sign-ups and why each one is hidden, if it is.
create function public.get_my_courses()
returns table (
  id uuid,
  skill_slug text,
  title text,
  description text,
  duration_minutes integer,
  capacity integer,
  meeting_details text,
  is_open boolean,
  expires_on date,
  signup_count integer,
  hidden_reason text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  perform public.ensure_skills_density_fresh(null);

  return query
  select
    c.id,
    c.skill_slug,
    c.title,
    c.description,
    c.duration_minutes,
    c.capacity,
    c.meeting_details,
    c.is_open,
    ((c.opened_at + interval '90 days') at time zone 'Europe/Warsaw')::date,
    public.course_active_signups(c.id),
    public.course_hidden_reason(c)
  from public.courses c
  where c.organiser_id = v_user_id
  order by c.created_at desc, c.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Neighbour RPCs
-- ---------------------------------------------------------------------------

-- The caller's eligibility, the day they become eligible when they only wait for time, and the
-- GeoJSON polygon of their 3×3 block of squares (null unless eligible).
create function public.get_course_area()
returns table (eligibility text, eligible_on date, block jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  return query
  select
    e.eligibility,
    public.course_eligible_on(v_user_id),
    case when e.eligibility = 'ok' then public.density_block_geojson(q.sx - 1, q.sy - 1, 3) end
  from (select public.course_resident_eligible(v_user_id) as eligibility) as e
  left join public.profiles p on p.user_id = v_user_id
  left join lateral public.density_square(p.location) q on true;
end;
$$;

-- Open courses around the caller. No organiser id, level, creation date or meeting details.
-- Ordered by square, then title, then id, so every reader sees the same order.
create function public.get_nearby_courses()
returns table (
  id uuid,
  skill_name text,
  category_name text,
  title text,
  description text,
  duration_minutes integer,
  places_left integer,
  is_full boolean,
  signed_up boolean,
  cell jsonb
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_sx integer;
  v_sy integer;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  perform public.ensure_skills_density_fresh(null);

  -- Same answer as course_visible_to for an ineligible viewer, without a call per course.
  if public.course_resident_eligible(v_user_id) <> 'ok' then
    return;
  end if;

  select q.sx, q.sy into v_sx, v_sy
  from public.profiles v
  cross join lateral public.density_square(v.location) q
  where v.user_id = v_user_id;

  return query
  select
    c.id,
    s.name_pl,
    k.name_pl,
    c.title,
    c.description,
    c.duration_minutes,
    case when c.capacity is not null then greatest(c.capacity - n.active, 0) end,
    coalesce(c.capacity <= n.active, false),
    exists (
      select 1 from public.course_signups cs
      where cs.course_id = c.id and cs.user_id = v_user_id and cs.withdrawn_at is null
    ),
    public.density_block_geojson(q.sx, q.sy, 1)
  from public.courses c
  join public.skills s on s.slug = c.skill_slug
  join public.skill_categories k on k.slug = s.category_slug
  join public.profiles o on o.user_id = c.organiser_id
  cross join lateral public.density_square(o.location) q
  cross join lateral (select public.course_active_signups(c.id) as active) n
  -- Cheap pre-filters narrow the candidates to open, unexpired courses in the viewer's 3×3 block;
  -- course_visible_to stays the single rule that decides.
  where c.is_open
    and c.opened_at > now() - interval '90 days'
    and c.organiser_id <> v_user_id
    and q.sx between v_sx - 1 and v_sx + 1
    and q.sy between v_sy - 1 and v_sy + 1
    and public.course_visible_to(c, v_user_id)
  order by q.sx, q.sy, c.title, c.id;
end;
$$;

create function public.sign_up_for_course(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_course public.courses;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  perform public.ensure_skills_density_fresh(null);

  -- The row lock serialises sign-ups to one course, so two neighbours cannot take the last place.
  select * into v_course from public.courses c where c.id = p_id for update;
  if not found then
    raise exception 'course_not_found';
  end if;

  if v_course.organiser_id = v_user_id then
    raise exception 'course_own';
  end if;

  if not public.course_visible_to(v_course, v_user_id) then
    raise exception 'course_not_found';
  end if;

  -- Serialises one resident's sign-ups, so parallel requests cannot both pass the hourly count.
  perform pg_advisory_xact_lock(hashtextextended('course_signup:' || v_user_id::text, 0));

  if exists (
    select 1 from public.course_signups s
    where s.course_id = p_id and s.user_id = v_user_id and s.withdrawn_at is null
  ) then
    raise exception 'course_already_signed_up';
  end if;

  if (
    select count(*) from public.course_signups s
    where s.user_id = v_user_id and s.signed_up_at > now() - interval '1 hour'
  ) >= 10 then
    raise exception 'course_signup_rate_limited';
  end if;

  if v_course.capacity is not null and public.course_active_signups(p_id) >= v_course.capacity then
    raise exception 'course_full';
  end if;

  insert into public.course_signups (course_id, user_id, signed_up_at, withdrawn_at)
  values (p_id, v_user_id, now(), null)
  on conflict (course_id, user_id) do update set signed_up_at = now(), withdrawn_at = null;
end;
$$;

-- Withdrawing keeps the row (withdrawn_at), so the hourly sign-up limit still counts it.
create function public.withdraw_from_course(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  update public.course_signups s
  set withdrawn_at = now()
  where s.course_id = p_id and s.user_id = v_user_id and s.withdrawn_at is null;

  if not found then
    raise exception 'course_not_signed_up';
  end if;
end;
$$;

-- The caller's active sign-ups with the meeting details. `available` is false when the course is
-- hidden for any reason; the details stay, since the sign-up has already seen them. No square: it
-- would follow the organiser's current location past the 7-day rule and below k = 5.
create function public.get_my_course_signups()
returns table (
  id uuid,
  skill_name text,
  category_name text,
  title text,
  description text,
  duration_minutes integer,
  meeting_details text,
  available boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  perform public.ensure_skills_density_fresh(null);

  return query
  select
    c.id,
    s.name_pl,
    k.name_pl,
    c.title,
    c.description,
    c.duration_minutes,
    c.meeting_details,
    public.course_hidden_reason(c) is null
  from public.course_signups cs
  join public.courses c on c.id = cs.course_id
  join public.skills s on s.slug = c.skill_slug
  join public.skill_categories k on k.slug = s.category_slug
  where cs.user_id = v_user_id and cs.withdrawn_at is null
  order by cs.signed_up_at desc, c.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Consent version
-- ---------------------------------------------------------------------------

insert into public.consent_versions (version) values ('2026-10-21');

-- ---------------------------------------------------------------------------
-- Owners and privileges
-- ---------------------------------------------------------------------------

alter function public.ensure_skills_density_fresh(text) owner to postgres;
alter function public.course_resident_eligible(uuid) owner to postgres;
alter function public.course_eligible_on(uuid) owner to postgres;
alter function public.course_hidden_reason(public.courses) owner to postgres;
alter function public.course_visible_to(public.courses, uuid) owner to postgres;
alter function public.course_active_signups(uuid) owner to postgres;
alter function public.course_open_count(uuid) owner to postgres;
alter function public.get_skills_density(text) owner to postgres;
alter function public.create_course(text, text, text, integer, integer, text) owner to postgres;
alter function public.update_course(uuid, text, text, integer, integer, text) owner to postgres;
alter function public.set_course_open(uuid, boolean) owner to postgres;
alter function public.renew_course(uuid) owner to postgres;
alter function public.delete_course(uuid) owner to postgres;
alter function public.get_my_courses() owner to postgres;
alter function public.get_course_area() owner to postgres;
alter function public.get_nearby_courses() owner to postgres;
alter function public.sign_up_for_course(uuid) owner to postgres;
alter function public.withdraw_from_course(uuid) owner to postgres;
alter function public.get_my_course_signups() owner to postgres;

-- Supabase grants execute on new functions to anon and authenticated by default. Called directly,
-- course_visible_to would answer "can resident Y see course X" and course_resident_eligible would
-- tell whether any uuid has a confirmed email, so no helper is executable by a client.
revoke execute on function public.check_course_text(text, integer, integer, text) from public, anon, authenticated;
revoke execute on function public.density_square(extensions.geography) from public, anon, authenticated;
revoke execute on function public.density_block_geojson(integer, integer, integer) from public, anon, authenticated;
revoke execute on function public.ensure_skills_density_fresh(text) from public, anon, authenticated;
revoke execute on function public.course_resident_eligible(uuid) from public, anon, authenticated;
revoke execute on function public.course_eligible_on(uuid) from public, anon, authenticated;
revoke execute on function public.course_hidden_reason(public.courses) from public, anon, authenticated;
revoke execute on function public.course_visible_to(public.courses, uuid) from public, anon, authenticated;
revoke execute on function public.course_active_signups(uuid) from public, anon, authenticated;
revoke execute on function public.course_open_count(uuid) from public, anon, authenticated;

revoke execute on function public.create_course(text, text, text, integer, integer, text) from public, anon;
revoke execute on function public.update_course(uuid, text, text, integer, integer, text) from public, anon;
revoke execute on function public.set_course_open(uuid, boolean) from public, anon;
revoke execute on function public.renew_course(uuid) from public, anon;
revoke execute on function public.delete_course(uuid) from public, anon;
revoke execute on function public.get_my_courses() from public, anon;
revoke execute on function public.get_course_area() from public, anon;
revoke execute on function public.get_nearby_courses() from public, anon;
revoke execute on function public.sign_up_for_course(uuid) from public, anon;
revoke execute on function public.withdraw_from_course(uuid) from public, anon;
revoke execute on function public.get_my_course_signups() from public, anon;

grant execute on function public.create_course(text, text, text, integer, integer, text) to authenticated;
grant execute on function public.update_course(uuid, text, text, integer, integer, text) to authenticated;
grant execute on function public.set_course_open(uuid, boolean) to authenticated;
grant execute on function public.renew_course(uuid) to authenticated;
grant execute on function public.delete_course(uuid) to authenticated;
grant execute on function public.get_my_courses() to authenticated;
grant execute on function public.get_course_area() to authenticated;
grant execute on function public.get_nearby_courses() to authenticated;
grant execute on function public.sign_up_for_course(uuid) to authenticated;
grant execute on function public.withdraw_from_course(uuid) to authenticated;
grant execute on function public.get_my_course_signups() to authenticated;
