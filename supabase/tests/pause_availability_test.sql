-- Pause availability guarantees: the inclusive Warsaw-date predicate (DST included), the end-date
-- range enforced on every write path, the pause and resume RPCs and their access boundary, a paused
-- resident leaving new crisis rankings and the density map, a pause during an active crisis hiding
-- the resident from the list, the teams (role bounds included) and the reveal (rows, subjects and
-- count), the same `position` after a resume, the coordinator's visible count, and the resident's
-- own complete/matchable flags.
-- Run with `npm run test:db`. Everything is rolled back at the end.

begin;
create extension if not exists pgtap with schema extensions;

select plan(43);

-- ---------------------------------------------------------------------------
-- Predicate (pure, evaluated at fixed instants)
-- ---------------------------------------------------------------------------

select ok(
  public.pause_active(now(), '2026-07-01', '2026-07-01 23:59:00 Europe/Warsaw'),
  'pause_active: until D holds at D 23:59 Warsaw'
);
select ok(
  not public.pause_active(now(), '2026-07-01', '2026-07-02 00:00:00 Europe/Warsaw'),
  'pause_active: until D has ended at D+1 00:00 Warsaw'
);
select ok(
  not public.pause_active(now(), '2026-07-01', '2026-07-01 22:30:00+00'),
  'pause_active: Warsaw calendar, not UTC (22:30 UTC on D is already D+1 in summer)'
);
select ok(
  public.pause_active(now(), null, '2030-01-01 00:00:00+00'),
  'pause_active: no end date holds indefinitely'
);
select ok(
  not public.pause_active(null, null, now()),
  'pause_active: no pause is not active'
);
-- 2026-03-29 is the spring change-over day (CET UTC+1 -> CEST UTC+2 at 01:00 UTC).
select ok(
  public.pause_active(now(), '2026-03-29', '2026-03-29 21:59:00+00'),
  'pause_active_dst: until the change-over day holds at 23:59 CEST'
);
select ok(
  not public.pause_active(now(), '2026-03-29', '2026-03-29 22:00:00+00'),
  'pause_active_dst: until the change-over day has ended at 00:00 CEST'
);
select ok(
  not public.pause_active(now(), '2026-03-28', '2026-03-28 23:00:00+00'),
  'pause_active_dst: until the eve of the change-over has ended at 00:00 CET'
);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres: bypasses RLS, triggers still apply)
-- ---------------------------------------------------------------------------

-- Isolate the fixtures from the local demo seed and from audit rows left by manual testing.
delete from public.profiles;
delete from public.contact_reveal_subjects;
delete from public.contact_reveal_events;

-- K: a coordinator. Residents 1–5 share one Kraków cell (one density square of exactly 5), all
-- with a phone. N: a user with no profile.
insert into auth.users (id, email) values
  ('cccccccc-0000-0000-0000-000000000001', 'coord@test.local'),
  ('eeeeeeee-0000-0000-0000-00000000000f', 'n@test.local');

insert into auth.users (id, email)
select ('eeeeeeee-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, 'r' || i || '@test.local'
from generate_series(1, 5) as i;

insert into public.user_roles (user_id, role, granted_by)
values ('cccccccc-0000-0000-0000-000000000001', 'coordinator', 'test');

-- Fixture residents consented at sign-up (S-05), so a complete profile stays matchable.
insert into public.consent_events (user_id, version, source)
select u.id, '2026-10-06', 'signup'
from auth.users u
where not exists (select 1 from public.consent_events c where c.user_id = u.id);

insert into public.profiles (user_id, location_source, location)
select
  ('eeeeeeee-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid,
  'pin',
  extensions.st_setsrid(extensions.st_makepoint(19.9366, 50.0614), 4326)::extensions.geography
from generate_series(1, 5) as i;

insert into public.profile_skills (user_id, skill_slug, level)
select user_id, 'elektryk', 2 from public.profiles;

insert into public.profile_contacts (user_id, phone)
select user_id, '+48600000001' from public.profiles;

create temp table crisis_ids (name text primary key, id uuid);
create temp table ids (name text primary key, user_id uuid, pos integer);
create temp table profile_rows (name text primary key, body jsonb);
grant select, insert on crisis_ids, ids, profile_rows to authenticated;

create function pg_temp.as_user(p_user_id uuid) returns void
language sql as $$
  select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', p_user_id), true)
$$;

-- ---------------------------------------------------------------------------
-- Access boundary
-- ---------------------------------------------------------------------------

select ok(
  not has_function_privilege('anon', 'public.pause_my_availability(date)', 'execute')
    and not has_function_privilege('anon', 'public.resume_my_availability()', 'execute')
    and not has_function_privilege('anon', 'public.visible_match_count(public.crises)', 'execute'),
  'anon_cannot_execute: anon has no execute on pause, resume or visible_match_count'
);

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok(
  $$ select public.pause_my_availability(null) $$,
  '42501',
  null::text,
  'anon_cannot_execute: anon cannot call pause_my_availability'
);

reset role;
set local role authenticated;
select pg_temp.as_user('eeeeeeee-0000-0000-0000-00000000000f');

select throws_ok(
  $$ select public.pause_my_availability(null) $$,
  'P0001',
  'profile_required',
  'profile_required: a user with no profile cannot pause'
);

-- ---------------------------------------------------------------------------
-- New rankings and the density map
-- ---------------------------------------------------------------------------

reset role;
-- The map reads an hourly snapshot (skills density snapshot migration). Marking it stale makes the
-- next call recompute it, so each read below reflects the residents at that point.
delete from public.skills_density_refreshes;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select is(
  (select count(*) from public.get_skills_density()),
  1::bigint,
  'density: the square of 5 is shown before any pause'
);

reset role;
set local role authenticated;
select pg_temp.as_user('eeeeeeee-0000-0000-0000-000000000001');

select lives_ok(
  $$ select public.pause_my_availability(null) $$,
  'pause_ok: resident 1 pauses with no end date'
);

insert into profile_rows select 'paused', public.get_my_profile();

reset role;
delete from public.skills_density_refreshes;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select is(
  (select count(*) from public.get_skills_density()),
  0::bigint,
  'density: one pause drops the square of 5 below the threshold'
);

reset role;

select is((select body ->> 'complete' from profile_rows where name = 'paused'), 'true', 'get_my_profile: a paused complete profile is complete');
select is((select body ->> 'matchable' from profile_rows where name = 'paused'), 'false', 'get_my_profile: a paused profile is not matchable');
select is((select body ->> 'paused' from profile_rows where name = 'paused'), 'true', 'get_my_profile: paused is true');
select ok(
  (select body -> 'paused_until' = 'null'::jsonb from profile_rows where name = 'paused'),
  'get_my_profile: an indefinite pause has no end date'
);

set local role authenticated;
select pg_temp.as_user('cccccccc-0000-0000-0000-000000000001');

insert into crisis_ids
select 'during_pause', public.activate_crisis('awaria-pradu', 'pin', null, 50.0614, 19.9366, 1);

reset role;

select is(
  (select match_count from public.crises where id = (select id from crisis_ids where name = 'during_pause')),
  4,
  'activate_crisis: a paused resident is not a candidate'
);
select is(
  (select count(*) from public.crisis_matches
   where crisis_id = (select id from crisis_ids where name = 'during_pause')
     and user_id = 'eeeeeeee-0000-0000-0000-000000000001'),
  0::bigint,
  'activate_crisis: the paused resident has no snapshot row'
);

set local role authenticated;
select pg_temp.as_user('eeeeeeee-0000-0000-0000-000000000001');

select lives_ok($$ select public.resume_my_availability() $$, 'resume_ok: resident 1 resumes');
select lives_ok($$ select public.resume_my_availability() $$, 'resume_idempotent: resuming again is a no-op');

reset role;

select ok(
  (select paused_at is null and paused_until is null from public.profiles
   where user_id = 'eeeeeeee-0000-0000-0000-000000000001'),
  'resume: both pause columns are cleared'
);

-- ---------------------------------------------------------------------------
-- A pause during an active crisis
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.as_user('cccccccc-0000-0000-0000-000000000001');

insert into crisis_ids
select 'live', public.activate_crisis('awaria-pradu', 'pin', null, 50.0614, 19.9366, 1);

reset role;

-- By live-crisis position. P (1) pauses: first in line within the role bound of a single
-- "techniczny" team (1 team x 3 template slots). O (3) is an ordinary resident. E (5) is erased later.
insert into ids
select v.name, m.user_id, m.position
from public.crisis_matches m
join (values ('P', 1), ('O', 3), ('E', 5)) as v(name, pos) on v.pos = m.position
where m.crisis_id = (select id from crisis_ids where name = 'live');

select is(
  (select match_count from public.crises where id = (select id from crisis_ids where name = 'live')),
  5,
  'fixtures: the live crisis holds all 5 residents'
);

set local role authenticated;
select pg_temp.as_user((select user_id from ids where name = 'P'));

select lives_ok(
  $$ select public.pause_my_availability((now() at time zone 'Europe/Warsaw')::date) $$,
  'pause_today: P pauses until today'
);

insert into profile_rows select 'until_today', public.get_my_profile();

select pg_temp.as_user('cccccccc-0000-0000-0000-000000000001');

select is(
  (select count(*) from public.get_crisis_matches((select id from crisis_ids where name = 'live'))),
  4::bigint,
  'crisis_matches: the list drops the paused resident'
);
select is(
  (select count(*) from public.get_crisis_matches((select id from crisis_ids where name = 'live')) where "position" = 1),
  0::bigint,
  'crisis_matches: position 1 (P) is absent'
);

select is(
  (select count(*) from public.get_team_candidates((select id from crisis_ids where name = 'live'), 'techniczny', 1)
   where "position" = 1),
  0::bigint,
  'team_candidates: P is not a candidate'
);
select is(
  (select array_agg("position") from public.get_team_candidates((select id from crisis_ids where name = 'live'), 'techniczny', 1)
   where role_skills ? 'elektryk'),
  array[2, 3, 4],
  'team_candidates: the bound (1 team x 3 slots) counts only visible residents (2-4, not 2-3)'
);

select is(
  (select count(*) from public.reveal_crisis_contacts((select id from crisis_ids where name = 'live'), 'Brak potwierdzeń w nocy')
   where "position" = 1),
  0::bigint,
  'reveal: P''s number is not shown'
);

reset role;

select is(
  (select revealed_count from public.contact_reveal_events where crisis_id = (select id from crisis_ids where name = 'live')),
  4,
  'reveal: revealed_count excludes P'
);
select is(
  (select count(*) from public.contact_reveal_subjects s
   join public.contact_reveal_events e on e.id = s.event_id
   where e.crisis_id = (select id from crisis_ids where name = 'live')
     and s.user_id = (select user_id from ids where name = 'P')),
  0::bigint,
  'reveal: P is not logged as a subject'
);
select is(
  (select count(*) from public.contact_reveal_subjects s
   join public.contact_reveal_events e on e.id = s.event_id
   where e.crisis_id = (select id from crisis_ids where name = 'live')),
  4::bigint,
  'reveal: the logged subjects equal the shown rows'
);

select is(
  (select body ->> 'paused_until' from profile_rows where name = 'until_today'),
  ((now() at time zone 'Europe/Warsaw')::date)::text,
  'get_my_profile: paused_until is the end date of the active pause'
);

-- ---------------------------------------------------------------------------
-- Visible count
-- ---------------------------------------------------------------------------

-- E is erased: the cascade removes their snapshot row, as in S-14.
delete from auth.users where id = (select user_id from ids where name = 'E');

set local role authenticated;
select pg_temp.as_user('cccccccc-0000-0000-0000-000000000001');

select is(
  (select public.visible_match_count(c) from public.crises c where c.id = (select id from crisis_ids where name = 'live')),
  3,
  'visible_match_count: active crisis = match_count 5 - 1 paused - 1 erased'
);

reset role;

create temp table crisis_rows as select * from public.crises;
grant select on crisis_rows to authenticated;

set local role authenticated;
select pg_temp.as_user((select user_id from ids where name = 'O'));

select is(
  (select public.visible_match_count(row(t.*)::public.crises) from crisis_rows t
   where t.id = (select id from crisis_ids where name = 'live')),
  0,
  'visible_match_count: a non-coordinator gets 0'
);

-- ---------------------------------------------------------------------------
-- Resume during the crisis, then end it
-- ---------------------------------------------------------------------------

select pg_temp.as_user((select user_id from ids where name = 'P'));
select public.resume_my_availability();

select pg_temp.as_user('cccccccc-0000-0000-0000-000000000001');

select is(
  (select count(*) from public.get_crisis_matches((select id from crisis_ids where name = 'live')) where "position" = 1),
  1::bigint,
  'resume_restores_position: P is back at position 1'
);

select public.end_crisis((select id from crisis_ids where name = 'live'));

select is(
  (select public.visible_match_count(c) from public.crises c where c.id = (select id from crisis_ids where name = 'live')),
  5,
  'visible_match_count: an ended crisis keeps its historical match_count'
);

-- ---------------------------------------------------------------------------
-- End-date range on every write path (as O, the owner)
-- ---------------------------------------------------------------------------

select pg_temp.as_user((select user_id from ids where name = 'O'));

select throws_ok(
  $$ select public.pause_my_availability((now() at time zone 'Europe/Warsaw')::date - 1) $$,
  'P0001',
  'invalid_pause_until',
  'range: yesterday is refused'
);
select throws_ok(
  $$ update public.profiles
     set paused_at = now(), paused_until = (now() at time zone 'Europe/Warsaw')::date + 366
     where user_id = (select user_id from ids where name = 'O') $$,
  'P0001',
  'invalid_pause_until',
  'range: today + 366 is refused on a direct update by the owner'
);
select lives_ok(
  $$ update public.profiles
     set paused_at = now(), paused_until = (now() at time zone 'Europe/Warsaw')::date + 365
     where user_id = (select user_id from ids where name = 'O') $$,
  'range: today + 365 is accepted on a direct update by the owner'
);
select lives_ok(
  $$ update public.profiles
     set paused_at = now(), paused_until = (now() at time zone 'Europe/Warsaw')::date
     where user_id = (select user_id from ids where name = 'O') $$,
  'range: today is accepted on a direct update by the owner'
);

reset role;

select ok(
  (select prosecdef and pg_get_userbyid(proowner) = 'postgres' from pg_proc
   where oid = 'public.visible_match_count(public.crises)'::regprocedure),
  'definer_owner: visible_match_count is security definer, owned by postgres'
);

select * from finish();
rollback;
