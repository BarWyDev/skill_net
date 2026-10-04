-- Break-glass contact reveal guarantees: the access boundary, the active-crisis and reason checks
-- (with no event written on refusal), the scope (every matched resident with a phone, past the
-- 200-row page cap, current number, no residents without a phone), the audit rows, the client
-- privilege boundary on the log, and the log surviving crisis end and account deletion.
-- Run with `npm run test:db`. Everything is rolled back at the end.

begin;
create extension if not exists pgtap with schema extensions;

select plan(34);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres: bypasses RLS, triggers still apply)
-- ---------------------------------------------------------------------------

-- Isolate the fixtures from the local demo seed (supabase/seed.sql).
delete from public.profiles;

-- K1, K2: coordinators. R: a resident. Residents 1–205 have phones and 206–208 do not, all in
-- Kraków. Residents 301–302 are in Warsaw, without phones.
insert into auth.users (id, email) values
  ('cccccccc-0000-0000-0000-000000000001', 'coord1@test.local'),
  ('cccccccc-0000-0000-0000-000000000002', 'coord2@test.local'),
  ('eeeeeeee-0000-0000-0000-000000000000', 'resident@test.local');

insert into auth.users (id, email)
select ('00000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, 'u' || i || '@test.local'
from (select generate_series(1, 208) as i union all select generate_series(301, 302)) as s;

insert into public.user_roles (user_id, role, granted_by) values
  ('cccccccc-0000-0000-0000-000000000001', 'coordinator', 'test'),
  ('cccccccc-0000-0000-0000-000000000002', 'coordinator', 'test');

insert into public.profiles (user_id, location_source, location)
select
  ('00000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid,
  'pin',
  case
    when i < 300 then extensions.st_setsrid(extensions.st_makepoint(19.9366, 50.0614), 4326)::extensions.geography
    else extensions.st_setsrid(extensions.st_makepoint(21.0122, 52.2297), 4326)::extensions.geography
  end
from (select generate_series(1, 208) as i union all select generate_series(301, 302)) as s;

insert into public.profile_skills (user_id, skill_slug, level)
select user_id, 'elektryk', 2 from public.profiles;

insert into public.profile_contacts (user_id, phone)
select ('00000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, '+48600' || lpad(i::text, 6, '0')
from generate_series(1, 205) as i;

-- Resident 3's number is verified (only S-07 will set this outside tests).
update public.profile_contacts set phone_verified_at = now()
where user_id = '00000000-0000-0000-0000-000000000003';

create temp table crisis_ids (name text primary key, id uuid);
create temp table reveal_rows (
  ord bigint generated always as identity,
  rank integer, "position" integer, distance_km_rounded numeric, matched_skills jsonb,
  phone text, phone_verified boolean, availability_slots integer, available_now boolean
);
grant select, insert on crisis_ids, reveal_rows to authenticated;

-- K1 activates three crises: a large Kraków one, one to end, and a Warsaw one without phones.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-0000-0000-000000000001","role":"authenticated"}', true);

insert into crisis_ids
select 'big', public.activate_crisis('awaria-pradu', 'pin', null, 50.0614, 19.9366, 1);
insert into crisis_ids
select 'ended', public.activate_crisis('awaria-pradu', 'pin', null, 50.0614, 19.9366, 1);
insert into crisis_ids
select 'nophones', public.activate_crisis('awaria-pradu', 'pin', null, 52.2297, 21.0122, 1);
select public.end_crisis((select id from crisis_ids where name = 'ended'));

reset role;

-- Resident 1 changes their number after activation.
update public.profile_contacts set phone = '+48699999999'
where user_id = '00000000-0000-0000-0000-000000000001';

select is(
  (select match_count from public.crises where id = (select id from crisis_ids where name = 'big')),
  208,
  'fixtures: the large crisis matched all 208 Kraków residents'
);

-- ---------------------------------------------------------------------------
-- Access boundary
-- ---------------------------------------------------------------------------

select ok(
  not has_function_privilege('anon', 'public.reveal_crisis_contacts(uuid, text)', 'execute'),
  'anon_cannot_execute: anon has no execute on reveal_crisis_contacts'
);

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok(
  $$ select * from public.reveal_crisis_contacts('99999999-0000-0000-0000-000000000000', 'Brak potwierdzeń w nocy') $$,
  '42501',
  null::text,
  'anon_cannot_execute: anon cannot call reveal_crisis_contacts'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-0000-0000-000000000000","role":"authenticated"}', true);

select throws_ok(
  $$ select * from public.reveal_crisis_contacts((select id from crisis_ids where name = 'big'), 'Brak potwierdzeń w nocy') $$,
  'P0001',
  'not_coordinator',
  'resident_refused: a resident gets not_coordinator'
);

-- ---------------------------------------------------------------------------
-- Crisis and reason checks (as K1)
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-0000-0000-000000000001","role":"authenticated"}', true);

select throws_ok(
  $$ select * from public.reveal_crisis_contacts('99999999-0000-0000-0000-000000000000', 'Brak potwierdzeń w nocy') $$,
  'P0001',
  'unknown_crisis',
  'unknown_crisis: an unknown id raises unknown_crisis'
);
select throws_ok(
  $$ select * from public.reveal_crisis_contacts((select id from crisis_ids where name = 'ended'), 'Brak potwierdzeń w nocy') $$,
  'P0001',
  'crisis_not_active',
  'ended_crisis: an ended crisis raises crisis_not_active'
);
select throws_ok(
  $$ select * from public.reveal_crisis_contacts((select id from crisis_ids where name = 'big'), null) $$,
  'P0001',
  'reason_required',
  'reason_required: a null reason is refused'
);
select throws_ok(
  $$ select * from public.reveal_crisis_contacts((select id from crisis_ids where name = 'big'), '   ') $$,
  'P0001',
  'reason_required',
  'reason_required: a blank reason is refused'
);
select throws_ok(
  $$ select * from public.reveal_crisis_contacts((select id from crisis_ids where name = 'big'), '  krótko  ') $$,
  'P0001',
  'reason_required',
  'reason_required: a reason under 10 characters after trimming is refused'
);
select throws_ok(
  $$ select * from public.reveal_crisis_contacts((select id from crisis_ids where name = 'big'), repeat('x', 501)) $$,
  'P0001',
  'reason_too_long',
  'reason_too_long: a reason over 500 characters is refused'
);

reset role;

select is(
  (select count(*) from public.contact_reveal_events),
  0::bigint,
  'refusals_not_logged: no refused call wrote an event'
);

-- ---------------------------------------------------------------------------
-- Scope and audit rows (K1 reveals the large crisis)
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-0000-0000-000000000001","role":"authenticated"}', true);

insert into reveal_rows (rank, "position", distance_km_rounded, matched_skills, phone, phone_verified, availability_slots, available_now)
select * from public.reveal_crisis_contacts((select id from crisis_ids where name = 'big'), '  Brak potwierdzeń, awaria sieci  ');

reset role;

select is(
  (select count(*) from reveal_rows),
  205::bigint,
  'scope_beyond_page_cap: every matched resident with a phone is returned, past 200'
);
select is(
  (select array_agg("position" order by ord) from reveal_rows),
  (select array_agg("position" order by "position") from reveal_rows),
  'position_order: rows come back in position order'
);
select is(
  (select count(*) from reveal_rows where phone is null),
  0::bigint,
  'no_phone_absent: no returned row lacks a phone'
);
select is(
  (select count(*) from reveal_rows r join public.profile_contacts pc on pc.phone = r.phone
   where pc.user_id in (
     '00000000-0000-0000-0000-000000000206', '00000000-0000-0000-0000-000000000207',
     '00000000-0000-0000-0000-000000000208'
   )),
  0::bigint,
  'no_phone_absent: residents without a phone are not returned'
);
select ok(
  exists (select 1 from reveal_rows where phone = '+48699999999')
  and not exists (select 1 from reveal_rows where phone = '+48600000001'),
  'current_number: a number changed after activation is returned as it is now'
);
select is(
  (select count(*) from reveal_rows where phone_verified),
  1::bigint,
  'phone_verified: only the verified number is marked verified'
);
select ok(
  (select bool_and(distance_km_rounded = 0 and jsonb_array_length(matched_skills) = 1) from reveal_rows),
  'row_shape: distance and skills come from the snapshot, as in get_crisis_matches'
);

select is(
  (select count(*) from public.contact_reveal_events),
  1::bigint,
  'audit_event: one call writes one event'
);
select is(
  (select row(crisis_id, revealed_by, reason, revealed_count)::text from public.contact_reveal_events),
  row(
    (select id from crisis_ids where name = 'big'),
    'cccccccc-0000-0000-0000-000000000001'::uuid,
    'Brak potwierdzeń, awaria sieci',
    205
  )::text,
  'audit_event: the event records the crisis, the caller, the trimmed reason and the count'
);
select set_eq(
  $$ select user_id from public.contact_reveal_subjects $$,
  $$ select ('00000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid from generate_series(1, 205) as i $$,
  'audit_subjects: exactly one subject row per returned resident'
);

-- K2 reveals the same crisis again; K1 reveals the Warsaw crisis, which has no phones.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-0000-0000-000000000002","role":"authenticated"}', true);

select is(
  (select count(*) from public.reveal_crisis_contacts((select id from crisis_ids where name = 'big'), 'Przejęcie zmiany, brak odpowiedzi')),
  205::bigint,
  'second_reveal: another coordinator gets the numbers through their own reveal'
);

select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-0000-0000-000000000001","role":"authenticated"}', true);

select is(
  (select count(*) from public.reveal_crisis_contacts((select id from crisis_ids where name = 'nophones'), 'Sprawdzam, czy ktoś ma telefon')),
  0::bigint,
  'zero_numbers: a crisis without phones returns no rows'
);

reset role;

select is(
  (select count(*) from public.contact_reveal_events where crisis_id = (select id from crisis_ids where name = 'big')),
  2::bigint,
  'second_reveal: two calls write two events'
);
select is(
  (select revealed_count from public.contact_reveal_events where crisis_id = (select id from crisis_ids where name = 'nophones')),
  0,
  'zero_numbers: the reveal is still logged, with revealed_count 0'
);

-- ---------------------------------------------------------------------------
-- Client privilege boundary on the log (as coordinator K1)
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-0000-0000-000000000001","role":"authenticated"}', true);

select throws_ok(
  $$ select * from public.contact_reveal_events $$,
  '42501',
  null::text,
  'log_private: a coordinator cannot read events'
);
select throws_ok(
  $$ insert into public.contact_reveal_events (crisis_id, revealed_by, reason)
     values ((select id from crisis_ids where name = 'big'), 'cccccccc-0000-0000-0000-000000000001', 'Podrobiony wpis w logu') $$,
  '42501',
  null::text,
  'log_private: a coordinator cannot insert events'
);
select throws_ok(
  $$ update public.contact_reveal_events set reason = 'Zmieniony powód w logu' $$,
  '42501',
  null::text,
  'log_private: a coordinator cannot update events'
);
select throws_ok(
  $$ select * from public.contact_reveal_subjects $$,
  '42501',
  null::text,
  'log_private: a coordinator cannot read subjects'
);
select throws_ok(
  $$ delete from public.contact_reveal_subjects $$,
  '42501',
  null::text,
  'log_private: a coordinator cannot delete subjects'
);

-- ---------------------------------------------------------------------------
-- The log survives crisis end and account deletion
-- ---------------------------------------------------------------------------

select public.end_crisis((select id from crisis_ids where name = 'big'));

reset role;

select is(
  (select count(*) from public.contact_reveal_subjects s
   join public.contact_reveal_events e on e.id = s.event_id
   where e.crisis_id = (select id from crisis_ids where name = 'big')),
  410::bigint,
  'survives_end: subject rows remain after end_crisis deletes the snapshot'
);

select lives_ok(
  $$ delete from auth.users where id = '00000000-0000-0000-0000-000000000002' $$,
  'survives_deletion: a revealed resident''s account can still be deleted'
);
select is(
  (select count(*) from public.contact_reveal_subjects where user_id = '00000000-0000-0000-0000-000000000002'),
  2::bigint,
  'survives_deletion: the deleted resident''s subject rows remain'
);

-- ---------------------------------------------------------------------------
-- No other RPC exposes a number
-- ---------------------------------------------------------------------------

select ok(
  not exists (
    select 1 from pg_proc, unnest(proargnames) as arg
    where oid = 'public.get_crisis_matches(uuid, integer)'::regprocedure and arg = 'phone'
  ),
  'get_crisis_matches_unchanged: get_crisis_matches still has no phone column'
);

select * from finish();
rollback;
