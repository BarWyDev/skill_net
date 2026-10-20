-- Crisis exercise guarantees: the flag is set at activation (false by default, including the
-- 7-argument call from older code), an exercise ranks like a real crisis, break-glass is refused
-- in an exercise before anything is logged, and the scenarios table is closed to everyone but
-- coordinators.
-- Run with `npm run test:db`. Everything is rolled back at the end.

begin;
create extension if not exists pgtap with schema extensions;

select plan(14);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres: bypasses RLS, triggers still apply)
-- ---------------------------------------------------------------------------

-- Isolate the fixtures from the local demo seed (supabase/seed.sql) and from manual reveals.
delete from public.profiles;
delete from public.contact_reveal_subjects;
delete from public.contact_reveal_events;
delete from public.crisis_scenarios;

-- K: a coordinator. R: a resident. Residents 1–3 are electricians with phones in Kraków.
insert into auth.users (id, email) values
  ('cccccccc-0000-0000-0000-000000000001', 'coord@test.local'),
  ('eeeeeeee-0000-0000-0000-000000000000', 'resident@test.local');

insert into auth.users (id, email)
select ('00000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, 'u' || i || '@test.local'
from generate_series(1, 3) as i;

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
from generate_series(1, 3) as i;

insert into public.profile_skills (user_id, skill_slug, level)
select user_id, 'elektryk', 2 from public.profiles;

insert into public.profile_contacts (user_id, phone)
select user_id, '+48600' || right(user_id::text, 6) from public.profiles;

insert into public.crisis_scenarios (slug, name_pl, crisis_type_slug, postcode, radius_km, reason, sort) values
  ('test-awaria', 'Awaria testowa', 'awaria-pradu', '31-001', 2, 'Ćwiczenie awarii zasilania w centrum', 1);

create temp table crisis_ids (name text primary key, id uuid);
grant select, insert on crisis_ids to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-0000-0000-000000000001","role":"authenticated"}', true);

insert into crisis_ids
select 'real', public.activate_crisis('awaria-pradu', 'pin', null, 50.0614, 19.9366, 1, 'Awaria prądu w centrum miasta');
insert into crisis_ids
select 'exercise', public.activate_crisis('awaria-pradu', 'pin', null, 50.0614, 19.9366, 1, 'Ćwiczenie awarii prądu w centrum', true);
insert into crisis_ids
select 'null_flag', public.activate_crisis('awaria-pradu', 'pin', null, 50.0614, 19.9366, 1, 'Awaria prądu w centrum miasta', null);

reset role;

-- ---------------------------------------------------------------------------
-- The flag
-- ---------------------------------------------------------------------------

select is(
  (select is_exercise from public.crises where id = (select id from crisis_ids where name = 'real')),
  false,
  'default_real: the 7-argument call activates a real crisis'
);
select is(
  (select is_exercise from public.crises where id = (select id from crisis_ids where name = 'exercise')),
  true,
  'exercise_flag: p_exercise true activates an exercise'
);
select is(
  (select is_exercise from public.crises where id = (select id from crisis_ids where name = 'null_flag')),
  false,
  'null_flag: p_exercise null counts as a real crisis'
);
select is(
  (select match_count from public.crises where id = (select id from crisis_ids where name = 'exercise')),
  (select match_count from public.crises where id = (select id from crisis_ids where name = 'real')),
  'exercise_ranks: an exercise matches the same residents as a real crisis'
);
select is(
  (select match_count from public.crises where id = (select id from crisis_ids where name = 'exercise')),
  3,
  'exercise_ranks: all three electricians are matched'
);

-- ---------------------------------------------------------------------------
-- Break-glass
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-0000-0000-000000000001","role":"authenticated"}', true);

select throws_ok(
  $$ select * from public.reveal_crisis_contacts((select id from crisis_ids where name = 'exercise'), 'Nikt nie odpowiada na wezwania') $$,
  'P0001',
  'exercise_no_reveal',
  'exercise_no_reveal: break-glass is refused in an exercise'
);
select is(
  (select count(*)::integer from public.reveal_crisis_contacts((select id from crisis_ids where name = 'real'), 'Nikt nie odpowiada na wezwania')),
  3,
  'real_reveal: break-glass still works in a real crisis'
);

reset role;

select is(
  (select count(*)::integer from public.contact_reveal_events where crisis_id = (select id from crisis_ids where name = 'exercise')),
  0,
  'exercise_no_reveal: the refused reveal logged no event'
);
select is(
  (select count(*)::integer from public.contact_reveal_events),
  1,
  'real_reveal: only the real reveal is logged'
);

-- ---------------------------------------------------------------------------
-- Scenarios
-- ---------------------------------------------------------------------------

select ok(
  not has_table_privilege('anon', 'public.crisis_scenarios', 'select')
  and has_table_privilege('authenticated', 'public.crisis_scenarios', 'select')
  and not has_table_privilege('authenticated', 'public.crisis_scenarios', 'insert')
  and not has_table_privilege('authenticated', 'public.crisis_scenarios', 'update')
  and not has_table_privilege('authenticated', 'public.crisis_scenarios', 'delete'),
  'scenario_privileges: clients only read scenarios, anon not at all'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-0000-0000-000000000001","role":"authenticated"}', true);

select is(
  (select count(*)::integer from public.crisis_scenarios),
  1,
  'coordinator_reads_scenarios: a coordinator sees the scenarios'
);

select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-0000-0000-000000000000","role":"authenticated"}', true);

select is(
  (select count(*)::integer from public.crisis_scenarios),
  0,
  'resident_cannot_read_scenarios: a resident sees no scenarios'
);

reset role;

select throws_ok(
  $$ insert into public.crisis_scenarios (slug, name_pl, crisis_type_slug, postcode, radius_km, reason, sort)
     values ('zly-promien', 'Zły promień', 'pozar', '31-001', 3, 'Ćwiczenie pożaru w centrum', 2) $$,
  '23514',
  null,
  'scenario_radius: a radius outside the presets is refused'
);
select throws_ok(
  $$ insert into public.crisis_scenarios (slug, name_pl, crisis_type_slug, postcode, radius_km, reason, sort)
     values ('zly-kod', 'Zły kod', 'pozar', '00-000', 2, 'Ćwiczenie pożaru w centrum', 2) $$,
  '23503',
  null,
  'scenario_postcode: an unknown postcode is refused'
);

select * from finish();
rollback;
