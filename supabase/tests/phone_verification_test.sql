-- Phone verification guarantees (S-07, Phase 2): the worker-token gate, the code's life (wrong
-- attempts, expiry, a changed number), one verified number per account, the hourly send limit,
-- the daily SMS budget, and that no client can reach the tables or call the RPCs as a signed-in user.
-- Run with `npm run test:db`. Everything is rolled back at the end.

begin;
create extension if not exists pgtap with schema extensions;

select plan(39);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres: bypasses RLS, triggers still apply)
-- ---------------------------------------------------------------------------

-- A local database may carry an operator's token row and today's usage; start from neither.
delete from private.worker_tokens;
delete from private.sms_daily_usage;

-- A: the main resident. B: same number as A. C and D: share another number. E: no phone.
-- F: attempts and expiry. G: the send limit.
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@test.local'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'b@test.local'),
  ('cccccccc-0000-0000-0000-000000000003', 'c@test.local'),
  ('dddddddd-0000-0000-0000-000000000004', 'd@test.local'),
  ('eeeeeeee-0000-0000-0000-000000000005', 'e@test.local'),
  ('ffffffff-0000-0000-0000-000000000006', 'f@test.local'),
  ('99999999-0000-0000-0000-000000000007', 'g@test.local');

insert into public.profiles (user_id, location_source, location)
select u.id, 'pin', extensions.st_setsrid(extensions.st_makepoint(19.9366, 50.0614), 4326)::extensions.geography
from auth.users u
where u.email like '%@test.local';

insert into public.profile_contacts (user_id, phone) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '+48600000001'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '+48600000001'),
  ('cccccccc-0000-0000-0000-000000000003', '+48600000003'),
  ('dddddddd-0000-0000-0000-000000000004', '+48600000003'),
  ('ffffffff-0000-0000-0000-000000000006', '+48600000006'),
  ('99999999-0000-0000-0000-000000000007', '+48600000007');

-- The code hashes the Worker would send: 64 hex characters.
create temp table hashes (name text primary key, h text);
insert into hashes values ('good', repeat('a', 64)), ('wrong', repeat('b', 64)), ('second', repeat('c', 64));
grant select on hashes to anon;

-- ---------------------------------------------------------------------------
-- Grants: the tables are closed, and only anon can call the RPCs
-- ---------------------------------------------------------------------------

select ok(
  not has_table_privilege('anon', 'public.phone_verification_codes', 'SELECT')
  and not has_table_privilege('anon', 'public.phone_verification_codes', 'INSERT')
  and not has_table_privilege('authenticated', 'public.phone_verification_codes', 'SELECT')
  and not has_table_privilege('authenticated', 'public.phone_verification_codes', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.phone_verification_codes', 'DELETE'),
  'codes_table_closed: no client can read or write pending codes'
);
select ok(
  not has_schema_privilege('anon', 'private', 'USAGE')
  and not has_schema_privilege('authenticated', 'private', 'USAGE')
  and not has_table_privilege('anon', 'private.worker_tokens', 'SELECT')
  and not has_table_privilege('authenticated', 'private.worker_tokens', 'SELECT')
  and not has_table_privilege('authenticated', 'private.sms_daily_usage', 'SELECT'),
  'private_schema_closed: clients cannot enter the private schema or read its tables'
);
select ok(
  not has_function_privilege('anon', 'private.check_worker_token(text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'private.take_sms_budget(integer)', 'EXECUTE'),
  'private_functions_closed: clients cannot call the private helpers'
);
select ok(
  has_function_privilege('anon', 'public.begin_phone_verification(text, uuid, text)', 'EXECUTE')
  and has_function_privilege('anon', 'public.confirm_phone_verification(text, uuid, text)', 'EXECUTE'),
  'rpc_anon: the Worker (anon, publishable key) can call the token-gated RPCs'
);
select ok(
  not has_function_privilege('authenticated', 'public.begin_phone_verification(text, uuid, text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.confirm_phone_verification(text, uuid, text)', 'EXECUTE'),
  'rpc_not_authenticated: a signed-in client cannot call the token-gated RPCs'
);

-- ---------------------------------------------------------------------------
-- The token gate
-- ---------------------------------------------------------------------------

set local role anon;

select throws_ok(
  $$ select public.begin_phone_verification('test-token', 'aaaaaaaa-0000-0000-0000-000000000001', repeat('a', 64)) $$,
  'P0001', 'worker_token_unset',
  'token_unset: nothing works until an operator stores the token hash'
);

reset role;
insert into private.worker_tokens (name, token_hash)
values ('sms_worker', encode(sha256(convert_to('test-token', 'UTF8')), 'hex'));
set local role anon;

select throws_ok(
  $$ select public.begin_phone_verification('other-token', 'aaaaaaaa-0000-0000-0000-000000000001', repeat('a', 64)) $$,
  'P0001', 'worker_token_invalid',
  'token_wrong_begin: a wrong token cannot start a verification'
);
select throws_ok(
  $$ select public.confirm_phone_verification('other-token', 'aaaaaaaa-0000-0000-0000-000000000001', repeat('a', 64)) $$,
  'P0001', 'worker_token_invalid',
  'token_wrong_confirm: a wrong token cannot confirm a code'
);
select throws_ok(
  $$ select public.begin_phone_verification(null, 'aaaaaaaa-0000-0000-0000-000000000001', repeat('a', 64)) $$,
  'P0001', 'worker_token_invalid',
  'token_null: a missing token is refused'
);

-- ---------------------------------------------------------------------------
-- Starting a verification
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ select public.begin_phone_verification('test-token', 'aaaaaaaa-0000-0000-0000-000000000001', '123456') $$,
  'P0001', 'invalid_code_hash',
  'begin_hash_shape: a plain code is refused; only a hash is stored'
);
select throws_ok(
  $$ select public.begin_phone_verification('test-token', 'eeeeeeee-0000-0000-0000-000000000005', repeat('a', 64)) $$,
  'P0001', 'no_phone',
  'begin_no_phone: a resident without a number has nothing to verify'
);
select throws_ok(
  $$ select public.confirm_phone_verification('test-token', 'aaaaaaaa-0000-0000-0000-000000000001', repeat('a', 64)) $$,
  'P0001', 'expired',
  'confirm_without_code: there is nothing to confirm before a code was sent'
);
select is(
  public.begin_phone_verification('test-token', 'aaaaaaaa-0000-0000-0000-000000000001', repeat('a', 64)),
  '+48600000001',
  'begin_returns_phone: the Worker learns where to send the code'
);

reset role;
select ok(
  (select v.code_hash = repeat('a', 64) and v.phone = '+48600000001' and v.attempts = 0 and v.window_sends = 1
          and v.expires_at between now() + interval '9 minutes' and now() + interval '10 minutes'
   from public.phone_verification_codes v where v.user_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  'begin_stores_hash: the hash, the number, a 10-minute expiry and the first send are recorded'
);
select is(
  (select sent from private.sms_daily_usage), 1,
  'begin_takes_budget: a code takes one SMS from the daily budget'
);

-- ---------------------------------------------------------------------------
-- Confirming
-- ---------------------------------------------------------------------------

set local role anon;
select is(
  public.confirm_phone_verification('test-token', 'aaaaaaaa-0000-0000-0000-000000000001', repeat('b', 64)),
  false,
  'confirm_wrong: a wrong code is refused'
);
reset role;
select is(
  (select attempts from public.phone_verification_codes where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 1,
  'confirm_wrong_counts: the wrong attempt is counted'
);
select is(
  (select phone_verified_at from public.profile_contacts where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  null::timestamptz,
  'confirm_wrong_unverified: a wrong code verifies nothing'
);

set local role anon;
select is(
  public.confirm_phone_verification('test-token', 'aaaaaaaa-0000-0000-0000-000000000001', repeat('a', 64)),
  true,
  'confirm_right: the right code is accepted'
);
reset role;
select isnt(
  (select phone_verified_at from public.profile_contacts where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  null::timestamptz,
  'confirm_sets_verified: the number is now verified'
);
select ok(
  (select v.code_hash is null and v.phone is null and v.expires_at is null and v.window_sends = 1
   from public.phone_verification_codes v where v.user_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  'confirm_clears_code: the used code and its number are gone; the send count stays'
);

set local role anon;
select throws_ok(
  $$ select public.confirm_phone_verification('test-token', 'aaaaaaaa-0000-0000-0000-000000000001', repeat('a', 64)) $$,
  'P0001', 'expired',
  'confirm_once: a used code cannot be replayed'
);
select throws_ok(
  $$ select public.begin_phone_verification('test-token', 'aaaaaaaa-0000-0000-0000-000000000001', repeat('a', 64)) $$,
  'P0001', 'already_verified',
  'begin_verified: a verified number needs no new code'
);

-- ---------------------------------------------------------------------------
-- One verified number per account
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ select public.begin_phone_verification('test-token', 'bbbbbbbb-0000-0000-0000-000000000002', repeat('a', 64)) $$,
  'P0001', 'phone_taken',
  'taken_begin: a number verified on account A cannot be verified on account B'
);

-- C and D both hold a code for the same, still unverified, number. C confirms first.
select is(
  public.begin_phone_verification('test-token', 'cccccccc-0000-0000-0000-000000000003', repeat('a', 64)),
  '+48600000003', 'taken_race: C starts'
);
select is(
  public.begin_phone_verification('test-token', 'dddddddd-0000-0000-0000-000000000004', repeat('c', 64)),
  '+48600000003', 'taken_race: D starts with the same number'
);
select is(
  public.confirm_phone_verification('test-token', 'cccccccc-0000-0000-0000-000000000003', repeat('a', 64)),
  true, 'taken_race: C confirms first'
);
select throws_ok(
  $$ select public.confirm_phone_verification('test-token', 'dddddddd-0000-0000-0000-000000000004', repeat('c', 64)) $$,
  'P0001', 'phone_taken',
  'taken_confirm: D''s right code is refused once C holds the number'
);

-- ---------------------------------------------------------------------------
-- A changed number, expiry and too many attempts (F)
-- ---------------------------------------------------------------------------

select is(
  public.begin_phone_verification('test-token', 'ffffffff-0000-0000-0000-000000000006', repeat('a', 64)),
  '+48600000006', 'f_begin: F starts'
);
reset role;
update public.profile_contacts set phone = '+48600000066' where user_id = 'ffffffff-0000-0000-0000-000000000006';
set local role anon;
select throws_ok(
  $$ select public.confirm_phone_verification('test-token', 'ffffffff-0000-0000-0000-000000000006', repeat('a', 64)) $$,
  'P0001', 'expired',
  'changed_number: a code sent to the old number cannot verify the new one'
);

select is(
  public.begin_phone_verification('test-token', 'ffffffff-0000-0000-0000-000000000006', repeat('a', 64)),
  '+48600000066', 'f_begin_again: a new code goes to the new number'
);
reset role;
update public.phone_verification_codes set expires_at = now() - interval '1 second'
where user_id = 'ffffffff-0000-0000-0000-000000000006';
set local role anon;
select throws_ok(
  $$ select public.confirm_phone_verification('test-token', 'ffffffff-0000-0000-0000-000000000006', repeat('a', 64)) $$,
  'P0001', 'expired',
  'expired_code: a code past its 10 minutes is refused'
);

select is(
  public.begin_phone_verification('test-token', 'ffffffff-0000-0000-0000-000000000006', repeat('a', 64)),
  '+48600000066', 'f_begin_third: the third code in the hour'
);
select is(
  (select count(*) filter (where not ok)
   from (
     select public.confirm_phone_verification('test-token', 'ffffffff-0000-0000-0000-000000000006', repeat('b', 64)) as ok
     from generate_series(1, 5)
   ) as tries),
  5::bigint,
  'attempts_five: five wrong codes are each refused'
);
select throws_ok(
  $$ select public.confirm_phone_verification('test-token', 'ffffffff-0000-0000-0000-000000000006', repeat('a', 64)) $$,
  'P0001', 'too_many_attempts',
  'attempts_locked: after five wrong codes even the right one is refused'
);

-- ---------------------------------------------------------------------------
-- The hourly send limit (F has used three; G shows the window moving on)
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ select public.begin_phone_verification('test-token', 'ffffffff-0000-0000-0000-000000000006', repeat('a', 64)) $$,
  'P0001', 'rate_limited',
  'rate_limit: a fourth code within the hour is refused'
);
reset role;
update public.phone_verification_codes set window_started_at = now() - interval '61 minutes'
where user_id = 'ffffffff-0000-0000-0000-000000000006';
set local role anon;
select is(
  public.begin_phone_verification('test-token', 'ffffffff-0000-0000-0000-000000000006', repeat('a', 64)),
  '+48600000066',
  'rate_limit_window: an hour later a code can be sent again'
);

-- ---------------------------------------------------------------------------
-- The daily budget
-- ---------------------------------------------------------------------------

reset role;
update private.sms_daily_usage set sent = private.sms_daily_budget();
set local role anon;
select throws_ok(
  $$ select public.begin_phone_verification('test-token', '99999999-0000-0000-0000-000000000007', repeat('a', 64)) $$,
  'P0001', 'sms_budget_exhausted',
  'budget: no code is sent once the day''s SMS budget is used up'
);
reset role;
select is(
  (select count(*) from public.phone_verification_codes where user_id = '99999999-0000-0000-0000-000000000007'),
  0::bigint,
  'budget_no_code: a refused send leaves no pending code behind'
);

select * from finish();
rollback;
