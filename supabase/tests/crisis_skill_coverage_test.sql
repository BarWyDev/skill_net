-- Crisis skill coverage guarantees: the access boundary and the exceptions, one row per matrix skill
-- with priority skills first, counts from the same rows the list shows (paused residents and skills
-- hidden from crises excluded), "available now" only where availability is shared, and a 0 row for
-- a skill nobody in the radius has.
-- Run with `npm run test:db`. Everything is rolled back at the end.

begin;
create extension if not exists pgtap with schema extensions;

select plan(12);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres: bypasses RLS, triggers still apply)
-- ---------------------------------------------------------------------------

delete from public.profiles;

-- K: a coordinator. R: a resident. Residents 1–5 are in Kraków:
--   1: elektryk (2), available always
--   2: elektryk (3), available always but availability hidden in a crisis (V3 off)
--   3: elektryk (1), paused after activation
--   4: agregat-pradotworczy, the skill hidden from crises after activation (V2 off)
--   5: logistyk (2), no availability declared
insert into auth.users (id, email) values
  ('cccccccc-0000-0000-0000-000000000001', 'coord@test.local'),
  ('eeeeeeee-0000-0000-0000-000000000000', 'resident@test.local');

insert into auth.users (id, email)
select ('00000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, 'u' || i || '@test.local'
from generate_series(1, 5) as i;

insert into public.user_roles (user_id, role, granted_by) values
  ('cccccccc-0000-0000-0000-000000000001', 'coordinator', 'test');

insert into public.consent_events (user_id, version, source)
select u.id, '2026-10-06', 'signup'
from auth.users u
where not exists (select 1 from public.consent_events c where c.user_id = u.id);

insert into public.profiles (user_id, location_source, location)
select
  ('00000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid,
  'pin',
  extensions.st_setsrid(extensions.st_makepoint(19.9366, 50.0614), 4326)::extensions.geography
from generate_series(1, 5) as i;

-- 268435455: every slot of the week (see the S-06 migration).
update public.profiles set availability_slots = 268435455
where user_id in ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002');
update public.profiles set show_availability_in_crisis = false
where user_id = '00000000-0000-0000-0000-000000000002';

insert into public.profile_skills (user_id, skill_slug, level) values
  ('00000000-0000-0000-0000-000000000001', 'elektryk', 2),
  ('00000000-0000-0000-0000-000000000002', 'elektryk', 3),
  ('00000000-0000-0000-0000-000000000003', 'elektryk', 1),
  ('00000000-0000-0000-0000-000000000004', 'agregat-pradotworczy', null),
  ('00000000-0000-0000-0000-000000000005', 'logistyk', 2);

create temp table crisis_ids (name text primary key, id uuid);
create temp table coverage (skill_slug text, tier text, people integer, available_now integer);
grant select, insert on crisis_ids, coverage to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-0000-0000-000000000001","role":"authenticated"}', true);

insert into crisis_ids
select 'live', public.activate_crisis('awaria-pradu', 'pin', null, 50.0614, 19.9366, 1, 'Awaria prądu w centrum miasta');
insert into crisis_ids
select 'ended', public.activate_crisis('awaria-pradu', 'pin', null, 50.0614, 19.9366, 1, 'Awaria prądu w centrum miasta');
select public.end_crisis((select id from crisis_ids where name = 'ended'));

reset role;

update public.profiles set paused_at = now(), paused_until = null
where user_id = '00000000-0000-0000-0000-000000000003';
update public.profile_skills set use_in_crisis = false
where user_id = '00000000-0000-0000-0000-000000000004';

-- ---------------------------------------------------------------------------
-- Access boundary and exceptions
-- ---------------------------------------------------------------------------

select ok(
  not has_function_privilege('anon', 'public.get_crisis_coverage(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.get_crisis_coverage(uuid)', 'execute'),
  'privileges: only authenticated can execute get_crisis_coverage'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-0000-0000-000000000000","role":"authenticated"}', true);

select throws_ok(
  $$ select * from public.get_crisis_coverage((select id from crisis_ids where name = 'live')) $$,
  'P0001',
  'not_coordinator',
  'resident_refused: a resident gets not_coordinator'
);

select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-0000-0000-000000000001","role":"authenticated"}', true);

select throws_ok(
  $$ select * from public.get_crisis_coverage('99999999-0000-0000-0000-000000000000') $$,
  'P0001',
  'unknown_crisis',
  'unknown_crisis: an unknown id raises unknown_crisis'
);
select throws_ok(
  $$ select * from public.get_crisis_coverage((select id from crisis_ids where name = 'ended')) $$,
  'P0001',
  'crisis_not_active',
  'ended_crisis: an ended crisis raises crisis_not_active'
);

insert into coverage select * from public.get_crisis_coverage((select id from crisis_ids where name = 'live'));

reset role;

-- ---------------------------------------------------------------------------
-- Rows and counts
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::integer from coverage),
  (select count(*)::integer from public.crisis_type_skills where crisis_type_slug = 'awaria-pradu'),
  'one_row_per_skill: every matrix skill has a row'
);
select is(
  (select bool_and(tier = 'priority') from (select tier from coverage limit (
    select count(*) from public.crisis_type_skills where crisis_type_slug = 'awaria-pradu' and tier = 'priority'
  )) t),
  true,
  'priority_first: the priority skills come first'
);
select is(
  (select people from coverage where skill_slug = 'elektryk'),
  2,
  'paused_excluded: the paused electrician is not counted'
);
select is(
  (select available_now from coverage where skill_slug = 'elektryk'),
  1,
  'availability_shared_only: hidden availability does not count as available now'
);
select is(
  (select people from coverage where skill_slug = 'agregat-pradotworczy'),
  0,
  'hidden_skill_excluded: a skill hidden from crises is not counted'
);
select is(
  (select people from coverage where skill_slug = 'logistyk'),
  1,
  'supporting_counted: a supporting skill is counted'
);
select is(
  (select available_now from coverage where skill_slug = 'logistyk'),
  0,
  'undeclared_not_available: no declared availability is not available now'
);
-- visible_match_count answers only a coordinator.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-0000-0000-000000000001","role":"authenticated"}', true);

select is(
  (select people from coverage where skill_slug = 'elektryk')
  + (select people from coverage where skill_slug = 'logistyk'),
  (select public.visible_match_count(c) from public.crises c where c.id = (select id from crisis_ids where name = 'live')),
  'same_rows_as_list: the counts add up to the visible list (each person here has one skill)'
);

reset role;

select * from finish();
rollback;
