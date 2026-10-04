-- Unregister and erase guarantees: the access boundary, the recent-password re-auth window (with
-- nothing deleted on refusal), the full cascade of the caller's personal data, the resident leaving
-- an active crisis list, the audit ids surviving, other residents untouched, and a coordinator
-- erasing themselves with their role.
-- Run with `npm run test:db`. Everything is rolled back at the end.

begin;
create extension if not exists pgtap with schema extensions;

select plan(27);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres: bypasses RLS, triggers still apply)
-- ---------------------------------------------------------------------------

-- Isolate the fixtures from the local demo seed and from audit rows left by manual testing.
delete from public.profiles;
delete from public.contact_reveal_subjects;
delete from public.contact_reveal_events;

-- K: a coordinator. R: the resident who unregisters. O: another resident who stays.
insert into auth.users (id, email) values
  ('cccccccc-0000-0000-0000-000000000001', 'coord@test.local'),
  ('eeeeeeee-0000-0000-0000-000000000001', 'r@test.local'),
  ('eeeeeeee-0000-0000-0000-000000000002', 'o@test.local');

insert into auth.identities (provider_id, user_id, identity_data, provider)
values ('eeeeeeee-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000001', '{}', 'email');

insert into public.user_roles (user_id, role, granted_by)
values ('cccccccc-0000-0000-0000-000000000001', 'coordinator', 'test');
insert into public.coordinator_role_events (user_id, action, note)
values ('cccccccc-0000-0000-0000-000000000001', 'grant', 'test');

insert into public.profiles (user_id, location_source, location, availability_slots)
select u, 'pin', extensions.st_setsrid(extensions.st_makepoint(19.9366, 50.0614), 4326)::extensions.geography, 1
from unnest(array['eeeeeeee-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000002']::uuid[]) as u;

insert into public.profile_skills (user_id, skill_slug, level)
select user_id, 'elektryk', 2 from public.profiles;

insert into public.profile_contacts (user_id, phone) values
  ('eeeeeeee-0000-0000-0000-000000000001', '+48600000001'),
  ('eeeeeeee-0000-0000-0000-000000000002', '+48600000002');

create temp table crisis_ids (name text primary key, id uuid);
grant select, insert on crisis_ids to authenticated;

-- K activates a crisis matching R and O, and reveals their numbers.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-0000-0000-000000000001","role":"authenticated"}', true);

insert into crisis_ids
select 'live', public.activate_crisis('awaria-pradu', 'pin', null, 50.0614, 19.9366, 1);
select is(
  (select count(*) from public.reveal_crisis_contacts((select id from crisis_ids where name = 'live'), 'Brak potwierdzeń w nocy')),
  2::bigint,
  'fixtures: K revealed R''s and O''s numbers'
);

select is(
  (select count(*) from public.get_crisis_matches((select id from crisis_ids where name = 'live'))),
  2::bigint,
  'fixtures: the active crisis lists R and O'
);

reset role;

-- ---------------------------------------------------------------------------
-- Access boundary
-- ---------------------------------------------------------------------------

select ok(
  not has_function_privilege('anon', 'public.unregister_me()', 'execute'),
  'anon_cannot_execute: anon has no execute on unregister_me'
);

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok(
  $$ select public.unregister_me() $$,
  '42501',
  null::text,
  'anon_cannot_execute: anon cannot call unregister_me'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);

select throws_ok(
  $$ select public.unregister_me() $$,
  'P0001',
  'not_authenticated',
  'not_authenticated: a token without a user is refused'
);

-- ---------------------------------------------------------------------------
-- Re-auth window (as R)
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-0000-0000-000000000001","role":"authenticated"}', true);

select throws_ok(
  $$ select public.unregister_me() $$,
  'P0001',
  'reauthentication_required',
  'reauth_missing_amr: a token without amr is refused'
);

select set_config(
  'request.jwt.claims',
  format(
    '{"sub":"eeeeeeee-0000-0000-0000-000000000001","role":"authenticated","amr":[{"method":"otp","timestamp":%s}]}',
    extract(epoch from now())::bigint
  ),
  true
);

select throws_ok(
  $$ select public.unregister_me() $$,
  'P0001',
  'reauthentication_required',
  'reauth_wrong_method: a fresh non-password sign-in is refused'
);

select set_config(
  'request.jwt.claims',
  format(
    '{"sub":"eeeeeeee-0000-0000-0000-000000000001","role":"authenticated","amr":[{"method":"password","timestamp":%s}]}',
    extract(epoch from now())::bigint - 301
  ),
  true
);

select throws_ok(
  $$ select public.unregister_me() $$,
  'P0001',
  'reauthentication_required',
  'reauth_stale: a password sign-in older than 5 minutes is refused'
);

reset role;

select is(
  (select count(*) from public.profiles where user_id = 'eeeeeeee-0000-0000-0000-000000000001'),
  1::bigint,
  'refusal_deletes_nothing: R''s profile survives every refused call'
);

-- ---------------------------------------------------------------------------
-- Erasure (as R, fresh password sign-in)
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config(
  'request.jwt.claims',
  format(
    '{"sub":"eeeeeeee-0000-0000-0000-000000000001","role":"authenticated","amr":[{"method":"password","timestamp":%s}]}',
    extract(epoch from now())::bigint
  ),
  true
);

select lives_ok(
  $$ select public.unregister_me() $$,
  'erase_ok: R erases their account with a fresh password sign-in'
);

reset role;

select is(
  (select count(*) from auth.users where id = 'eeeeeeee-0000-0000-0000-000000000001'),
  0::bigint,
  'erase_cascade: R''s auth user (email) is gone'
);
select is(
  (select count(*) from auth.identities where user_id = 'eeeeeeee-0000-0000-0000-000000000001'),
  0::bigint,
  'erase_cascade: R''s identities are gone'
);
select is(
  (select count(*) from public.profiles where user_id = 'eeeeeeee-0000-0000-0000-000000000001'),
  0::bigint,
  'erase_cascade: R''s profile (location, availability) is gone'
);
select is(
  (select count(*) from public.profile_skills where user_id = 'eeeeeeee-0000-0000-0000-000000000001'),
  0::bigint,
  'erase_cascade: R''s skills are gone'
);
select is(
  (select count(*) from public.profile_contacts where user_id = 'eeeeeeee-0000-0000-0000-000000000001'),
  0::bigint,
  'erase_cascade: R''s phone is gone'
);
select is(
  (select count(*) from public.crisis_matches where user_id = 'eeeeeeee-0000-0000-0000-000000000001'),
  0::bigint,
  'erase_cascade: R''s crisis match row is gone'
);
select is(
  (select count(*) from public.contact_reveal_subjects where user_id = 'eeeeeeee-0000-0000-0000-000000000001'),
  1::bigint,
  'audit_kept: R''s reveal subject row keeps the bare id'
);

select is(
  (select count(*) from auth.users where id = 'eeeeeeee-0000-0000-0000-000000000002')
    + (select count(*) from public.profiles where user_id = 'eeeeeeee-0000-0000-0000-000000000002')
    + (select count(*) from public.profile_skills where user_id = 'eeeeeeee-0000-0000-0000-000000000002')
    + (select count(*) from public.profile_contacts where user_id = 'eeeeeeee-0000-0000-0000-000000000002')
    + (select count(*) from public.crisis_matches where user_id = 'eeeeeeee-0000-0000-0000-000000000002'),
  5::bigint,
  'others_untouched: O''s user, profile, skill, phone and match remain'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-0000-0000-000000000001","role":"authenticated"}', true);

select is(
  (select count(*) from public.get_crisis_matches((select id from crisis_ids where name = 'live'))),
  1::bigint,
  'active_crisis_drops_resident: the live crisis list no longer includes R'
);

-- ---------------------------------------------------------------------------
-- A coordinator erases themselves (as K, fresh password sign-in)
-- ---------------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  format(
    '{"sub":"cccccccc-0000-0000-0000-000000000001","role":"authenticated","amr":[{"method":"password","timestamp":%s}]}',
    extract(epoch from now())::bigint
  ),
  true
);

select lives_ok(
  $$ select public.unregister_me() $$,
  'coordinator_erase_ok: a coordinator can erase their own account'
);

reset role;

select is(
  (select count(*) from public.user_roles where user_id = 'cccccccc-0000-0000-0000-000000000001'),
  0::bigint,
  'coordinator_erase: K''s role goes with the account'
);
select is(
  (select count(*) from public.coordinator_role_events where user_id = 'cccccccc-0000-0000-0000-000000000001'),
  1::bigint,
  'audit_kept: K''s role history keeps the bare id'
);
select is(
  (select activated_by from public.crises where id = (select id from crisis_ids where name = 'live')),
  'cccccccc-0000-0000-0000-000000000001'::uuid,
  'audit_kept: the crisis keeps activated_by'
);
select is(
  (select count(*) from public.contact_reveal_events where revealed_by = 'cccccccc-0000-0000-0000-000000000001'),
  1::bigint,
  'audit_kept: the reveal event keeps revealed_by'
);
select is(
  (select count(*) from auth.users where id = 'eeeeeeee-0000-0000-0000-000000000002'),
  1::bigint,
  'others_untouched: O still exists after K erases themselves'
);

-- ---------------------------------------------------------------------------
-- Ownership
-- ---------------------------------------------------------------------------

select is(
  (select pg_get_userbyid(proowner) from pg_proc where oid = 'public.unregister_me()'::regprocedure),
  'postgres',
  'definer_owner: unregister_me is owned by postgres'
);
select ok(
  (select prosecdef from pg_proc where oid = 'public.unregister_me()'::regprocedure),
  'definer_owner: unregister_me is security definer'
);

select * from finish();
rollback;
