-- Crisis activation audit guarantees (security audit F-02): the activation reason, the per
-- coordinator rolling-hour throttle, and the log of every crisis list read.
-- Run with `npm run test:db`. Everything is rolled back at the end.

begin;
create extension if not exists pgtap with schema extensions;

select plan(27);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres: bypasses RLS, triggers still apply)
-- ---------------------------------------------------------------------------

-- Isolate the fixtures from the local demo seed (supabase/seed.sql).
delete from public.profiles;

-- K1, K2: coordinators. R: a resident. Residents 1–3: drivers in Kraków, in the mass-casualty matrix.
insert into auth.users (id, email) values
  ('cccccccc-0000-0000-0000-000000000001', 'coord1@test.local'),
  ('cccccccc-0000-0000-0000-000000000002', 'coord2@test.local'),
  ('eeeeeeee-0000-0000-0000-000000000000', 'resident@test.local');

insert into auth.users (id, email)
select ('00000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, 'u' || i || '@test.local'
from generate_series(1, 3) as i;

insert into public.user_roles (user_id, role, granted_by) values
  ('cccccccc-0000-0000-0000-000000000001', 'coordinator', 'test'),
  ('cccccccc-0000-0000-0000-000000000002', 'coordinator', 'test');

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
from generate_series(1, 3) as i;

insert into public.profile_skills (user_id, skill_slug, level)
select ('00000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, 'kierowca-kat-b', 2
from generate_series(1, 3) as i;

create temp table crisis_ids (name text primary key, id uuid);
create temp table read_counts (list text primary key, n bigint);
grant select, insert on crisis_ids, read_counts to authenticated;

-- ---------------------------------------------------------------------------
-- activation_reason
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-0000-0000-000000000001","role":"authenticated"}', true);

select lives_ok(
  $$
    insert into crisis_ids
    select 'first', public.activate_crisis(
      'wypadek-masowy', 'pin', null, 50.0614, 19.9366, 1, '  Wypadek autobusu na Alejach, potrzebni kierowcy  '
    )
  $$,
  'activation_reason: a coordinator activates with a reason'
);
select is(
  (select reason from public.crises where id = (select id from crisis_ids where name = 'first')),
  'Wypadek autobusu na Alejach, potrzebni kierowcy',
  'activation_reason: the reason is stored trimmed'
);
select throws_ok(
  $$ select public.activate_crisis('wypadek-masowy', 'pin', null, 50.0614, 19.9366, 1, 'krótko') $$,
  'P0001',
  'reason_required',
  'activation_reason: a reason under 10 characters raises reason_required'
);
select throws_ok(
  $$ select public.activate_crisis('wypadek-masowy', 'pin', null, 50.0614, 19.9366, 1, '            ') $$,
  'P0001',
  'reason_required',
  'activation_reason: a blank reason raises reason_required'
);
select throws_ok(
  $$ select public.activate_crisis('wypadek-masowy', 'pin', null, 50.0614, 19.9366, 1, repeat('x', 501)) $$,
  'P0001',
  'reason_too_long',
  'activation_reason: a reason over 500 characters raises reason_too_long'
);
select lives_ok(
  $$ insert into crisis_ids select 'legacy', public.activate_crisis('wypadek-masowy', 'pin', null, 50.0614, 19.9366, 1) $$,
  'activation_reason: until the contract migration, a call without a reason still activates'
);
select is(
  (select reason from public.crises where id = (select id from crisis_ids where name = 'legacy')),
  null,
  'activation_reason: a call without a reason stores a null reason'
);

-- ---------------------------------------------------------------------------
-- activation_throttle (K1 has 2 activations so far; refused ones do not count)
-- ---------------------------------------------------------------------------

select lives_ok(
  $$
    insert into crisis_ids
    select 'third', public.activate_crisis('wypadek-masowy', 'pin', null, 50.08, 19.95, 1, 'Trzecia aktywacja w ciągu godziny')
  $$,
  'activation_throttle: the 3rd activation within an hour succeeds'
);
select is(
  public.end_crisis((select id from crisis_ids where name = 'third')),
  true,
  'activation_throttle: the coordinator ends the 3rd crisis'
);
select throws_ok(
  $$ select public.activate_crisis('wypadek-masowy', 'pin', null, 50.05, 19.92, 1, 'Czwarta aktywacja w ciągu godziny') $$,
  'P0001',
  'activation_rate_limited',
  'activation_throttle: the 4th activation within an hour raises activation_rate_limited, ended crises included'
);

select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-0000-0000-000000000002","role":"authenticated"}', true);

select lives_ok(
  $$ select public.activate_crisis('wypadek-masowy', 'pin', null, 50.05, 19.92, 1, 'Inny koordynator, osobny limit') $$,
  'activation_throttle: the limit is per coordinator'
);

reset role;
update public.crises
set activated_at = activated_at - interval '61 minutes'
where id = (select id from crisis_ids where name = 'legacy');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-0000-0000-000000000001","role":"authenticated"}', true);

select lives_ok(
  $$ select public.activate_crisis('wypadek-masowy', 'pin', null, 50.05, 19.92, 1, 'Po godzinie limit się odnawia') $$,
  'activation_throttle: activations older than an hour no longer count'
);
select throws_ok(
  $$ select public.activate_crisis('wypadek-masowy', 'pin', null, 50.05, 19.92, 1, 'Znowu trzy w ciągu godziny') $$,
  'P0001',
  'activation_rate_limited',
  'activation_throttle: the rolling hour counts only the recent activations'
);

-- ---------------------------------------------------------------------------
-- list_reads_logged
-- ---------------------------------------------------------------------------

insert into read_counts
select 'matches', count(*) from public.get_crisis_matches((select id from crisis_ids where name = 'first'));
insert into read_counts
select 'teams', count(*)
from public.get_team_candidates((select id from crisis_ids where name = 'first'), 'ewakuacyjny', 1);

select throws_ok(
  $$ select * from public.get_team_candidates((select id from crisis_ids where name = 'first'), 'nie-ma', 1) $$,
  'P0001',
  'unknown_template',
  'list_reads_logged: a refused team read raises before anything is returned'
);
select throws_ok(
  $$ select count(*) from public.crisis_list_views $$,
  '42501',
  null::text,
  'list_reads_logged: even a coordinator cannot read the log'
);
select throws_ok(
  $$ insert into public.crisis_list_views (crisis_id, viewed_by, list, returned_count)
     values ((select id from crisis_ids where name = 'first'), 'cccccccc-0000-0000-0000-000000000001', 'matches', 0) $$,
  '42501',
  null::text,
  'list_reads_logged: a coordinator cannot write the log directly'
);

-- R is not a coordinator: refused, so nothing is logged for them.
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-0000-0000-000000000000","role":"authenticated"}', true);

select throws_ok(
  $$ select * from public.get_crisis_matches((select id from crisis_ids where name = 'first')) $$,
  'P0001',
  'not_coordinator',
  'list_reads_logged: a resident cannot read the list'
);

reset role;

select is(
  (select n from read_counts where list = 'matches'),
  3::bigint,
  'list_reads_logged: the coordinator read all 3 matched residents'
);
select results_eq(
  $$
    select viewed_by, list, returned_count::bigint
    from public.crisis_list_views
    where crisis_id = (select id from crisis_ids where name = 'first')
    order by id
  $$,
  $$
    values
      ('cccccccc-0000-0000-0000-000000000001'::uuid, 'matches', (select n from read_counts where list = 'matches')),
      ('cccccccc-0000-0000-0000-000000000001'::uuid, 'teams', (select n from read_counts where list = 'teams'))
  $$,
  'list_reads_logged: one row per successful read, with the reader, the list and the row count'
);
select is(
  (select count(*) from public.crisis_list_views where viewed_by = 'eeeeeeee-0000-0000-0000-000000000000'),
  0::bigint,
  'list_reads_logged: a refused read leaves no row'
);
select ok(
  (select viewed_at = now() from public.crisis_list_views order by id limit 1),
  'list_reads_logged: the read time is recorded'
);

-- ---------------------------------------------------------------------------
-- privileges_and_shape
-- ---------------------------------------------------------------------------

select ok(
  (select relrowsecurity from pg_class where oid = 'public.crisis_list_views'::regclass),
  'privileges_and_shape: RLS is enabled on crisis_list_views'
);
select ok(
  not has_table_privilege('anon', 'public.crisis_list_views', 'select')
  and not has_table_privilege('authenticated', 'public.crisis_list_views', 'select')
  and not has_table_privilege('authenticated', 'public.crisis_list_views', 'insert')
  and not has_table_privilege('authenticated', 'public.crisis_list_views', 'update')
  and not has_table_privilege('authenticated', 'public.crisis_list_views', 'delete'),
  'privileges_and_shape: no client access to the log'
);
select ok(
  not has_function_privilege('anon', 'public.activate_crisis(text, text, text, double precision, double precision, integer, text)', 'execute')
  and has_function_privilege('authenticated', 'public.activate_crisis(text, text, text, double precision, double precision, integer, text)', 'execute'),
  'privileges_and_shape: only authenticated can execute activate_crisis'
);
select is(
  (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'activate_crisis'),
  1::bigint,
  'privileges_and_shape: one activate_crisis overload, so PostgREST calls stay unambiguous'
);
select is(
  (select array_agg(provolatile::text order by proname) from pg_proc
   where pronamespace = 'public'::regnamespace and proname in ('get_crisis_matches', 'get_team_candidates')),
  array['v', 'v'],
  'privileges_and_shape: the list reads are volatile, so PostgREST runs them read-write'
);
select col_not_null('public', 'crisis_list_views', 'viewed_by', 'privileges_and_shape: viewed_by is required');

select * from finish();
rollback;
