-- Crisis deactivation guarantees: the access boundary for anon, residents and coordinators, the
-- end state (status, end fields, deleted snapshot, kept match_count), idempotency, the scoped
-- delete and the status check constraint. Run with `npm run test:db`. Everything is rolled back
-- at the end.

begin;
create extension if not exists pgtap with schema extensions;

select plan(17);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres: bypasses RLS, triggers still apply)
-- ---------------------------------------------------------------------------

-- Isolate the fixtures from the local demo seed (supabase/seed.sql).
delete from public.profiles;

-- C1 activates both crises, C2 ends one, R is a resident, 01-03 are matched residents.
insert into auth.users (id, email) values
  ('cccccccc-0000-0000-0000-000000000001', 'coord1@test.local'),
  ('cccccccc-0000-0000-0000-000000000002', 'coord2@test.local'),
  ('eeeeeeee-0000-0000-0000-000000000000', 'resident@test.local'),
  ('00000000-0000-0000-0000-000000000001', 'u01@test.local'),
  ('00000000-0000-0000-0000-000000000002', 'u02@test.local'),
  ('00000000-0000-0000-0000-000000000003', 'u03@test.local');

insert into public.user_roles (user_id, role, granted_by) values
  ('cccccccc-0000-0000-0000-000000000001', 'coordinator', 'test'),
  ('cccccccc-0000-0000-0000-000000000002', 'coordinator', 'test');

-- All three pinned near postcode 31-001 (Kraków centre), each with a power-outage skill.
-- Fixture residents consented at sign-up (S-05), so a complete profile stays matchable.
insert into public.consent_events (user_id, version, source)
select u.id, '2026-10-06', 'signup'
from auth.users u
where not exists (select 1 from public.consent_events c where c.user_id = u.id);

insert into public.profiles (user_id, location_source, location)
select
  user_id,
  'pin',
  extensions.st_transform(extensions.st_setsrid(extensions.st_makepoint(567300, 243800), 2180), 4326)::extensions.geography
from (values
  ('00000000-0000-0000-0000-000000000001'::uuid),
  ('00000000-0000-0000-0000-000000000002'::uuid),
  ('00000000-0000-0000-0000-000000000003'::uuid)
) as v (user_id);

insert into public.profile_skills (user_id, skill_slug, level) values
  ('00000000-0000-0000-0000-000000000001', 'elektryk', 3),
  ('00000000-0000-0000-0000-000000000002', 'elektryk', 1),
  ('00000000-0000-0000-0000-000000000003', 'agregat-pradotworczy', null);

create temp table crisis_ids (name text primary key, id uuid);
create temp table before_second_call (ended_at timestamptz, ended_by uuid);

grant select, insert on crisis_ids to authenticated;
grant select, insert on before_second_call to authenticated;

-- C1 activates two crises over the same residents.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-0000-0000-000000000001","role":"authenticated"}', true);

insert into crisis_ids
select 'ended', public.activate_crisis('awaria-pradu', 'postcode', '31-001', null, null, 20);
insert into crisis_ids
select 'kept', public.activate_crisis('awaria-pradu', 'postcode', '31-001', null, null, 20);

reset role;

select ok(
  (select match_count from public.crises where id = (select id from crisis_ids where name = 'ended')) > 0,
  'fixtures: the crisis to end has a non-empty snapshot'
);

-- ---------------------------------------------------------------------------
-- anon_cannot_execute
-- ---------------------------------------------------------------------------

select ok(
  not has_function_privilege('anon', 'public.end_crisis(uuid)', 'execute'),
  'anon_cannot_execute: anon has no execute on end_crisis'
);

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok(
  $$ select public.end_crisis('99999999-0000-0000-0000-000000000000') $$,
  '42501',
  null::text,
  'anon_cannot_execute: anon cannot call end_crisis'
);

reset role;

-- ---------------------------------------------------------------------------
-- resident_cannot_end
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-0000-0000-000000000000","role":"authenticated"}', true);

select throws_ok(
  $$ select public.end_crisis((select id from crisis_ids where name = 'ended')) $$,
  'P0001',
  'not_coordinator',
  'resident_cannot_end: a resident gets not_coordinator'
);
select throws_ok(
  $$ update public.crises set status = 'ended', ended_at = now() $$,
  '42501',
  null::text,
  'resident_cannot_end: a resident cannot update crises directly'
);

-- ---------------------------------------------------------------------------
-- coordinator_ends_any_crisis (C2 did not activate it)
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-0000-0000-000000000002","role":"authenticated"}', true);

select throws_ok(
  $$ select public.end_crisis('99999999-0000-0000-0000-000000000000') $$,
  'P0001',
  'unknown_crisis',
  'unknown_crisis: an unknown id raises unknown_crisis'
);
select is(
  public.end_crisis((select id from crisis_ids where name = 'ended')),
  true,
  'coordinator_ends_any_crisis: another coordinator ends the crisis and gets true'
);

-- get_crisis_matches on the ended crisis returns nothing.
select is(
  (select count(*) from public.get_crisis_matches((select id from crisis_ids where name = 'ended'))),
  0::bigint,
  'snapshot_deleted: get_crisis_matches returns no rows for the ended crisis'
);

insert into before_second_call
select ended_at, ended_by from public.crises where id = (select id from crisis_ids where name = 'ended');

-- already_ended_is_noop
select is(
  public.end_crisis((select id from crisis_ids where name = 'ended')),
  false,
  'already_ended_is_noop: a second call returns false'
);

reset role;

-- ---------------------------------------------------------------------------
-- End state (as postgres: reads the snapshot directly)
-- ---------------------------------------------------------------------------

select is(
  (select status from public.crises where id = (select id from crisis_ids where name = 'ended')),
  'ended',
  'end_state: status is ended'
);
select is(
  (select ended_by from public.crises where id = (select id from crisis_ids where name = 'ended')),
  'cccccccc-0000-0000-0000-000000000002'::uuid,
  'end_state: ended_by records the coordinator who ended it'
);
select is(
  (select count(*) from public.crisis_matches where crisis_id = (select id from crisis_ids where name = 'ended')),
  0::bigint,
  'end_state: the snapshot rows are deleted'
);
select is(
  (select match_count from public.crises where id = (select id from crisis_ids where name = 'ended')),
  3,
  'end_state: match_count is kept'
);
select is(
  (select row(ended_at, ended_by)::text from public.crises where id = (select id from crisis_ids where name = 'ended')),
  (select row(ended_at, ended_by)::text from before_second_call),
  'already_ended_is_noop: the second call changes neither ended_at nor ended_by'
);

-- delete_is_scoped
select is(
  (select count(*) from public.crisis_matches where crisis_id = (select id from crisis_ids where name = 'kept')),
  3::bigint,
  'delete_is_scoped: the other active crisis keeps its snapshot'
);
select is(
  (select status from public.crises where id = (select id from crisis_ids where name = 'kept')),
  'active',
  'delete_is_scoped: the other crisis stays active'
);

-- status_check_constraint
select throws_ok(
  $$ update public.crises set status = 'ended' where id = (select id from crisis_ids where name = 'kept') $$,
  '23514',
  null::text,
  'status_check_constraint: status ended without ended_at is rejected'
);

select * from finish();
rollback;
