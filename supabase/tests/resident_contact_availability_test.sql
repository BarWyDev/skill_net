-- Resident phone and availability guarantees: owner-only contacts, the verification column the
-- owner cannot write, phone rules and atomic save, availability storage and slot boundaries
-- (including DST), and the coordinator RPC that shows phone presence but never a number.
-- Run with `npm run test:db`. Everything is rolled back at the end.

begin;
create extension if not exists pgtap with schema extensions;

select plan(45);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres: bypasses RLS, triggers still apply)
-- ---------------------------------------------------------------------------

-- Isolate the fixtures from the local demo seed (supabase/seed.sql), which places residents
-- around the same Kraków epicentre. Rolled back with everything else.
delete from public.profiles;

-- A: saves through the RPC. B: phone written as postgres. C: no phone. K: coordinator.
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@test.local'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'b@test.local'),
  ('cccccccc-0000-0000-0000-000000000003', 'c@test.local'),
  ('dddddddd-0000-0000-0000-000000000004', 'k@test.local');

insert into public.user_roles (user_id, role, granted_by)
values ('dddddddd-0000-0000-0000-000000000004', 'coordinator', 'test');

-- Fixture residents consented at sign-up (S-05), so a complete profile stays matchable.
insert into public.consent_events (user_id, version, source)
select u.id, '2026-10-06', 'signup'
from auth.users u
where not exists (select 1 from public.consent_events c where c.user_id = u.id);

insert into public.profiles (user_id, location_source, location)
select u, 'pin', extensions.st_setsrid(extensions.st_makepoint(19.9366, 50.0614), 4326)::extensions.geography
from unnest(array['bbbbbbbb-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000003']::uuid[]) as u;

insert into public.profile_skills (user_id, skill_slug, level) values
  ('bbbbbbbb-0000-0000-0000-000000000002', 'elektryk', 2),
  ('cccccccc-0000-0000-0000-000000000003', 'elektryk', 1);

insert into public.profile_contacts (user_id, phone)
values ('bbbbbbbb-0000-0000-0000-000000000002', '+48600000002');

-- C declares every slot except the one the transaction's now() falls into.
update public.profiles
set availability_slots = 268435455 & ~(1 << (
  (extract(isodow from now() at time zone 'Europe/Warsaw')::integer - 1) * 4
  + extract(hour from now() at time zone 'Europe/Warsaw')::integer / 6
))
where user_id = 'cccccccc-0000-0000-0000-000000000003';

create temp table crisis_ids (name text primary key, id uuid);
create temp table rpc_rows (
  rank integer, "position" integer, distance_km_rounded numeric, matched_skills jsonb,
  has_phone boolean, availability_slots integer, available_now boolean
);
grant select, insert on crisis_ids, rpc_rows to authenticated;

-- ---------------------------------------------------------------------------
-- save_my_profile: phone and availability (as A)
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);

select lives_ok(
  $$ select public.save_my_profile('pin', null, 50.0614, 19.9366, '[{"slug":"elektryk","level":3}]', '+48600123456', 268435455) $$,
  'save_accepts_mobile: a +48 mobile number and a full grid save'
);
select is(
  (select public.get_my_profile() ->> 'phone'),
  '+48600123456',
  'get_my_profile: returns the owner''s phone'
);
select is(
  (select (public.get_my_profile() ->> 'phone_verified')::boolean),
  false,
  'get_my_profile: a saved phone is unverified'
);
select is(
  (select (public.get_my_profile() ->> 'availability_slots')::integer),
  268435455,
  'get_my_profile: returns the availability mask'
);

select throws_ok(
  $$ select public.save_my_profile('pin', null, 50.0614, 19.9366, '[]', '+48123456789', null) $$,
  'P0001',
  'invalid_phone',
  'invalid_phone: a landline prefix is rejected'
);
select throws_ok(
  $$ select public.save_my_profile('pin', null, 50.0614, 19.9366, '[]', '+48000123456', null) $$,
  'P0001',
  'invalid_phone',
  'invalid_phone: a seed-style +48000 number is rejected'
);
select throws_ok(
  $$ select public.save_my_profile('pin', null, 50.0614, 19.9366, '[]', '600123456', null) $$,
  'P0001',
  'invalid_phone',
  'invalid_phone: the RPC does not normalise a number without +48'
);

-- save_is_atomic: a bad phone rolls back the skills and the availability written before it
select throws_ok(
  $$ select public.save_my_profile('pin', null, 50.0614, 19.9366, '[{"slug":"lekarz","level":1}]', '+48123456789', 1) $$,
  'P0001',
  'invalid_phone',
  'save_is_atomic: a save with a bad phone fails'
);
select results_eq(
  $$ select skill_slug, level from public.profile_skills order by skill_slug $$,
  $$ values ('elektryk'::text, 3::smallint) $$,
  'save_is_atomic: previous skills are unchanged'
);
select ok(
  (select availability_slots = 268435455 from public.profiles)
  and (select phone = '+48600123456' from public.profile_contacts),
  'save_is_atomic: previous availability and phone are unchanged'
);

-- availability_zero_is_null / availability_out_of_range
select public.save_my_profile('pin', null, 50.0614, 19.9366, '[{"slug":"elektryk","level":3}]', '+48600123456', 0);
select is(
  (select availability_slots from public.profiles),
  null::integer,
  'availability_zero_is_null: an empty grid is stored as not declared'
);
select throws_ok(
  $$ select public.save_my_profile('pin', null, 50.0614, 19.9366, '[]', null, 268435456) $$,
  '23514',
  null::text,
  'availability_out_of_range: 2^28 is rejected'
);
select throws_ok(
  $$ update public.profiles set availability_slots = 0 $$,
  '23514',
  null::text,
  'availability_out_of_range: a direct write of 0 is rejected'
);

-- empty_or_null_phone_deletes
select public.save_my_profile('pin', null, 50.0614, 19.9366, '[{"slug":"elektryk","level":3}]', '', null);
select is(
  (select count(*) from public.profile_contacts),
  0::bigint,
  'empty_phone_deletes: an empty phone removes the row'
);
select is(
  (select public.get_my_profile() -> 'phone'),
  'null'::jsonb,
  'empty_phone_deletes: get_my_profile returns a null phone'
);
select public.save_my_profile('pin', null, 50.0614, 19.9366, '[{"slug":"elektryk","level":3}]', '+48600123456', null);
select public.save_my_profile('pin', null, 50.0614, 19.9366, '[{"slug":"elektryk","level":3}]', null, null);
select is(
  (select count(*) from public.profile_contacts),
  0::bigint,
  'null_phone_deletes: a null phone removes the row'
);

-- ---------------------------------------------------------------------------
-- RLS and column grants on profile_contacts (as A)
-- ---------------------------------------------------------------------------

select is(
  (select count(*) from public.profile_contacts where user_id = 'bbbbbbbb-0000-0000-0000-000000000002'),
  0::bigint,
  'rls_other_contact_invisible: A sees none of B''s contacts'
);
select throws_ok(
  $$ insert into public.profile_contacts (user_id, phone) values ('bbbbbbbb-0000-0000-0000-000000000002', '+48600000003') $$,
  '42501',
  null::text,
  'rls_other_contact_invisible: A cannot insert a contact for B'
);

update public.profile_contacts set phone = '+48600000004' where user_id = 'bbbbbbbb-0000-0000-0000-000000000002';
delete from public.profile_contacts where user_id = 'bbbbbbbb-0000-0000-0000-000000000002';

select lives_ok(
  $$ insert into public.profile_contacts (user_id, phone) values ('aaaaaaaa-0000-0000-0000-000000000001', '+48600000001') $$,
  'owner_writes_phone: A can insert their own number directly'
);
select throws_ok(
  $$ update public.profile_contacts set phone_verified_at = now() where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  '42501',
  null::text,
  'owner_cannot_verify: A cannot set phone_verified_at'
);
select throws_ok(
  $$ insert into public.profile_contacts (user_id, phone, phone_verified_at) values ('aaaaaaaa-0000-0000-0000-000000000001', '+48600000001', now()) $$,
  '42501',
  null::text,
  'owner_cannot_verify: A cannot insert phone_verified_at'
);
select throws_ok(
  $$ update public.profile_contacts set updated_at = now() where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  '42501',
  null::text,
  'owner_cannot_verify: A cannot write updated_at'
);
select throws_ok(
  $$ insert into public.profile_contacts (user_id, phone) values ('aaaaaaaa-0000-0000-0000-000000000001', '600000001') $$,
  '23514',
  null::text,
  'phone_format_check: the table rejects a number without +48 and 9 digits'
);

reset role;

select is(
  (select phone from public.profile_contacts where user_id = 'bbbbbbbb-0000-0000-0000-000000000002'),
  '+48600000002',
  'rls_other_contact_invisible: A''s update and delete left B''s number intact'
);

-- ---------------------------------------------------------------------------
-- Verification reset
-- ---------------------------------------------------------------------------

update public.profile_contacts set phone_verified_at = now() where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
select isnt(
  (select phone_verified_at from public.profile_contacts where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  null::timestamptz,
  'verification_reset: a privileged write without a number change keeps the verification'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);

select public.save_my_profile('pin', null, 50.0614, 19.9366, '[{"slug":"elektryk","level":3}]', '+48600000001', 1);
select is(
  (select (public.get_my_profile() ->> 'phone_verified')::boolean),
  true,
  'verification_reset: re-saving the same number keeps the verification'
);
select public.save_my_profile('pin', null, 50.0614, 19.9366, '[{"slug":"elektryk","level":3}]', '+48600000009', 268435455);
select is(
  (select phone_verified_at from public.profile_contacts),
  null::timestamptz,
  'verification_reset: changing the number resets the verification'
);

reset role;

-- ---------------------------------------------------------------------------
-- anon has no access
-- ---------------------------------------------------------------------------

select ok(
  not has_table_privilege('anon', 'public.profile_contacts', 'select')
  and not has_table_privilege('anon', 'public.profile_contacts', 'insert')
  and not has_function_privilege('anon', 'public.save_my_profile(text, text, double precision, double precision, jsonb, text, integer)', 'execute')
  and not has_column_privilege('authenticated', 'public.profile_contacts', 'phone_verified_at', 'update')
  and not has_column_privilege('authenticated', 'public.profile_contacts', 'phone_verified_at', 'insert'),
  'anon_denied: anon has no access; authenticated cannot write phone_verified_at'
);
select ok(
  not exists (
    select 1 from pg_proc
    where proname = 'save_my_profile' and pronamespace = 'public'::regnamespace and pronargs <> 7
  ),
  'old_signature_dropped: only the 7-argument save_my_profile exists'
);

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok(
  $$ select count(*) from public.profile_contacts $$,
  '42501',
  null::text,
  'anon_denied: anon cannot select profile_contacts'
);

reset role;

-- ---------------------------------------------------------------------------
-- availability_covers: slot boundaries on the Warsaw clock
-- ---------------------------------------------------------------------------

-- 2026-10-05 is a Monday; 2026-10-11 a Sunday. 2026-10-25 is the last Sunday of October: clocks
-- go back from 03:00 CEST to 02:00 CET, so 00:30 UTC and 01:30 UTC are both 02:30 local.
select ok(
  public.availability_covers(1, '2026-10-05 00:00:00 Europe/Warsaw'),
  'slot_boundaries: Monday 00:00 is bit 0'
);
select ok(
  public.availability_covers(1, '2026-10-05 05:59:59 Europe/Warsaw'),
  'slot_boundaries: Monday 05:59:59 is still bit 0'
);
select ok(
  public.availability_covers(2, '2026-10-05 06:00:00 Europe/Warsaw')
  and not public.availability_covers(1, '2026-10-05 06:00:00 Europe/Warsaw'),
  'slot_boundaries: Monday 06:00 is bit 1, not bit 0'
);
select ok(
  public.availability_covers(8, '2026-10-05 18:00:00 Europe/Warsaw'),
  'slot_boundaries: 18:00 is wieczór (bit 3)'
);
select ok(
  public.availability_covers(134217728, '2026-10-11 23:59:00 Europe/Warsaw')
  and not public.availability_covers(134217727, '2026-10-11 23:59:00 Europe/Warsaw'),
  'slot_boundaries: Sunday 23:59 is bit 27 and nothing else'
);
select ok(
  public.availability_covers(1 << 24, '2026-10-25 00:30:00+00')
  and public.availability_covers(1 << 24, '2026-10-25 01:30:00+00'),
  'dst: both 02:30 local times on the October change are Sunday noc (bit 24)'
);
select ok(
  public.availability_covers(1 << 24, '2026-10-25 04:30:00+00')
  and not public.availability_covers(1 << 25, '2026-10-25 04:30:00+00'),
  'dst: 04:30 UTC after the change is 05:30 CET, still noc'
);
select ok(
  public.availability_covers(2, '2026-07-06 04:00:00+00')
  and not public.availability_covers(1, '2026-07-06 04:00:00+00'),
  'dst: in summer 04:00 UTC is 06:00 CEST, Monday rano'
);
select is(
  public.availability_covers(null, now()),
  null::boolean,
  'not_declared: a null mask gives null'
);

-- ---------------------------------------------------------------------------
-- get_crisis_matches: phone presence and availability, never a number (as K)
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"dddddddd-0000-0000-0000-000000000004","role":"authenticated"}', true);

insert into crisis_ids select 'main', public.activate_crisis('awaria-pradu', 'pin', null, 50.0614, 19.9366, 2);
insert into rpc_rows select * from public.get_crisis_matches((select id from crisis_ids));

reset role;

create temp view rows_by_user as
select m.user_id, r.*
from rpc_rows r
join public.crisis_matches m on m.position = r.position and m.crisis_id = (select id from crisis_ids);

select is(
  (select count(*) from rows_by_user),
  3::bigint,
  'crisis_matches: A, B and C are ranked'
);
select is(
  (select row(has_phone, availability_slots, available_now)::text from rows_by_user where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  row(true, 268435455, true)::text,
  'crisis_matches: A has a phone and is available now'
);
select is(
  (select row(has_phone, availability_slots, available_now)::text from rows_by_user where user_id = 'bbbbbbbb-0000-0000-0000-000000000002'),
  row(true, null::integer, null::boolean)::text,
  'crisis_matches: B has a phone and has not declared availability'
);
select is(
  (select row(has_phone, available_now)::text from rows_by_user where user_id = 'cccccccc-0000-0000-0000-000000000003'),
  row(false, false)::text,
  'crisis_matches: C has no phone and is outside their declared availability now'
);
select is(
  (select count(*) from rpc_rows r where to_jsonb(r)::text like '%+48%' or to_jsonb(r)::text like '%600000%'),
  0::bigint,
  'no_phone_leak: no returned column contains a phone number'
);

-- ---------------------------------------------------------------------------
-- account_delete_cascades
-- ---------------------------------------------------------------------------

delete from auth.users where id = 'bbbbbbbb-0000-0000-0000-000000000002';
select is(
  (select count(*) from public.profile_contacts where user_id = 'bbbbbbbb-0000-0000-0000-000000000002'),
  0::bigint,
  'account_delete_cascades: deleting the account removes the phone'
);

select * from finish();
rollback;
