-- Crisis ranking guarantees: the ranking rule (tiers, levels, multi-skill bonus, ties, radius,
-- eligibility), snapshot integrity, the cascade, and the access boundary for anon, residents
-- and coordinators. Run with `npm run test:db`. Everything is rolled back at the end.

begin;
create extension if not exists pgtap with schema extensions;

select plan(45);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres: bypasses RLS, triggers still apply)
-- ---------------------------------------------------------------------------

-- C: coordinator, R: resident without a profile, 01-12: ranked fixtures.
insert into auth.users (id, email) values
  ('cccccccc-0000-0000-0000-000000000000', 'coord@test.local'),
  ('eeeeeeee-0000-0000-0000-000000000000', 'resident@test.local'),
  ('00000000-0000-0000-0000-000000000001', 'u01@test.local'),
  ('00000000-0000-0000-0000-000000000002', 'u02@test.local'),
  ('00000000-0000-0000-0000-000000000003', 'u03@test.local'),
  ('00000000-0000-0000-0000-000000000004', 'u04@test.local'),
  ('00000000-0000-0000-0000-000000000005', 'u05@test.local'),
  ('00000000-0000-0000-0000-000000000006', 'u06@test.local'),
  ('00000000-0000-0000-0000-000000000007', 'u07@test.local'),
  ('00000000-0000-0000-0000-000000000008', 'u08@test.local'),
  ('00000000-0000-0000-0000-000000000009', 'u09@test.local'),
  ('00000000-0000-0000-0000-000000000010', 'u10@test.local'),
  ('00000000-0000-0000-0000-000000000011', 'u11@test.local'),
  ('00000000-0000-0000-0000-000000000012', 'u12@test.local');

insert into public.user_roles (user_id, role, granted_by)
values ('cccccccc-0000-0000-0000-000000000000', 'coordinator', 'test');

-- Pins in EPSG:2180 (Kraków). The epicentre E is the centre of the cell (567250, 243750), so
-- every resident pinned in that cell is stored at E and sits at d = 0.
create temp table pins (user_id uuid, x double precision, y double precision);
insert into pins values
  ('00000000-0000-0000-0000-000000000001', 567300, 243800), -- same cell
  ('00000000-0000-0000-0000-000000000002', 567300, 243800),
  ('00000000-0000-0000-0000-000000000003', 567300, 243800),
  ('00000000-0000-0000-0000-000000000004', 567300, 243800),
  ('00000000-0000-0000-0000-000000000005', 567300, 243800),
  ('00000000-0000-0000-0000-000000000006', 567300, 243800),
  ('00000000-0000-0000-0000-000000000007', 567300, 243800),
  ('00000000-0000-0000-0000-000000000008', 567300, 243800),
  ('00000000-0000-0000-0000-000000000009', 567300, 243800),
  ('00000000-0000-0000-0000-000000000011', 570300, 243800), -- about 3 km east
  ('00000000-0000-0000-0000-000000000012', 567800, 243800); -- next cell, about 500 m east

insert into public.profiles (user_id, location_source, location)
select
  user_id,
  'pin',
  extensions.st_transform(extensions.st_setsrid(extensions.st_makepoint(x, y), 2180), 4326)::extensions.geography
from pins;

-- 10: skills, but no location.
insert into public.profiles (user_id) values ('00000000-0000-0000-0000-000000000010');

insert into public.profile_skills (user_id, skill_slug, level) values
  ('00000000-0000-0000-0000-000000000001', 'elektryk', 3),              -- A in the worked example
  ('00000000-0000-0000-0000-000000000002', 'elektryk', 1),              -- B in the worked example
  ('00000000-0000-0000-0000-000000000002', 'agregat-pradotworczy', null),
  ('00000000-0000-0000-0000-000000000002', 'kierowca-kat-b', 2),
  ('00000000-0000-0000-0000-000000000003', 'agregat-pradotworczy', null), -- no level
  ('00000000-0000-0000-0000-000000000004', 'elektryk', 1),
  ('00000000-0000-0000-0000-000000000005', 'logistyk', 3),              -- supporting
  ('00000000-0000-0000-0000-000000000006', 'kierowca-kat-b', 2),        -- tie with 07
  ('00000000-0000-0000-0000-000000000007', 'kierowca-kat-b', 2),
  ('00000000-0000-0000-0000-000000000008', 'kierowca-kat-b', 1),
  ('00000000-0000-0000-0000-000000000009', 'rezerwista', 2),            -- no matrix skill
  ('00000000-0000-0000-0000-000000000010', 'elektryk', 3),              -- no location
  ('00000000-0000-0000-0000-000000000011', 'elektryk', 3),              -- outside the radius
  ('00000000-0000-0000-0000-000000000012', 'elektryk', 3);              -- about 500 m away

-- Epicentres as lat/lng. `edge_in` / `edge_out` sit 999 m / 1001 m north of 12's stored point.
create temp table epicentres as
select 'main' as name, extensions.st_y(g) as lat, extensions.st_x(g) as lng
from (
  select extensions.st_transform(extensions.st_setsrid(extensions.st_makepoint(567250, 243750), 2180), 4326) as g
) as e
union all
select v.name, extensions.st_y(v.g::extensions.geometry), extensions.st_x(v.g::extensions.geometry)
from (
  select 'edge_in' as name, extensions.st_project(location, 999, 0) as g
  from public.profiles where user_id = '00000000-0000-0000-0000-000000000012'
  union all
  select 'edge_out', extensions.st_project(location, 1001, 0)
  from public.profiles where user_id = '00000000-0000-0000-0000-000000000012'
) as v;

create temp table crisis_ids (name text primary key, id uuid);

grant select on epicentres to authenticated;
grant select, insert on crisis_ids to authenticated;

-- ---------------------------------------------------------------------------
-- coordinator_activates_and_reads
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-0000-0000-000000000000","role":"authenticated"}', true);

select lives_ok(
  $$
    insert into crisis_ids
    select 'main', public.activate_crisis('awaria-pradu', 'pin', null, lat, lng, 2)
    from epicentres where name = 'main'
  $$,
  'coordinator_activates_and_reads: a coordinator activates a power outage'
);
select is(
  (select count(*) from public.get_crisis_matches((select id from crisis_ids where name = 'main'))),
  9::bigint,
  'coordinator_activates_and_reads: the coordinator reads 9 ranked rows'
);
select is(
  (select count(*) from public.get_crisis_matches((select id from crisis_ids where name = 'main'), 3)),
  3::bigint,
  'coordinator_activates_and_reads: p_limit caps the rows'
);
select is(
  (select array_agg(m.position) from public.get_crisis_matches((select id from crisis_ids where name = 'main')) m),
  array[1, 2, 3, 4, 5, 6, 7, 8, 9],
  'coordinator_activates_and_reads: rows come in position order'
);
select is(
  (select activated_by from public.crises where id = (select id from crisis_ids where name = 'main')),
  'cccccccc-0000-0000-0000-000000000000'::uuid,
  'coordinator_activates_and_reads: the crisis is visible and records who activated it'
);
select throws_ok(
  $$ select * from public.get_crisis_matches('99999999-0000-0000-0000-000000000000') $$,
  'P0001',
  'unknown_crisis',
  'coordinator_activates_and_reads: an unknown crisis id raises unknown_crisis'
);

-- ---------------------------------------------------------------------------
-- client_cannot_read_matches_table / client_cannot_write_crises (as the coordinator)
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ select count(*) from public.crisis_matches $$,
  '42501',
  null::text,
  'client_cannot_read_matches_table: even a coordinator cannot select crisis_matches'
);
select throws_ok(
  $$ insert into public.crises (crisis_type_slug, epicentre, radius_m, activated_by)
     values ('pozar', 'SRID=4326;POINT(19.94 50.06)', 1000, 'cccccccc-0000-0000-0000-000000000000') $$,
  '42501',
  null::text,
  'client_cannot_write_crises: a coordinator cannot insert a crisis directly'
);
select throws_ok(
  $$ update public.crises set status = 'ended' $$,
  '42501',
  null::text,
  'client_cannot_write_crises: a coordinator cannot update a crisis'
);
select throws_ok(
  $$ delete from public.crises $$,
  '42501',
  null::text,
  'client_cannot_write_crises: a coordinator cannot delete a crisis'
);

-- ---------------------------------------------------------------------------
-- unknown_type_radius_postcode_raise
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ select public.activate_crisis('tsunami', 'postcode', '31-001', null, null, 5) $$,
  'P0001',
  'unknown_crisis_type',
  'unknown_type_radius_postcode_raise: an unknown type raises unknown_crisis_type'
);
select throws_ok(
  $$ select public.activate_crisis('pozar', 'postcode', '31-001', null, null, 3) $$,
  'P0001',
  'invalid_radius',
  'unknown_type_radius_postcode_raise: a radius outside the presets raises invalid_radius'
);
select throws_ok(
  $$ select public.activate_crisis('pozar', 'postcode', '99-999', null, null, 5) $$,
  'P0001',
  'unknown_postcode',
  'unknown_type_radius_postcode_raise: an unknown postcode raises unknown_postcode'
);
select throws_ok(
  $$ select public.activate_crisis('pozar', 'pin', null, 48.5, 19.9, 5) $$,
  'P0001',
  'outside_poland',
  'unknown_type_radius_postcode_raise: a pin outside Poland raises outside_poland'
);
select throws_ok(
  $$ select public.activate_crisis('pozar', 'pin', null, 50.06, null, 5) $$,
  'P0001',
  'location_required',
  'unknown_type_radius_postcode_raise: a pin without lng raises location_required'
);
select lives_ok(
  $$ insert into crisis_ids select 'postcode', public.activate_crisis('pozar', 'postcode', '31-001', null, null, 5) $$,
  'unknown_type_radius_postcode_raise: a known postcode activates'
);

-- radius_inclusive_and_excludes_outside: two activations 1 m inside and 1 m outside 1 km.
select lives_ok(
  $$
    insert into crisis_ids
    select name, public.activate_crisis('awaria-pradu', 'pin', null, lat, lng, 1)
    from epicentres where name in ('edge_in', 'edge_out')
  $$,
  'radius_inclusive_and_excludes_outside: edge activations succeed'
);

reset role;

-- ---------------------------------------------------------------------------
-- Ranking rule (as postgres: reads the snapshot directly)
-- ---------------------------------------------------------------------------

create temp view main_matches as
select m.*
from public.crisis_matches m
where m.crisis_id = (select id from crisis_ids where name = 'main');

-- best_plus_bonus: the worked example. A = 0.30 + 0.35 * 1/1.10 + 0.15 * 3/3 = 0.768182.
-- B's best skill is agregat (priority, no level = 2/3), plus two extras: 0.30 + 0.35 + 0.10.
select is(
  (select score from main_matches where user_id = '00000000-0000-0000-0000-000000000001'),
  0.768182,
  'best_plus_bonus: A (elektryk:3) scores 0.768182'
);
select is(
  (select score from main_matches where user_id = '00000000-0000-0000-0000-000000000002'),
  0.750000,
  'best_plus_bonus: B (elektryk:1, agregat, kierowca-kat-b) scores 0.75'
);
select ok(
  (select rank from main_matches where user_id = '00000000-0000-0000-0000-000000000001')
  < (select rank from main_matches where user_id = '00000000-0000-0000-0000-000000000002'),
  'best_plus_bonus: A ranks above B'
);
select is(
  (select matched_skills from main_matches where user_id = '00000000-0000-0000-0000-000000000002'),
  '[{"slug":"agregat-pradotworczy","tier":"priority","level":null},{"slug":"elektryk","tier":"priority","level":1},{"slug":"kierowca-kat-b","tier":"supporting","level":2}]'::jsonb,
  'best_plus_bonus: matched skills are listed best first'
);

-- priority_beats_supporting: equal distance and level.
select ok(
  (select score from main_matches where user_id = '00000000-0000-0000-0000-000000000001')
  > (select score from main_matches where user_id = '00000000-0000-0000-0000-000000000005'),
  'priority_beats_supporting: elektryk:3 (priority) beats logistyk:3 (supporting)'
);

-- no_level_counts_as_two
select ok(
  (select score from main_matches where user_id = '00000000-0000-0000-0000-000000000004')
  < (select score from main_matches where user_id = '00000000-0000-0000-0000-000000000003')
  and (select score from main_matches where user_id = '00000000-0000-0000-0000-000000000003')
  < (select score from main_matches where user_id = '00000000-0000-0000-0000-000000000001'),
  'no_level_counts_as_two: agregat sits between elektryk:1 and elektryk:3'
);

-- ties_share_rank
select is(
  (select rank from main_matches where user_id = '00000000-0000-0000-0000-000000000006'),
  (select rank from main_matches where user_id = '00000000-0000-0000-0000-000000000007'),
  'ties_share_rank: identical profiles in one cell share a rank'
);
select is(
  (
    select abs(a.position - b.position)
    from main_matches a, main_matches b
    where a.user_id = '00000000-0000-0000-0000-000000000006'
      and b.user_id = '00000000-0000-0000-0000-000000000007'
  ),
  1,
  'ties_share_rank: tied residents take consecutive positions'
);
select is(
  (select rank from main_matches where user_id = '00000000-0000-0000-0000-000000000008'),
  (select rank from main_matches where user_id = '00000000-0000-0000-0000-000000000006') + 2,
  'ties_share_rank: the next resident''s rank skips one place'
);
select is(
  (select array_agg(rank order by position) from main_matches),
  array[1, 2, 3, 4, 5, 6, 7, 7, 9],
  'ties_share_rank: the whole list uses competition ranking'
);

-- radius_inclusive_and_excludes_outside
select ok(
  not exists (select 1 from main_matches where user_id = '00000000-0000-0000-0000-000000000011'),
  'radius_inclusive_and_excludes_outside: a resident 3 km away is outside a 2 km radius'
);
select ok(
  exists (
    select 1 from public.crisis_matches
    where crisis_id = (select id from crisis_ids where name = 'edge_in')
      and user_id = '00000000-0000-0000-0000-000000000012'
  ),
  'radius_inclusive_and_excludes_outside: a resident 999 m away is inside a 1 km radius'
);
select ok(
  not exists (
    select 1 from public.crisis_matches
    where crisis_id = (select id from crisis_ids where name = 'edge_out')
      and user_id = '00000000-0000-0000-0000-000000000012'
  ),
  'radius_inclusive_and_excludes_outside: a resident 1001 m away is outside a 1 km radius'
);

-- unmatched_skills_excluded / no_location_excluded
select ok(
  not exists (select 1 from main_matches where user_id = '00000000-0000-0000-0000-000000000009'),
  'unmatched_skills_excluded: a resident with only non-matrix skills is excluded'
);
select ok(
  not exists (select 1 from main_matches where user_id = '00000000-0000-0000-0000-000000000010'),
  'no_location_excluded: a resident without a location is excluded'
);

-- match_count_matches_rows
select is(
  (select match_count from public.crises where id = (select id from crisis_ids where name = 'main')),
  (select count(*)::integer from main_matches),
  'match_count_matches_rows: match_count equals the snapshot size'
);

-- matches_hide_user_id
select is(
  (select proargnames from pg_proc where oid = 'public.get_crisis_matches(uuid, integer)'::regprocedure),
  array['p_crisis_id', 'p_limit', 'rank', 'position', 'distance_km_rounded', 'matched_skills'],
  'matches_hide_user_id: the RPC returns rank, position, rounded distance and skills only'
);

-- distance_rounded_to_half_km: 12 is about 500 m away; everyone in E's cell is at 0.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-0000-0000-000000000000","role":"authenticated"}', true);

create temp table main_rpc as
select * from public.get_crisis_matches((select id from crisis_ids where name = 'main'));

reset role;

select is(
  (
    select r.distance_km_rounded
    from main_rpc r
    join main_matches m on m.position = r.position
    where m.user_id = '00000000-0000-0000-0000-000000000012'
  ),
  0.5,
  'distance_rounded_to_half_km: about 500 m shows as 0.5 km'
);
select is(
  (
    select r.distance_km_rounded
    from main_rpc r
    join main_matches m on m.position = r.position
    where m.user_id = '00000000-0000-0000-0000-000000000001'
  ),
  0.0,
  'distance_rounded_to_half_km: the epicentre''s cell shows as 0 km'
);

-- resident_delete_cascades_from_snapshot
delete from auth.users where id = '00000000-0000-0000-0000-000000000008';

select ok(
  not exists (select 1 from public.crisis_matches where user_id = '00000000-0000-0000-0000-000000000008'),
  'resident_delete_cascades_from_snapshot: deleting the account removes its snapshot rows'
);

-- ---------------------------------------------------------------------------
-- resident_cannot_activate / resident_cannot_read_crisis
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-0000-0000-000000000000","role":"authenticated"}', true);

select throws_ok(
  $$ select public.activate_crisis('awaria-pradu', 'postcode', '31-001', null, null, 5) $$,
  'P0001',
  'not_coordinator',
  'resident_cannot_activate: a resident gets not_coordinator'
);
select throws_ok(
  $$ select * from public.get_crisis_matches((select id from crisis_ids where name = 'main')) $$,
  'P0001',
  'not_coordinator',
  'resident_cannot_read_crisis: get_crisis_matches raises for a resident'
);
select is(
  (select count(*) from public.crises),
  0::bigint,
  'resident_cannot_read_crisis: a resident sees no crises'
);

reset role;

-- ---------------------------------------------------------------------------
-- anon_cannot_execute
-- ---------------------------------------------------------------------------

select ok(
  not has_function_privilege('anon', 'public.activate_crisis(text, text, text, double precision, double precision, integer)', 'execute')
  and not has_function_privilege('anon', 'public.get_crisis_matches(uuid, integer)', 'execute')
  and not has_table_privilege('anon', 'public.crises', 'select')
  and not has_table_privilege('anon', 'public.crisis_matches', 'select')
  and not has_table_privilege('authenticated', 'public.crisis_matches', 'select')
  and not has_table_privilege('authenticated', 'public.crises', 'insert')
  and not has_table_privilege('authenticated', 'public.crisis_types', 'insert')
  and not has_table_privilege('authenticated', 'public.crisis_type_skills', 'update'),
  'anon_cannot_execute: no execute for anon, no client access to the snapshot, no client writes'
);

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok(
  $$ select public.activate_crisis('awaria-pradu', 'postcode', '31-001', null, null, 5) $$,
  '42501',
  null::text,
  'anon_cannot_execute: anon cannot call activate_crisis'
);
select throws_ok(
  $$ select * from public.get_crisis_matches('99999999-0000-0000-0000-000000000000') $$,
  '42501',
  null::text,
  'anon_cannot_execute: anon cannot call get_crisis_matches'
);

reset role;

-- ---------------------------------------------------------------------------
-- matrix_weights_sum_to_one / bonus_never_beats_level_step
-- ---------------------------------------------------------------------------

select is(
  (select count(*) from public.crisis_types where w_distance + w_skill + w_level + w_availability = 1),
  6::bigint,
  'matrix_weights_sum_to_one: all 6 crisis types have weights summing to 1'
);
select is(
  (select count(*) from public.crisis_types where w_skill * 0.10 / 1.10 >= w_level / 3),
  0::bigint,
  'bonus_never_beats_level_step: one level step outweighs the maximum multi-skill bonus for every type'
);

select * from finish();
rollback;
