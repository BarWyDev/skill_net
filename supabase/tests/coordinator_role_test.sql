-- Coordinator role guarantees: no self-promotion, operator-only grant/revoke, immediate
-- revoke, a complete event trail and client isolation from the history.
-- Run with `npm run test:db`. Everything is rolled back at the end.

begin;
create extension if not exists pgtap with schema extensions;

select plan(31);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres: bypasses RLS)
-- ---------------------------------------------------------------------------

-- R: resident, C: future coordinator.
insert into auth.users (id, email) values
  ('11111111-0000-0000-0000-000000000001', 'resident@test.local'),
  ('22222222-0000-0000-0000-000000000002', 'coord@test.local');

-- ---------------------------------------------------------------------------
-- is_coordinator_false_for_resident
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-0000-0000-0000-000000000001","role":"authenticated"}', true);

select is(public.is_coordinator(), false, 'is_coordinator_false_for_resident: a resident is not a coordinator');

reset role;

-- ---------------------------------------------------------------------------
-- grant_makes_coordinator / grant_matches_email_case_insensitively
-- ---------------------------------------------------------------------------

select lives_ok(
  $$ select public.grant_coordinator('  COORD@Test.Local ', 'test grant') $$,
  'grant_matches_email_case_insensitively: a mixed-case, padded email finds the user'
);
select is(
  (select granted_by from public.user_roles where user_id = '22222222-0000-0000-0000-000000000002'),
  'test grant',
  'grant_makes_coordinator: one role row, carrying the operator note'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-0000-0000-0000-000000000002","role":"authenticated"}', true);

select is(public.is_coordinator(), true, 'grant_makes_coordinator: the granted user is a coordinator');

reset role;

-- ---------------------------------------------------------------------------
-- grant_unknown_email_raises / grant_requires_note
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ select public.grant_coordinator('nobody@test.local', 'test') $$,
  'P0001',
  'unknown_email',
  'grant_unknown_email_raises: an unknown email raises unknown_email'
);
select throws_ok(
  $$ select public.grant_coordinator('resident@test.local', null) $$,
  'P0001',
  'note_required',
  'grant_requires_note: a null note raises note_required'
);
select throws_ok(
  $$ select public.grant_coordinator('resident@test.local', '   ') $$,
  'P0001',
  'note_required',
  'grant_requires_note: a blank note raises note_required'
);

-- ---------------------------------------------------------------------------
-- double_grant_is_noop
-- ---------------------------------------------------------------------------

select lives_ok(
  $$ select public.grant_coordinator('coord@test.local', 'second grant') $$,
  'double_grant_is_noop: a second grant does not raise'
);
select is(
  (select count(*) from public.user_roles where user_id = '22222222-0000-0000-0000-000000000002'),
  1::bigint,
  'double_grant_is_noop: still exactly one role row'
);
select is(
  (select count(*) from public.coordinator_role_events where user_id = '22222222-0000-0000-0000-000000000002'),
  1::bigint,
  'double_grant_is_noop: still exactly one grant event'
);

-- ---------------------------------------------------------------------------
-- no_self_promotion (as resident R)
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-0000-0000-0000-000000000001","role":"authenticated"}', true);

select throws_ok(
  $$ insert into public.user_roles (user_id, role, granted_by) values ('11111111-0000-0000-0000-000000000001', 'coordinator', 'me') $$,
  '42501',
  null::text,
  'no_self_promotion: a user cannot insert their own role'
);
select throws_ok(
  $$ update public.user_roles set user_id = '11111111-0000-0000-0000-000000000001' $$,
  '42501',
  null::text,
  'no_self_promotion: a user cannot update role rows'
);
select throws_ok(
  $$ delete from public.user_roles $$,
  '42501',
  null::text,
  'no_self_promotion: a user cannot delete role rows'
);

-- ---------------------------------------------------------------------------
-- owner_reads_only_own_role
-- ---------------------------------------------------------------------------

select is(
  (select count(*) from public.user_roles),
  0::bigint,
  'owner_reads_only_own_role: a resident does not see the coordinator''s row'
);

-- ---------------------------------------------------------------------------
-- grant_functions_not_executable_by_clients / events_hidden_from_clients (authenticated)
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ select public.grant_coordinator('resident@test.local', 'self') $$,
  '42501',
  null::text,
  'grant_functions_not_executable_by_clients: authenticated cannot call grant_coordinator'
);
select throws_ok(
  $$ select public.revoke_coordinator('coord@test.local', 'grief') $$,
  '42501',
  null::text,
  'grant_functions_not_executable_by_clients: authenticated cannot call revoke_coordinator'
);
select throws_ok(
  $$ select count(*) from public.coordinator_role_events $$,
  '42501',
  null::text,
  'events_hidden_from_clients: authenticated cannot read the history'
);
select throws_ok(
  $$ insert into public.coordinator_role_events (user_id, action, note) values ('11111111-0000-0000-0000-000000000001', 'grant', 'forged') $$,
  '42501',
  null::text,
  'events_hidden_from_clients: authenticated cannot forge an event'
);

-- The coordinator sees their own row.
select set_config('request.jwt.claims', '{"sub":"22222222-0000-0000-0000-000000000002","role":"authenticated"}', true);

select is(
  (select count(*) from public.user_roles),
  1::bigint,
  'owner_reads_only_own_role: the coordinator sees exactly their own row'
);

reset role;

-- ---------------------------------------------------------------------------
-- anon_cannot_check_or_read
-- ---------------------------------------------------------------------------

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok(
  $$ select public.is_coordinator() $$,
  '42501',
  null::text,
  'anon_cannot_check_or_read: anon cannot call is_coordinator'
);
select throws_ok(
  $$ select count(*) from public.user_roles $$,
  '42501',
  null::text,
  'anon_cannot_check_or_read: anon cannot read user_roles'
);
select throws_ok(
  $$ select public.grant_coordinator('resident@test.local', 'anon') $$,
  '42501',
  null::text,
  'grant_functions_not_executable_by_clients: anon cannot call grant_coordinator'
);

reset role;

-- The throws above would still pass through RLS and the invoker function bodies, so pin the
-- privilege revokes themselves.
select ok(
  not has_function_privilege('authenticated', 'public.grant_coordinator(text, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.revoke_coordinator(text, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.role_change_target(text, text)', 'execute')
  and not has_function_privilege('anon', 'public.grant_coordinator(text, text)', 'execute')
  and not has_function_privilege('anon', 'public.revoke_coordinator(text, text)', 'execute')
  and not has_function_privilege('anon', 'public.role_change_target(text, text)', 'execute'),
  'grant_functions_not_executable_by_clients: no execute privilege for anon or authenticated'
);
select ok(
  not has_table_privilege('authenticated', 'public.user_roles', 'insert')
  and not has_table_privilege('authenticated', 'public.user_roles', 'update')
  and not has_table_privilege('authenticated', 'public.user_roles', 'delete')
  and not has_table_privilege('anon', 'public.user_roles', 'select')
  and not has_table_privilege('authenticated', 'public.coordinator_role_events', 'select')
  and not has_table_privilege('authenticated', 'public.coordinator_role_events', 'insert'),
  'no_self_promotion: clients hold no write privilege on user_roles and no access to the history'
);

-- ---------------------------------------------------------------------------
-- revoke_is_immediate / revoke_non_coordinator_is_noop
-- ---------------------------------------------------------------------------

select lives_ok(
  $$ select public.revoke_coordinator('coord@test.local', 'test revoke') $$,
  'revoke_is_immediate: revoke succeeds'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-0000-0000-0000-000000000002","role":"authenticated"}', true);

select is(public.is_coordinator(), false, 'revoke_is_immediate: the same session is no longer a coordinator');

reset role;

select is(
  (
    select array_agg(action order by id)
    from public.coordinator_role_events
    where user_id = '22222222-0000-0000-0000-000000000002'
  ),
  array['grant', 'revoke'],
  'revoke_is_immediate: the history holds the grant then the revoke'
);

select lives_ok(
  $$ select public.revoke_coordinator('resident@test.local', 'not a coordinator') $$,
  'revoke_non_coordinator_is_noop: revoking a resident does not raise'
);
select is(
  (select count(*) from public.coordinator_role_events where user_id = '11111111-0000-0000-0000-000000000001'),
  0::bigint,
  'revoke_non_coordinator_is_noop: no event is written'
);

-- ---------------------------------------------------------------------------
-- user_delete_cascades_role
-- ---------------------------------------------------------------------------

select public.grant_coordinator('coord@test.local', 'regrant');
delete from auth.users where id = '22222222-0000-0000-0000-000000000002';

select is(
  (select count(*) from public.user_roles where user_id = '22222222-0000-0000-0000-000000000002'),
  0::bigint,
  'user_delete_cascades_role: deleting the account removes the role'
);
select is(
  (select count(*) from public.coordinator_role_events where user_id = '22222222-0000-0000-0000-000000000002'),
  3::bigint,
  'user_delete_cascades_role: the history outlives the account'
);

select * from finish();
rollback;
