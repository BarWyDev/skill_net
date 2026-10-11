-- Sign-up consent guarantees: the trigger records consent for an email sign-up and refuses one
-- without a published version (nothing created), fixture and non-email inserts are exempt, the
-- audit trail is owner-read-only and append-only, the consent gate RPCs, residents who never
-- consented are absent from crisis activation and the density map, and consent records survive
-- erasure.
-- Run with `npm run test:db`. Everything is rolled back at the end.

begin;
create extension if not exists pgtap with schema extensions;

select plan(39);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres: bypasses RLS, triggers still apply)
-- ---------------------------------------------------------------------------

-- Isolate the fixtures from the local demo seed.
delete from public.profiles;

-- ---------------------------------------------------------------------------
-- Structure
-- ---------------------------------------------------------------------------

select ok(
  (select relrowsecurity from pg_class where oid = 'public.consent_events'::regclass),
  'rls: consent_events has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.consent_versions'::regclass),
  'rls: consent_versions has RLS enabled'
);
select is(
  (select count(*) from public.consent_versions where version = '2026-10-06'),
  1::bigint,
  'published: the initial consent version is published'
);

-- ---------------------------------------------------------------------------
-- Sign-up trigger
-- ---------------------------------------------------------------------------

-- A: a GoTrue-shaped email sign-up with the current version.
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values (
  'aaaaaaaa-0000-0000-0000-000000000001', 'a@test.local',
  '{"provider":"email","providers":["email"]}', '{"consent_version":"2026-10-06"}'
);

select results_eq(
  $$ select version, source from public.consent_events where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  $$ values ('2026-10-06'::text, 'signup'::text) $$,
  'signup_records: an email sign-up with a published version writes one signup row'
);

select throws_ok(
  $$ insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values (
       'aaaaaaaa-0000-0000-0000-000000000002', 'b@test.local',
       '{"provider":"email","providers":["email"]}', '{}'
     ) $$,
  'P0001',
  'consent_required',
  'signup_without_consent: an email sign-up without a version is refused'
);

select throws_ok(
  $$ insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values (
       'aaaaaaaa-0000-0000-0000-000000000003', 'c@test.local',
       '{"provider":"email","providers":["email"]}', '{"consent_version":"1999-01-01"}'
     ) $$,
  'P0001',
  'consent_required',
  'signup_unknown_version: an email sign-up with an unpublished version is refused'
);

select is(
  (select count(*) from auth.users where id in ('aaaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000003')),
  0::bigint,
  'refusal_creates_nothing: refused sign-ups leave no account'
);

-- X: a fixture-style insert (no app metadata). N: a non-email provider.
select lives_ok(
  $$ insert into auth.users (id, email) values ('aaaaaaaa-0000-0000-0000-00000000000a', 'x@test.local') $$,
  'fixture_exempt: an insert without app metadata is not checked'
);
select lives_ok(
  $$ insert into auth.users (id, email, raw_app_meta_data) values (
       'aaaaaaaa-0000-0000-0000-00000000000b', 'n@test.local', '{"provider":"google","providers":["google"]}'
     ) $$,
  'non_email_exempt: a non-email sign-up is not checked'
);
select is(
  (select count(*) from public.consent_events where user_id in ('aaaaaaaa-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-00000000000b')),
  0::bigint,
  'exempt_records_nothing: exempt inserts write no consent row'
);

-- ---------------------------------------------------------------------------
-- Owner-read-only, append-only (as A)
-- ---------------------------------------------------------------------------

-- Another consenting user, so A has someone else's row to not see.
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values (
  'aaaaaaaa-0000-0000-0000-000000000004', 'd@test.local',
  '{"provider":"email","providers":["email"]}', '{"consent_version":"2026-10-06"}'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);

select is(
  (select count(*) from public.consent_events),
  1::bigint,
  'owner_read: A sees only their own consent row'
);
select throws_ok(
  $$ insert into public.consent_events (user_id, version, source)
     values ('aaaaaaaa-0000-0000-0000-000000000001', '2026-10-06', 'reaccept') $$,
  '42501',
  null::text,
  'no_insert: A cannot write a consent row directly'
);
select throws_ok(
  $$ update public.consent_events set version = '2026-10-06' $$,
  '42501',
  null::text,
  'no_update: A cannot change a consent row'
);
select throws_ok(
  $$ delete from public.consent_events $$,
  '42501',
  null::text,
  'no_delete: A cannot delete a consent row'
);
select throws_ok(
  $$ insert into public.consent_versions (version) values ('2099-01-01') $$,
  '42501',
  null::text,
  'no_publish: A cannot publish a consent version'
);
select is(
  public.my_latest_consent_version(),
  '2026-10-06',
  'latest_version: A''s latest consent is the sign-up version'
);

select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select is(
  public.my_latest_consent_version(),
  null::text,
  'latest_version_none: X, who never consented, gets null'
);

reset role;

-- ---------------------------------------------------------------------------
-- Matching and the density map
-- ---------------------------------------------------------------------------

-- K: a coordinator. D1..D3: consenting residents. A, D1..D3 and X share one 2 km square.
insert into auth.users (id, email) values ('cccccccc-0000-0000-0000-000000000001', 'coord@test.local');
insert into public.user_roles (user_id, role, granted_by)
values ('cccccccc-0000-0000-0000-000000000001', 'coordinator', 'test');

insert into auth.users (id, email)
select ('aaaaaaaa-0000-0000-0000-0000000000d' || i)::uuid, 'd' || i || '@test.local'
from generate_series(1, 3) as i;
insert into public.consent_events (user_id, version, source)
select ('aaaaaaaa-0000-0000-0000-0000000000d' || i)::uuid, '2026-10-06', 'signup'
from generate_series(1, 3) as i;

insert into public.profiles (user_id, location_source, location)
select u, 'pin', extensions.st_setsrid(extensions.st_makepoint(19.9366, 50.0614), 4326)::extensions.geography
from unnest(array[
  'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-00000000000a',
  'aaaaaaaa-0000-0000-0000-0000000000d1', 'aaaaaaaa-0000-0000-0000-0000000000d2',
  'aaaaaaaa-0000-0000-0000-0000000000d3'
]::uuid[]) as u;

insert into public.profile_skills (user_id, skill_slug, level)
select user_id, 'elektryk', 2 from public.profiles;

select ok(
  public.profile_is_matchable('aaaaaaaa-0000-0000-0000-000000000001'),
  'matchable_with_consent: A''s complete profile is matchable'
);
select ok(
  not public.profile_is_matchable('aaaaaaaa-0000-0000-0000-00000000000a'),
  'not_matchable_without_consent: X''s complete profile is not matchable'
);

create temp table crisis_ids (id uuid);
grant select, insert on crisis_ids to authenticated;

-- The map counts only accounts at least 14 days old with a confirmed email, and blurs counts with
-- noise (density k-anonymity migration). Age and confirm the fixtures; no noise, so counts are exact.
update auth.users
set created_at = least(created_at, now() - interval '30 days'),
    email_confirmed_at = coalesce(email_confirmed_at, now() - interval '30 days');
update public.skills_density_config set noise_amplitude = 0;
-- The map reads a daily snapshot (skills density snapshot migration): mark it stale, so the read
-- below is computed from these fixtures.
delete from public.skills_density_refreshes;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-0000-0000-000000000001","role":"authenticated"}', true);

insert into crisis_ids select public.activate_crisis('awaria-pradu', 'pin', null, 50.0614, 19.9366, 1);

-- Four consenting residents in the square: below the 5-resident threshold, so the square is
-- hidden. Counting X as well would make 5 and show it.
select is(
  (select count(*) from public.get_skills_density()),
  0::bigint,
  'density_excludes_unconsented: X does not count towards the density square'
);

reset role;

select is(
  (select count(*) from public.crisis_matches where crisis_id = (select id from crisis_ids)),
  4::bigint,
  'activation_matches_consented: the crisis matches A and D1..D3'
);
select is(
  (select count(*) from public.crisis_matches
   where crisis_id = (select id from crisis_ids) and user_id = 'aaaaaaaa-0000-0000-0000-00000000000a'),
  0::bigint,
  'activation_excludes_unconsented: the crisis does not match X'
);

-- ---------------------------------------------------------------------------
-- Consent gate RPC
-- ---------------------------------------------------------------------------

select ok(
  not has_function_privilege('anon', 'public.record_my_consent(text)', 'execute'),
  'anon_cannot_execute: anon has no execute on record_my_consent'
);
select ok(
  not has_function_privilege('anon', 'public.my_latest_consent_version()', 'execute'),
  'anon_cannot_execute: anon has no execute on my_latest_consent_version'
);
select ok(
  not has_function_privilege('authenticated', 'public.record_signup_consent()', 'execute'),
  'trigger_private: clients cannot execute the trigger function'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);

select throws_ok(
  $$ select public.record_my_consent('2026-10-06') $$,
  'P0001',
  'not_authenticated',
  'gate_not_authenticated: a token without a user is refused'
);

select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select throws_ok(
  $$ select public.record_my_consent('1999-01-01') $$,
  'P0001',
  'unknown_consent_version',
  'gate_unknown_version: an unpublished version is refused'
);
select lives_ok(
  $$ select public.record_my_consent('2026-10-06') $$,
  'gate_accept: X accepts the current version'
);
select is(
  public.my_latest_consent_version(),
  '2026-10-06',
  'gate_latest: X''s latest consent is now the current version'
);

reset role;

select results_eq(
  $$ select version, source from public.consent_events where user_id = 'aaaaaaaa-0000-0000-0000-00000000000a' $$,
  $$ values ('2026-10-06'::text, 'reaccept'::text) $$,
  'gate_records: the gate writes a reaccept row'
);
select ok(
  public.profile_is_matchable('aaaaaaaa-0000-0000-0000-00000000000a'),
  'gate_matchable: X is matchable once they consented'
);

-- A newer version: A's latest follows the newest row.
insert into public.consent_versions (version) values ('2099-01-01');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);

select public.record_my_consent('2099-01-01');
select is(
  public.my_latest_consent_version(),
  '2099-01-01',
  'latest_newest: the latest version follows the newest consent'
);

-- ---------------------------------------------------------------------------
-- Erasure keeps the record (as A, fresh password sign-in)
-- ---------------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  format(
    '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated","amr":[{"method":"password","timestamp":%s}]}',
    extract(epoch from now())::bigint
  ),
  true
);

select lives_ok(
  $$ select public.unregister_me() $$,
  'erase_ok: A erases their account'
);

reset role;

select is(
  (select count(*) from public.consent_events where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  2::bigint,
  'audit_kept: A''s consent rows keep the bare id after erasure'
);

-- ---------------------------------------------------------------------------
-- Ownership
-- ---------------------------------------------------------------------------

select is(
  (select pg_get_userbyid(proowner) from pg_proc where oid = 'public.record_signup_consent()'::regprocedure),
  'postgres',
  'definer_owner: record_signup_consent is owned by postgres'
);
select ok(
  (select prosecdef from pg_proc where oid = 'public.record_signup_consent()'::regprocedure)
    and (select prosecdef from pg_proc where oid = 'public.record_my_consent(text)'::regprocedure),
  'definer_owner: the trigger function and record_my_consent are security definer'
);

-- GoTrue inserts as supabase_auth_admin, which the test runner cannot become (membership is reserved
-- for superusers). These pin the properties that insert relies on instead; the smoke sign-up step
-- covers the real path through GoTrue.
select ok(
  exists (
    select 1 from pg_trigger t
    where t.tgrelid = 'auth.users'::regclass
      and t.tgfoid = 'public.record_signup_consent()'::regprocedure
      and t.tgenabled = 'O'
      and (t.tgtype & 1) = 1      -- for each row
      and (t.tgtype & 2) = 0      -- after
      and (t.tgtype & 4) = 4      -- insert
  ),
  'trigger_wiring: record_signup_consent fires after insert on auth.users, for each row, enabled'
);
select ok(
  (select proconfig from pg_proc where oid = 'public.record_signup_consent()'::regprocedure)
    = array['search_path=""']::text[],
  'trigger_search_path: record_signup_consent pins an empty search_path'
);
select ok(
  has_table_privilege('postgres', 'public.consent_events', 'insert'),
  'definer_can_write: the definer (postgres) can insert into consent_events'
);

select * from finish();
rollback;
