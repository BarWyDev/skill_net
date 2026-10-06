-- Crisis team template guarantees: the access boundary and the exceptions, the seeded templates,
-- the candidate pool (snapshot members only, current skills, non-matrix role skills), the
-- per-role bound, the row shape, and read-only reference tables.
-- Run with `npm run test:db`. Everything is rolled back at the end.

begin;
create extension if not exists pgtap with schema extensions;

select plan(30);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres: bypasses RLS, triggers still apply)
-- ---------------------------------------------------------------------------

-- Isolate the fixtures from the local demo seed (supabase/seed.sql).
delete from public.profiles;

-- K: a coordinator. R: a resident. Residents 1–9 are in Kraków:
--   1: pierwsza-pomoc (1) + osoba-silna-fizycznie (not in any matrix)
--   2–6: kierowca-kat-b (2), the bound fixture
--   7: osoba-silna-fizycznie only, so inside the radius but outside the snapshot
--   8: lekarz (3), removed after activation
--   9: ratownik-medyczny (3) + pierwsza-pomoc (1), for the skill order
insert into auth.users (id, email) values
  ('cccccccc-0000-0000-0000-000000000001', 'coord@test.local'),
  ('eeeeeeee-0000-0000-0000-000000000000', 'resident@test.local');

insert into auth.users (id, email)
select ('00000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, 'u' || i || '@test.local'
from generate_series(1, 9) as i;

insert into public.user_roles (user_id, role, granted_by) values
  ('cccccccc-0000-0000-0000-000000000001', 'coordinator', 'test');

-- Fixture residents consented at sign-up (S-05), so a complete profile stays matchable.
insert into public.consent_events (user_id, version, source)
select u.id, '2026-10-06', 'signup'
from auth.users u
where not exists (select 1 from public.consent_events c where c.user_id = u.id);

insert into public.profiles (user_id, location_source, location)
select
  ('00000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid,
  'pin',
  extensions.st_setsrid(extensions.st_makepoint(19.9366, 50.0614), 4326)::extensions.geography
from generate_series(1, 9) as i;

insert into public.profile_skills (user_id, skill_slug, level) values
  ('00000000-0000-0000-0000-000000000001', 'pierwsza-pomoc', 1),
  ('00000000-0000-0000-0000-000000000001', 'osoba-silna-fizycznie', null),
  ('00000000-0000-0000-0000-000000000007', 'osoba-silna-fizycznie', null),
  ('00000000-0000-0000-0000-000000000008', 'lekarz', 3),
  ('00000000-0000-0000-0000-000000000009', 'ratownik-medyczny', 3),
  ('00000000-0000-0000-0000-000000000009', 'pierwsza-pomoc', 1);

insert into public.profile_skills (user_id, skill_slug, level)
select ('00000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, 'kierowca-kat-b', 2
from generate_series(2, 6) as i;

create temp table crisis_ids (name text primary key, id uuid);
create temp table candidate_rows (
  ord bigint generated always as identity,
  rank integer, "position" integer, distance_km_rounded numeric, role_skills jsonb,
  has_phone boolean, availability_slots integer, available_now boolean
);
grant select, insert on crisis_ids, candidate_rows to authenticated;

-- K activates a mass-casualty crisis (medics and drivers are in its matrix) and one to end.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-0000-0000-000000000001","role":"authenticated"}', true);

insert into crisis_ids
select 'live', public.activate_crisis('wypadek-masowy', 'pin', null, 50.0614, 19.9366, 1);
insert into crisis_ids
select 'ended', public.activate_crisis('wypadek-masowy', 'pin', null, 50.0614, 19.9366, 1);
select public.end_crisis((select id from crisis_ids where name = 'ended'));

reset role;

-- Resident 8 removes their only skill after activation.
delete from public.profile_skills where user_id = '00000000-0000-0000-0000-000000000008';

select is(
  (select match_count from public.crises where id = (select id from crisis_ids where name = 'live')),
  8,
  'fixtures: the snapshot holds residents 1–6, 8 and 9, not resident 7'
);

-- ---------------------------------------------------------------------------
-- Access boundary and exceptions
-- ---------------------------------------------------------------------------

select ok(
  not has_function_privilege('anon', 'public.get_team_candidates(uuid, text, integer)', 'execute'),
  'anon_cannot_execute: anon has no execute on get_team_candidates'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-0000-0000-000000000000","role":"authenticated"}', true);

select throws_ok(
  $$ select * from public.get_team_candidates((select id from crisis_ids where name = 'live'), 'ewakuacyjny', 1) $$,
  'P0001',
  'not_coordinator',
  'resident_refused: a resident gets not_coordinator'
);

select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-0000-0000-000000000001","role":"authenticated"}', true);

select throws_ok(
  $$ select * from public.get_team_candidates('99999999-0000-0000-0000-000000000000', 'ewakuacyjny', 1) $$,
  'P0001',
  'unknown_crisis',
  'unknown_crisis: an unknown id raises unknown_crisis'
);
select throws_ok(
  $$ select * from public.get_team_candidates((select id from crisis_ids where name = 'ended'), 'ewakuacyjny', 1) $$,
  'P0001',
  'crisis_not_active',
  'ended_crisis: an ended crisis raises crisis_not_active'
);
select throws_ok(
  $$ select * from public.get_team_candidates((select id from crisis_ids where name = 'live'), 'xyz', 1) $$,
  'P0001',
  'unknown_template',
  'unknown_template: an unknown template raises unknown_template'
);
select throws_ok(
  $$ select * from public.get_team_candidates((select id from crisis_ids where name = 'live'), 'ewakuacyjny', 0) $$,
  'P0001',
  'invalid_team_count',
  'invalid_team_count: a count of 0 is refused'
);
select throws_ok(
  $$ select * from public.get_team_candidates((select id from crisis_ids where name = 'live'), 'ewakuacyjny', 11) $$,
  'P0001',
  'invalid_team_count',
  'invalid_team_count: a count of 11 is refused'
);
select throws_ok(
  $$ select * from public.get_team_candidates((select id from crisis_ids where name = 'live'), 'ewakuacyjny', null) $$,
  'P0001',
  'invalid_team_count',
  'invalid_team_count: a null count is refused'
);

-- K reads one evacuation team's candidates.
insert into candidate_rows (rank, "position", distance_km_rounded, role_skills, has_phone, availability_slots, available_now)
select * from public.get_team_candidates((select id from crisis_ids where name = 'live'), 'ewakuacyjny', 1);

reset role;

-- ---------------------------------------------------------------------------
-- Seed
-- ---------------------------------------------------------------------------

select set_eq(
  $$ select slug from public.team_templates $$,
  array['ewakuacyjny', 'techniczny', 'opiekunczy', 'punkt-medyczny'],
  'seed_templates: the four templates exist'
);
select set_eq(
  $$ select template_slug || '/' || role_slug || '/' || slots from public.team_template_roles $$,
  array[
    'ewakuacyjny/medyk/1', 'ewakuacyjny/osoba-silna/1', 'ewakuacyjny/kierowca/1',
    'techniczny/elektryk/1', 'techniczny/narzedzia/1', 'techniczny/kierowca/1',
    'opiekunczy/medyk-opiekun/1', 'opiekunczy/kierowca/1', 'opiekunczy/lokal/1',
    'punkt-medyczny/medyk/2', 'punkt-medyczny/logistyk/1'
  ],
  'seed_roles: every template has its roles and slots'
);
select set_eq(
  $$ select template_slug || '/' || role_slug || '/' || skill_slug from public.team_role_skills $$,
  array[
    'ewakuacyjny/medyk/ratownik-medyczny', 'ewakuacyjny/medyk/lekarz', 'ewakuacyjny/medyk/pielegniarka',
    'ewakuacyjny/medyk/pierwsza-pomoc', 'ewakuacyjny/osoba-silna/osoba-silna-fizycznie',
    'ewakuacyjny/kierowca/kierowca-kat-b', 'ewakuacyjny/kierowca/kierowca-kat-c',
    'techniczny/elektryk/elektryk', 'techniczny/narzedzia/narzedzia-reczne',
    'techniczny/narzedzia/pila-lancuchowa', 'techniczny/kierowca/kierowca-kat-b',
    'techniczny/kierowca/kierowca-kat-c',
    'opiekunczy/medyk-opiekun/ratownik-medyczny', 'opiekunczy/medyk-opiekun/lekarz',
    'opiekunczy/medyk-opiekun/pielegniarka', 'opiekunczy/medyk-opiekun/pierwsza-pomoc',
    'opiekunczy/medyk-opiekun/opiekun-osob-starszych', 'opiekunczy/kierowca/kierowca-kat-b',
    'opiekunczy/kierowca/kierowca-kat-c', 'opiekunczy/lokal/lokal-ogrzewany-klimatyzowany',
    'punkt-medyczny/medyk/ratownik-medyczny', 'punkt-medyczny/medyk/lekarz',
    'punkt-medyczny/medyk/pielegniarka', 'punkt-medyczny/medyk/pierwsza-pomoc',
    'punkt-medyczny/logistyk/logistyk'
  ],
  'seed_role_skills: every role maps to the agreed skills'
);

-- ---------------------------------------------------------------------------
-- Pool (positions resolved as postgres, which can read the snapshot)
-- ---------------------------------------------------------------------------

create temp table member_positions as
select
  (regexp_match(m.user_id::text, '(\d+)$'))[1]::integer as resident,
  m.position
from public.crisis_matches m
where m.crisis_id = (select id from crisis_ids where name = 'live');

select is(
  (select role_skills from candidate_rows
   where "position" = (select position from member_positions where resident = 1)),
  '{"medyk": [{"slug": "pierwsza-pomoc", "level": 1}], "osoba-silna": [{"slug": "osoba-silna-fizycznie", "level": null}]}'::jsonb,
  'non_matrix_role: a snapshot member qualifies for osoba-silna through a skill outside the matrix'
);
select is(
  (select count(*) from candidate_rows where role_skills ? 'osoba-silna'),
  1::bigint,
  'snapshot_only: the resident in the radius but outside the snapshot is not a candidate'
);
select is(
  (select count(*) from candidate_rows
   where "position" = (select position from member_positions where resident = 8)),
  0::bigint,
  'current_skills: a skill removed after activation no longer qualifies the member'
);
select is(
  (select role_skills -> 'medyk' from candidate_rows
   where "position" = (select position from member_positions where resident = 9)),
  '[{"slug": "ratownik-medyczny", "level": 3}, {"slug": "pierwsza-pomoc", "level": 1}]'::jsonb,
  'skill_order: qualifying skills are listed best level first'
);
select is(
  (select count(*) from candidate_rows where role_skills ? 'medyk'),
  2::bigint,
  'pool: residents 1 and 9 are the medic candidates'
);

-- ---------------------------------------------------------------------------
-- Bound: one team (S = 3) keeps only the first 3 of the 5 drivers by position
-- ---------------------------------------------------------------------------

select is(
  (select count(*) from candidate_rows where role_skills ? 'kierowca'),
  3::bigint,
  'bound: only 3 of the 5 qualifying drivers are returned for one team'
);
select set_eq(
  $$ select "position" from candidate_rows where role_skills ? 'kierowca' $$,
  $$ select position from member_positions where resident between 2 and 6 order by position limit 3 $$,
  'bound: the returned drivers are the first 3 by position'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-0000-0000-000000000001","role":"authenticated"}', true);

select is(
  (select count(*) from public.get_team_candidates((select id from crisis_ids where name = 'live'), 'ewakuacyjny', 2)
   where role_skills ? 'kierowca'),
  5::bigint,
  'bound: two teams (bound 6) return all 5 drivers'
);
select is(
  (select count(*) from public.get_team_candidates((select id from crisis_ids where name = 'live'), 'techniczny', 1)),
  3::bigint,
  'template_scope: only the roles of the requested template are considered'
);

reset role;

-- ---------------------------------------------------------------------------
-- Shape
-- ---------------------------------------------------------------------------

select ok(
  not exists (
    select 1 from pg_proc, unnest(proargnames) as arg
    where oid = 'public.get_team_candidates(uuid, text, integer)'::regprocedure and arg = 'user_id'
  ),
  'no_user_id: get_team_candidates has no user_id column'
);
select is(
  (select array_agg("position" order by ord) from candidate_rows),
  (select array_agg("position" order by "position") from candidate_rows),
  'position_order: rows come back in position order'
);
select ok(
  (select bool_and(distance_km_rounded = 0 and not has_phone and availability_slots is null and available_now is null)
   from candidate_rows),
  'row_shape: distance, phone and availability are computed as in get_crisis_matches'
);

-- ---------------------------------------------------------------------------
-- Reference tables: readable, not writable
-- ---------------------------------------------------------------------------

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select is(
  (select count(*) from public.team_templates)
  + (select count(*) from public.team_template_roles)
  + (select count(*) from public.team_role_skills),
  40::bigint,
  'reference_read: anon reads every template, role and role skill'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-0000-0000-000000000001","role":"authenticated"}', true);

select is(
  (select count(*) from public.team_templates)
  + (select count(*) from public.team_template_roles)
  + (select count(*) from public.team_role_skills),
  40::bigint,
  'reference_read: authenticated reads every template, role and role skill'
);
select throws_ok(
  $$ insert into public.team_templates (slug, name_pl, sort) values ('nowy', 'Nowy', 9) $$,
  '42501',
  null::text,
  'reference_write: a coordinator cannot insert a template'
);
select throws_ok(
  $$ update public.team_template_roles set slots = 3 $$,
  '42501',
  null::text,
  'reference_write: a coordinator cannot update a role'
);
select throws_ok(
  $$ delete from public.team_role_skills $$,
  '42501',
  null::text,
  'reference_write: a coordinator cannot delete a role skill'
);

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok(
  $$ insert into public.team_role_skills (template_slug, role_slug, skill_slug) values ('ewakuacyjny', 'medyk', 'elektryk') $$,
  '42501',
  null::text,
  'reference_write: anon cannot insert a role skill'
);

reset role;

select * from finish();
rollback;
