-- Resident profile guarantees: RLS isolation, coarsening, postcode resolution (the postcode
-- itself is never stored), level rules, the matchability contract and save atomicity.
-- Run with `npm run test:db`. Everything is rolled back at the end.

begin;
create extension if not exists pgtap with schema extensions;

select plan(39);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres: bypasses RLS, triggers still apply)
-- ---------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@test.local'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'b@test.local'),
  ('cccccccc-0000-0000-0000-000000000003', 'c@test.local'),
  ('dddddddd-0000-0000-0000-000000000004', 'd@test.local');

-- Fixture residents consented at sign-up (S-05), so a complete profile stays matchable.
insert into public.consent_events (user_id, version, source)
select u.id, '2026-10-06', 'signup'
from auth.users u
where not exists (select 1 from public.consent_events c where c.user_id = u.id);

insert into public.postcodes (postcode, centroid, address_count)
values
  ('00-950', extensions.st_setsrid(extensions.st_makepoint(21.0118, 52.2319), 4326)::extensions.geography, 10),
  ('00-951', extensions.st_setsrid(extensions.st_makepoint(21.0500, 52.2500), 4326)::extensions.geography, 10)
on conflict (postcode) do update set centroid = excluded.centroid, address_count = excluded.address_count;

-- Pin input used by the coarsening cases.
create temp table pin_input as
select extensions.st_setsrid(extensions.st_makepoint(21.0122, 52.2297), 4326)::extensions.geography as g;
grant select on pin_input to authenticated;

-- ---------------------------------------------------------------------------
-- User A saves a pin through the RPC
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);

select lives_ok(
  $$ select public.save_my_profile('pin', null, 52.2297, 21.0122, '[{"slug":"elektryk","level":2},{"slug":"agregat-pradotworczy","level":null}]', null, null) $$,
  'save_my_profile: saves a pin and two skills'
);

-- pin_is_coarsened
select isnt(
  (select extensions.st_astext(location::extensions.geometry) from public.profiles),
  (select extensions.st_astext(g::extensions.geometry) from pin_input),
  'pin_is_coarsened: stored point differs from the input'
);
select ok(
  (
    select round(extensions.st_x(p2180))::bigint % 500 = 250
       and round(extensions.st_y(p2180))::bigint % 500 = 250
    from (select extensions.st_transform(location::extensions.geometry, 2180) as p2180 from public.profiles) as t
  ),
  'pin_is_coarsened: stored point is a 500 m cell centre in EPSG:2180'
);

-- coarsened_within_radius
select ok(
  (select extensions.st_distance(p.location, i.g) <= 360 from public.profiles p, pin_input i),
  'coarsened_within_radius: stored point is within 360 m of the input'
);

select is(
  (select public.get_my_profile() -> 'skills'),
  '[{"slug":"agregat-pradotworczy","level":null},{"slug":"elektryk","level":2}]'::jsonb,
  'get_my_profile: returns the saved skills'
);
select is(
  (select (public.get_my_profile() ->> 'matchable')::boolean),
  true,
  'get_my_profile: reports a complete profile as matchable'
);

-- ---------------------------------------------------------------------------
-- User B: a pin in the same cell, written directly (not through the RPC)
-- ---------------------------------------------------------------------------

reset role;

insert into public.profiles (user_id, location_source, location)
select
  'bbbbbbbb-0000-0000-0000-000000000002',
  'pin',
  extensions.st_transform(
    extensions.st_translate(extensions.st_transform(location::extensions.geometry, 2180), 100, -120),
    4326
  )::extensions.geography
from public.profiles
where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
insert into public.profile_skills (user_id, skill_slug, level)
values ('bbbbbbbb-0000-0000-0000-000000000002', 'lekarz', 3);

-- same_cell_same_point
select is(
  (select extensions.st_astext(location::extensions.geometry) from public.profiles where user_id = 'bbbbbbbb-0000-0000-0000-000000000002'),
  (select extensions.st_astext(location::extensions.geometry) from public.profiles where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  'same_cell_same_point: two pins in one cell store identical points'
);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);

-- rls_other_profile_invisible
select is(
  (select count(*) from public.profiles where user_id = 'bbbbbbbb-0000-0000-0000-000000000002'),
  0::bigint,
  'rls_other_profile_invisible: A sees none of B''s profiles rows'
);
select is(
  (select count(*) from public.profile_skills where user_id = 'bbbbbbbb-0000-0000-0000-000000000002'),
  0::bigint,
  'rls_other_profile_invisible: A sees none of B''s profile_skills rows'
);
select is(
  (select public.profile_is_matchable('bbbbbbbb-0000-0000-0000-000000000002')),
  false,
  'rls_other_profile_invisible: A cannot evaluate B''s matchability'
);

update public.profiles set location_source = null where user_id = 'bbbbbbbb-0000-0000-0000-000000000002';
delete from public.profile_skills where user_id = 'bbbbbbbb-0000-0000-0000-000000000002';
delete from public.profiles where user_id = 'bbbbbbbb-0000-0000-0000-000000000002';

select throws_ok(
  $$ insert into public.profile_skills (user_id, skill_slug, level) values ('bbbbbbbb-0000-0000-0000-000000000002', 'elektryk', 1) $$,
  '42501',
  null::text,
  'rls_other_profile_invisible: A cannot insert skills for B'
);

reset role;

select is(
  (select location_source from public.profiles where user_id = 'bbbbbbbb-0000-0000-0000-000000000002'),
  'pin',
  'rls_other_profile_invisible: A''s update and delete left B''s profile intact'
);
select is(
  (select count(*) from public.profile_skills where user_id = 'bbbbbbbb-0000-0000-0000-000000000002'),
  1::bigint,
  'rls_other_profile_invisible: A''s delete left B''s skills intact'
);

-- rls_anon_denied
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

-- anon holds no privilege on resident tables (narrow table grants), so a read is refused outright.
select throws_ok(
  $$ select count(*) from public.profiles $$,
  '42501',
  null::text,
  'rls_anon_denied: anon cannot read profiles'
);
select throws_ok(
  $$ select count(*) from public.profile_skills $$,
  '42501',
  null::text,
  'rls_anon_denied: anon cannot read profile_skills'
);
select is(
  (select count(*) from public.lookup_postcode('00-950')),
  1::bigint,
  'lookup_postcode: anon can look up a postcode'
);

reset role;

-- ---------------------------------------------------------------------------
-- Postcode path, last edit wins, bounding box
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);

-- postcode_resolves
select public.save_my_profile('postcode', '00-950', null, null, '[{"slug":"elektryk","level":2}]', null, null);
select ok(
  (
    select p.postcode is null
       and extensions.st_equals(p.location::extensions.geometry, public.coarsen_point(c.centroid)::extensions.geometry)
    from public.profiles p, public.postcodes c
    where c.postcode = '00-950'
  ),
  'postcode_resolves: a known postcode stores its coarsened centroid and not the code'
);
select ok(
  not (public.get_my_profile() ? 'postcode'),
  'postcode_not_returned: get_my_profile has no postcode key'
);
select is(
  (select row(l.lat, l.lng)::text from public.lookup_postcode('00-950') l),
  (select row(extensions.st_y(location::extensions.geometry), extensions.st_x(location::extensions.geometry))::text from public.profiles),
  'lookup_postcode: returns the same point a profile stores'
);

-- unknown_postcode_raises
select throws_ok(
  $$ select public.save_my_profile('postcode', '99-999', null, null, '[]', null, null) $$,
  'P0001',
  'unknown_postcode',
  'unknown_postcode_raises'
);

-- resave_keeps_location: a postcode-source save without a code keeps the stored point
select public.save_my_profile('postcode', null, null, null, '[{"slug":"elektryk","level":3}]', null, null);
select ok(
  (
    select p.location_source = 'postcode'
       and extensions.st_equals(p.location::extensions.geometry, public.coarsen_point(c.centroid)::extensions.geometry)
    from public.profiles p, public.postcodes c
    where c.postcode = '00-950'
  ),
  'resave_keeps_location: location and source are unchanged'
);
select results_eq(
  $$ select skill_slug, level from public.profile_skills order by skill_slug $$,
  $$ values ('elektryk'::text, 3::smallint) $$,
  'resave_keeps_location: skills are replaced'
);

-- patch_cannot_move_postcode_location: a direct update cannot relabel an arbitrary point
update public.profiles set location = (select g from pin_input);
select ok(
  (
    select extensions.st_equals(p.location::extensions.geometry, public.coarsen_point(c.centroid)::extensions.geometry)
    from public.profiles p, public.postcodes c
    where c.postcode = '00-950'
  ),
  'patch_cannot_move_postcode_location: supplied point is ignored without a code'
);

-- patch_with_postcode_resolves: a direct update with a code resolves it and discards it
update public.profiles set location_source = 'postcode', postcode = '00-951';
select ok(
  (
    select p.postcode is null
       and extensions.st_equals(p.location::extensions.geometry, public.coarsen_point(c.centroid)::extensions.geometry)
    from public.profiles p, public.postcodes c
    where c.postcode = '00-951'
  ),
  'patch_with_postcode_resolves: stores the new centroid and a null postcode'
);

-- pin_clears_postcode: a direct update that only switches to a pin still clears the postcode
update public.profiles
set location_source = 'pin',
    location = (select g from pin_input);
select is(
  (select postcode from public.profiles),
  null::text,
  'pin_clears_postcode: switching to a pin nulls the postcode'
);

-- keep_without_prior_raises: nothing to keep from a pin, or from no profile at all
select throws_ok(
  $$ select public.save_my_profile('postcode', null, null, null, '[]', null, null) $$,
  'P0001',
  'postcode_required',
  'keep_without_prior_raises: a pin profile cannot keep a postcode location'
);
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-0000-0000-000000000003","role":"authenticated"}', true);
select throws_ok(
  $$ select public.save_my_profile('postcode', null, null, null, '[]', null, null) $$,
  'P0001',
  'postcode_required',
  'keep_without_prior_raises: a user without a profile cannot keep a location'
);
select is(
  (select count(*) from public.profiles),
  0::bigint,
  'keep_without_prior_raises: the failed save left no profile row'
);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);

-- outside_poland_raises
select throws_ok(
  $$ select public.save_my_profile('pin', null, 48.5, 21.0, '[]', null, null) $$,
  'P0001',
  'outside_poland',
  'outside_poland_raises'
);

-- ---------------------------------------------------------------------------
-- Level rules
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ insert into public.profile_skills (user_id, skill_slug, level) values ('aaaaaaaa-0000-0000-0000-000000000001', 'lekarz', null) $$,
  'P0001',
  'level_required',
  'level_required'
);
select throws_ok(
  $$ insert into public.profile_skills (user_id, skill_slug, level) values ('aaaaaaaa-0000-0000-0000-000000000001', 'agregat-pradotworczy', 2) $$,
  'P0001',
  'level_not_applicable',
  'level_not_applicable'
);
select throws_ok(
  $$ insert into public.profile_skills (user_id, skill_slug, level) values ('aaaaaaaa-0000-0000-0000-000000000001', 'lekarz', 5) $$,
  '23514',
  null::text,
  'level_out_of_range'
);

-- ---------------------------------------------------------------------------
-- save_is_atomic
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ select public.save_my_profile('postcode', '00-950', null, null, '[{"slug":"nie-istnieje","level":null}]', null, null) $$,
  '23503',
  null::text,
  'save_is_atomic: an unknown skill slug fails'
);
select results_eq(
  $$ select skill_slug, level from public.profile_skills order by skill_slug $$,
  $$ values ('elektryk'::text, 3::smallint) $$,
  'save_is_atomic: previous skills are unchanged'
);
select is(
  (select location_source from public.profiles),
  'pin',
  'save_is_atomic: previous location is unchanged'
);

-- not_authenticated
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok(
  $$ select public.save_my_profile(null, null, null, null, '[]', null, null) $$,
  'P0001',
  'not_authenticated',
  'save_my_profile: raises without a user'
);

reset role;

-- postcode_never_stored_check: even with the trigger off, the table rejects a stored postcode
alter table public.profiles disable trigger profiles_resolve_and_coarsen;
select throws_ok(
  $$ update public.profiles set postcode = '00-950' where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  '23514',
  null::text,
  'postcode_never_stored_check: check (postcode is null) holds without the trigger'
);
alter table public.profiles enable trigger profiles_resolve_and_coarsen;

-- ---------------------------------------------------------------------------
-- matchable_truth_table (as postgres, so every row is visible)
-- ---------------------------------------------------------------------------

-- C: no row, then location only. D: skills only.
select is(
  public.profile_is_matchable('cccccccc-0000-0000-0000-000000000003'),
  false,
  'matchable_truth_table: no profile row is not matchable'
);

insert into public.profiles (user_id, location_source, location)
values ('cccccccc-0000-0000-0000-000000000003', 'pin', (select g from pin_input));
insert into public.profiles (user_id) values ('dddddddd-0000-0000-0000-000000000004');
insert into public.profile_skills (user_id, skill_slug, level)
values ('dddddddd-0000-0000-0000-000000000004', 'osoba-silna-fizycznie', null);

select ok(
  not public.profile_is_matchable('cccccccc-0000-0000-0000-000000000003')
  and not public.profile_is_matchable('dddddddd-0000-0000-0000-000000000004')
  and public.profile_is_matchable('aaaaaaaa-0000-0000-0000-000000000001'),
  'matchable_truth_table: location only -> false, skills only -> false, both -> true'
);

select * from finish();
rollback;
