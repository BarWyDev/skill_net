-- Direct write guarantees (security audit F-07): a resident writing their own rows through
-- PostgREST meets the same phone rule as save_my_profile, cannot set server-owned profile
-- timestamps, and cannot grow the consent log by repeating a consent.
-- Run with `npm run test:db`. Everything is rolled back at the end.

begin;
create extension if not exists pgtap with schema extensions;

select plan(18);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres)
-- ---------------------------------------------------------------------------

-- R: a resident with a profile, a phone and the sign-up consent.
insert into auth.users (id, email, raw_user_meta_data) values
  ('77777777-0000-0000-0000-000000000001', 'direct@test.local', '{"consent_version": "2026-10-06"}');

insert into public.consent_events (user_id, version, source)
select '77777777-0000-0000-0000-000000000001', '2026-10-06', 'signup'
where not exists (
  select 1 from public.consent_events where user_id = '77777777-0000-0000-0000-000000000001'
);

insert into public.profiles (user_id, location_source, location)
values (
  '77777777-0000-0000-0000-000000000001',
  'pin',
  extensions.st_setsrid(extensions.st_makepoint(19.9366, 50.0614), 4326)::extensions.geography
);

insert into public.profile_contacts (user_id, phone) values ('77777777-0000-0000-0000-000000000001', '+48600000001');

-- The insert time, which no later write may change.
create temp table kept as
select created_at from public.profiles where user_id = '77777777-0000-0000-0000-000000000001';
grant select on kept to authenticated;

-- ---------------------------------------------------------------------------
-- phone (as R)
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"77777777-0000-0000-0000-000000000001","role":"authenticated"}', true);

select throws_ok(
  $$ update public.profile_contacts set phone = '+48000000000' $$,
  'P0001', 'invalid_phone', 'phone: a direct update to an unassignable +48000 number is refused (the audit reproduction)'
);
select throws_ok(
  $$ update public.profile_contacts set phone = '+48123456789' $$,
  'P0001', 'invalid_phone', 'phone: a direct update to a landline is refused'
);
select throws_ok(
  $$ update public.profile_contacts set phone = '+48912345678' $$,
  'P0001', 'invalid_phone', 'phone: a +48 9 prefix (not mobile) is refused'
);
select lives_ok(
  $$ update public.profile_contacts set phone = '+48799123456' $$,
  'phone: a direct update to a mobile number is accepted, as in save_my_profile'
);
select throws_ok(
  $$ select public.save_my_profile('pin', null, 50.0614, 19.9366, '[]', '+48123456789', null) $$,
  'P0001', 'invalid_phone', 'phone: save_my_profile keeps refusing a landline'
);
select lives_ok(
  $$ delete from public.profile_contacts $$,
  'phone: the owner can still delete their number'
);
select throws_ok(
  $$ insert into public.profile_contacts (user_id, phone) values ('77777777-0000-0000-0000-000000000001', '+48221234567') $$,
  'P0001', 'invalid_phone', 'phone: a direct insert of a landline is refused'
);

-- ---------------------------------------------------------------------------
-- timestamps (as R)
-- ---------------------------------------------------------------------------

select lives_ok(
  $$ update public.profiles set paused_at = '1990-01-01' $$,
  'timestamps: a direct pause is still allowed (the audit reproduction)'
);
select is(
  (select paused_at from public.profiles),
  now(),
  'timestamps: a forged paused_at becomes now()'
);
select lives_ok(
  $$ update public.profiles set created_at = '1990-01-01', updated_at = '1990-01-01' $$,
  'timestamps: the update itself is not refused'
);
select is(
  (select created_at from public.profiles),
  (select created_at from kept),
  'timestamps: created_at never changes'
);
select is(
  (select updated_at from public.profiles),
  now(),
  'timestamps: updated_at is the write time'
);
select lives_ok(
  $$ update public.profiles set paused_at = null, paused_until = null $$,
  'timestamps: the owner can still end a pause directly'
);
select is(
  (select paused_at from public.profiles),
  null,
  'timestamps: ending a pause clears paused_at'
);

-- ---------------------------------------------------------------------------
-- consent (as R)
-- ---------------------------------------------------------------------------

select public.record_my_consent('2026-10-06');
select public.record_my_consent('2026-10-06');
select public.record_my_consent('2026-10-06');

reset role;

select is(
  (select count(*) from public.consent_events where user_id = '77777777-0000-0000-0000-000000000001'),
  1::bigint,
  'consent: repeating the current consent adds no rows (the audit reproduction)'
);

insert into public.consent_versions (version) values ('2099-01-01');
set local role authenticated;
select public.record_my_consent('2099-01-01');
select public.record_my_consent('2099-01-01');
reset role;

select is(
  (select array_agg(version || ':' || source order by id) from public.consent_events
   where user_id = '77777777-0000-0000-0000-000000000001'),
  array['2026-10-06:signup', '2099-01-01:reaccept'],
  'consent: a new version is recorded once'
);

-- ---------------------------------------------------------------------------
-- Operators (as postgres)
-- ---------------------------------------------------------------------------

select lives_ok(
  $$ update public.profile_contacts set phone = '+48000123456' where user_id = '77777777-0000-0000-0000-000000000001' $$,
  'operators: the seed''s unassignable +48000 range still loads outside client roles'
);
select ok(
  not has_function_privilege('authenticated', 'public.profile_contacts_check_phone()', 'execute')
  and not has_function_privilege('authenticated', 'public.profiles_server_timestamps()', 'execute'),
  'privileges: the trigger functions are not callable by clients'
);

select * from finish();
rollback;
