-- Crisis alert guarantees (S-07, Phase 3): who is queued and who is skipped and why, an exercise
-- that only simulates, one open alert per resident across crises, the per-call and per-crisis caps,
-- the shared daily SMS budget, the consumer's token-gated claim that checks eligibility again,
-- and the cascade when a crisis ends (alerts go, the batch audit stays).
-- Run with `npm run test:db`. Everything is rolled back at the end.

begin;
create extension if not exists pgtap with schema extensions;

select plan(52);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres: bypasses RLS, triggers still apply)
-- ---------------------------------------------------------------------------

-- Isolate the fixtures from the local demo seed and from a local operator's token and usage.
delete from public.profiles;
delete from public.crisis_alert_batches;
delete from private.worker_tokens;
delete from private.sms_daily_usage;

insert into private.worker_tokens (name, token_hash)
values ('sms_worker', encode(sha256(convert_to('test-token', 'UTF8')), 'hex'));

-- K1 and K2: coordinators. R1–R8: Kraków electricians, each one cell further north of the
-- epicentre than the last, so position N in every Kraków crisis is RN. F1–F505: Warsaw fillers
-- for the caps.
insert into auth.users (id, email) values
  ('cccccccc-0000-0000-0000-000000000001', 'k1@test.local'),
  ('cccccccc-0000-0000-0000-000000000002', 'k2@test.local');

insert into auth.users (id, email)
select ('00000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, 'r' || i || '@test.local'
from generate_series(1, 8) as i;

insert into auth.users (id, email)
select ('ffffffff-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, 'f' || i || '@test.local'
from generate_series(1, 505) as i;

insert into public.user_roles (user_id, role, granted_by) values
  ('cccccccc-0000-0000-0000-000000000001', 'coordinator', 'test'),
  ('cccccccc-0000-0000-0000-000000000002', 'coordinator', 'test');

insert into public.consent_events (user_id, version, source)
select u.id, '2026-10-06', 'signup'
from auth.users u
where not exists (select 1 from public.consent_events c where c.user_id = u.id);

insert into public.profiles (user_id, location_source, location)
select
  ('00000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid,
  'pin',
  extensions.st_setsrid(extensions.st_makepoint(19.9366, 50.0614 + i * 0.006), 4326)::extensions.geography
from generate_series(1, 8) as i;

insert into public.profiles (user_id, location_source, location)
select
  ('ffffffff-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid,
  'pin',
  extensions.st_setsrid(extensions.st_makepoint(21.0122, 52.2297), 4326)::extensions.geography
from generate_series(1, 505) as i;

insert into public.profile_skills (user_id, skill_slug, level)
select user_id, 'elektryk', 2 from public.profiles;

-- R2 has no phone. R3's number is unverified. Everyone else's is verified.
insert into public.profile_contacts (user_id, phone)
select ('00000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, '+4860000000' || i
from generate_series(1, 8) as i
where i <> 2;

insert into public.profile_contacts (user_id, phone)
select ('ffffffff-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, '+48' || (700000000 + i)
from generate_series(1, 505) as i;

update public.profile_contacts set phone_verified_at = now()
where user_id <> '00000000-0000-0000-0000-000000000003';

create temp table crisis_ids (name text primary key, id uuid);
create temp table batches (
  name text primary key, alert_ids uuid[], queued integer, skipped jsonb, simulated boolean, cost numeric
);
create temp table alert_ids (name text primary key, id uuid);
create temp table claims (name text, phone text, crisis_type text, epicentre_postcode text);
grant select, insert on crisis_ids, batches, claims to authenticated, anon;
grant select on alert_ids to anon;

-- K1 activates two real Kraków crises and an exercise; K2 activates a real one in Warsaw.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-0000-0000-000000000001","role":"authenticated"}', true);
insert into crisis_ids
select 'a', public.activate_crisis('awaria-pradu', 'pin', null, 50.0614, 19.9366, 10, 'Awaria prądu w centrum miasta');
insert into crisis_ids
select 'b', public.activate_crisis('awaria-pradu', 'pin', null, 50.0614, 19.9366, 10, 'Druga awaria prądu w centrum');
insert into crisis_ids
select 'x', public.activate_crisis('awaria-pradu', 'pin', null, 50.0614, 19.9366, 10, 'Ćwiczenie awarii prądu w centrum', true);
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-0000-0000-000000000002","role":"authenticated"}', true);
insert into crisis_ids
select 'c', public.activate_crisis('awaria-pradu', 'pin', null, 52.2297, 21.0122, 1, 'Awaria prądu w Warszawie');
reset role;

select is(
  (select array_agg(right(m.user_id::text, 1) order by m.position)
   from public.crisis_matches m where m.crisis_id = (select id from crisis_ids where name = 'a')),
  array['1', '2', '3', '4', '5', '6', '7', '8'],
  'fixture: position N is resident RN'
);

-- After activation: R4 pauses, and R6 takes their only skill out of crises.
update public.profiles set paused_at = now() where user_id = '00000000-0000-0000-0000-000000000004';
update public.profile_skills set use_in_crisis = false where user_id = '00000000-0000-0000-0000-000000000006';

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

select ok(
  not has_table_privilege('anon', 'public.crisis_alerts', 'SELECT')
  and not has_table_privilege('authenticated', 'public.crisis_alerts', 'SELECT')
  and not has_table_privilege('authenticated', 'public.crisis_alerts', 'UPDATE')
  and not has_table_privilege('anon', 'public.crisis_alert_batches', 'SELECT')
  and not has_table_privilege('authenticated', 'public.crisis_alert_batches', 'SELECT')
  and not has_table_privilege('authenticated', 'public.crisis_alert_batches', 'INSERT'),
  'tables_closed: no client can read or write alerts or the batch audit'
);
select ok(
  has_function_privilege('authenticated', 'public.queue_crisis_alerts(uuid, integer)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.get_crisis_alert_summary(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.queue_crisis_alerts(uuid, integer)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.get_crisis_alert_summary(uuid)', 'EXECUTE'),
  'coordinator_rpcs: signed-in users can call them, anon cannot'
);
select ok(
  has_function_privilege('anon', 'public.claim_crisis_alert(text, uuid)', 'EXECUTE')
  and has_function_privilege('anon', 'public.mark_crisis_alert_sent(text, uuid, text)', 'EXECUTE')
  and has_function_privilege('anon', 'public.mark_crisis_alert_failed(text, uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.claim_crisis_alert(text, uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.mark_crisis_alert_sent(text, uuid, text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.mark_crisis_alert_failed(text, uuid)', 'EXECUTE'),
  'worker_rpcs: only the Worker (anon with the token) can call them'
);

-- ---------------------------------------------------------------------------
-- Who may queue
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$ select * from public.queue_crisis_alerts((select id from crisis_ids where name = 'a'), 5) $$,
  'P0001', 'not_coordinator',
  'queue_resident: a resident cannot send alerts'
);
select throws_ok(
  $$ select public.get_crisis_alert_summary((select id from crisis_ids where name = 'a')) $$,
  'P0001', 'not_coordinator',
  'summary_resident: a resident cannot read the alert summary'
);

select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$ select * from public.queue_crisis_alerts('99999999-9999-9999-9999-999999999999', 5) $$,
  'P0001', 'unknown_crisis',
  'queue_unknown: an unknown crisis is refused'
);

-- ---------------------------------------------------------------------------
-- An exercise only simulates
-- ---------------------------------------------------------------------------

insert into batches
select 'x1', q.* from public.queue_crisis_alerts((select id from crisis_ids where name = 'x'), 3) as q;
reset role;

select ok(
  (select b.simulated and b.queued = 3 and b.alert_ids = '{}' and b.cost = 0.51 from batches b where b.name = 'x1'),
  'exercise_simulated: an exercise reports who would be alerted and the cost, and returns no alert ids'
);
select is(
  (select skipped from batches where name = 'x1'),
  '{"no_phone": 1, "unverified": 1, "paused": 1, "hidden": 1}'::jsonb,
  'exercise_skips: the exercise counts the same skips a real send would'
);
select is(
  (select count(*) from public.crisis_alerts), 0::bigint,
  'exercise_no_alerts: an exercise stores no alert'
);
select is(
  (select count(*) from private.sms_daily_usage), 0::bigint,
  'exercise_no_budget: an exercise takes nothing from the SMS budget'
);
select ok(
  (select b.simulated and b.queued = 3 and b.requested = 3 and b.sent_by = 'cccccccc-0000-0000-0000-000000000001'
   from public.crisis_alert_batches b where b.crisis_id = (select id from crisis_ids where name = 'x')),
  'exercise_audit: the simulated batch is recorded'
);

-- ---------------------------------------------------------------------------
-- A real crisis: eligibility, order and skip reasons
-- ---------------------------------------------------------------------------

set local role authenticated;
insert into batches
select 'a1', q.* from public.queue_crisis_alerts((select id from crisis_ids where name = 'a'), 2) as q;
reset role;

select ok(
  (select not b.simulated and b.queued = 2 and cardinality(b.alert_ids) = 2 and b.cost = 0.34
   from batches b where b.name = 'a1'),
  'queue_real: a real crisis queues alerts and returns their ids'
);
select is(
  (select array_agg(right(a.user_id::text, 1) order by a.user_id)
   from public.crisis_alerts a where a.crisis_id = (select id from crisis_ids where name = 'a')),
  array['1', '5'],
  'queue_order: the first two eligible people by position are R1 and R5'
);
select is(
  (select skipped from batches where name = 'a1'),
  '{"no_phone": 1, "unverified": 1, "paused": 1}'::jsonb,
  'queue_skips: only the people passed over on the way to R5 are counted'
);
select is(
  (select count(*) from public.crisis_alerts where status = 'queued' and answer is null and provider_id is null),
  2::bigint,
  'queue_state: new alerts are queued, unanswered and unsent'
);
select is(
  (select sent from private.sms_daily_usage), 2,
  'queue_budget: the batch takes its size from the daily SMS budget'
);

set local role authenticated;
insert into batches
select 'a2', q.* from public.queue_crisis_alerts((select id from crisis_ids where name = 'a'), 1) as q;
reset role;

select is(
  (select right(a.user_id::text, 1) from public.crisis_alerts a where a.id = (select alert_ids[1] from batches where name = 'a2')),
  '7',
  'queue_next: a second batch goes on to the next eligible person, R7, never to someone already alerted'
);
select is(
  (select skipped from batches where name = 'a2'),
  '{"no_phone": 1, "unverified": 1, "paused": 1, "hidden": 1}'::jsonb,
  'queue_skips_hidden: R6, who took their skills out of crises, is skipped'
);

-- ---------------------------------------------------------------------------
-- One open alert per resident
-- ---------------------------------------------------------------------------

set local role authenticated;
insert into batches
select 'b1', q.* from public.queue_crisis_alerts((select id from crisis_ids where name = 'b'), 10) as q;
reset role;

select is(
  (select array_agg(right(a.user_id::text, 1))
   from public.crisis_alerts a where a.crisis_id = (select id from crisis_ids where name = 'b')),
  array['8'],
  'one_open: only R8 is free; R1, R5 and R7 have an open alert in crisis A'
);
select is(
  (select skipped from batches where name = 'b1'),
  '{"no_phone": 1, "unverified": 1, "paused": 1, "hidden": 1, "other_crisis": 3}'::jsonb,
  'one_open_skips: fewer eligible than asked, so everyone left is counted, three as other_crisis'
);

-- R1 answers TAK in crisis A: the alert stays open. R5's alert in A failed: it is not open.
update public.crisis_alerts set answer = 'yes', answered_at = now()
where crisis_id = (select id from crisis_ids where name = 'a') and user_id = '00000000-0000-0000-0000-000000000001';
update public.crisis_alerts set status = 'failed'
where crisis_id = (select id from crisis_ids where name = 'a') and user_id = '00000000-0000-0000-0000-000000000005';

set local role authenticated;
insert into batches
select 'b2', q.* from public.queue_crisis_alerts((select id from crisis_ids where name = 'b'), 10) as q;
reset role;

select is(
  (select array_agg(right(a.user_id::text, 1) order by a.user_id)
   from public.crisis_alerts a where a.crisis_id = (select id from crisis_ids where name = 'b')),
  array['5', '8'],
  'one_open_answered: R1, who answered TAK in A, is still not alerted for B; R5, whose alert failed, is'
);
select is(
  (select skipped -> 'other_crisis' from batches where name = 'b2'), '2'::jsonb,
  'one_open_answered_skips: R1 and R7 are counted as other_crisis'
);

-- ---------------------------------------------------------------------------
-- The consumer: claim, mark sent, mark failed
-- ---------------------------------------------------------------------------

insert into alert_ids
select 'a_r' || right(a.user_id::text, 1), a.id
from public.crisis_alerts a where a.crisis_id = (select id from crisis_ids where name = 'a');
insert into alert_ids
select 'b_r' || right(a.user_id::text, 1), a.id
from public.crisis_alerts a where a.crisis_id = (select id from crisis_ids where name = 'b');

set local role anon;

select throws_ok(
  $$ select * from public.claim_crisis_alert('other-token', (select id from alert_ids where name = 'a_r1')) $$,
  'P0001', 'worker_token_invalid',
  'claim_token: a wrong token cannot claim an alert'
);
select throws_ok(
  $$ select public.mark_crisis_alert_sent('other-token', (select id from alert_ids where name = 'a_r1'), 'p1') $$,
  'P0001', 'worker_token_invalid',
  'mark_sent_token: a wrong token cannot mark an alert sent'
);
select throws_ok(
  $$ select public.mark_crisis_alert_failed('other-token', (select id from alert_ids where name = 'a_r1')) $$,
  'P0001', 'worker_token_invalid',
  'mark_failed_token: a wrong token cannot mark an alert failed'
);

insert into claims
select 'a_r1', c.* from public.claim_crisis_alert('test-token', (select id from alert_ids where name = 'a_r1')) as c;
select is(
  (select phone from claims where name = 'a_r1'), '+48600000001',
  'claim_phone: the claim returns the resident''s number'
);
select ok(
  (select c.crisis_type = (select name_pl from public.crisis_types where slug = 'awaria-pradu')
          and c.epicentre_postcode is not null
   from claims c where c.name = 'a_r1'),
  'claim_facts: the claim returns the crisis type''s name and the epicentre''s postcode for the text'
);

select lives_ok(
  $$ select public.mark_crisis_alert_sent('test-token', (select id from alert_ids where name = 'a_r1'), 'provider-1') $$,
  'mark_sent: the consumer records the provider''s id'
);
reset role;
select ok(
  (select a.status = 'sent' and a.provider_id = 'provider-1' and a.sent_at is not null and a.answer = 'yes'
   from public.crisis_alerts a where a.id = (select id from alert_ids where name = 'a_r1')),
  'mark_sent_state: the alert is sent and keeps its answer'
);

set local role anon;
insert into claims
select 'a_r1_again', c.* from public.claim_crisis_alert('test-token', (select id from alert_ids where name = 'a_r1')) as c;
select is(
  (select count(*) from claims where name = 'a_r1_again'), 0::bigint,
  'claim_once: a sent alert cannot be claimed again'
);
select lives_ok(
  $$ select public.mark_crisis_alert_failed('test-token', (select id from alert_ids where name = 'a_r1')) $$,
  'mark_failed_late: a late dead-letter message is accepted'
);
reset role;
select is(
  (select status from public.crisis_alerts where id = (select id from alert_ids where name = 'a_r1')), 'sent',
  'mark_failed_no_downgrade: it never downgrades an alert that was sent'
);

-- R7 pauses after queueing: the claim returns nothing and marks the alert failed.
update public.profiles set paused_at = now() where user_id = '00000000-0000-0000-0000-000000000007';
set local role anon;
insert into claims
select 'a_r7', c.* from public.claim_crisis_alert('test-token', (select id from alert_ids where name = 'a_r7')) as c;
reset role;
select is(
  (select count(*) from claims where name = 'a_r7'), 0::bigint,
  'claim_paused: a resident who paused since queueing gets no SMS'
);
select is(
  (select status from public.crisis_alerts where id = (select id from alert_ids where name = 'a_r7')), 'failed',
  'claim_paused_failed: their alert shows as not sent'
);

-- R8 changes their number after queueing: the new number is unverified.
update public.profile_contacts set phone = '+48600000088' where user_id = '00000000-0000-0000-0000-000000000008';
set local role anon;
insert into claims
select 'b_r8', c.* from public.claim_crisis_alert('test-token', (select id from alert_ids where name = 'b_r8')) as c;
reset role;
select is(
  (select count(*) from claims where name = 'b_r8'), 0::bigint,
  'claim_changed_number: a number changed since queueing gets no SMS'
);
select is(
  (select status from public.crisis_alerts where id = (select id from alert_ids where name = 'b_r8')), 'failed',
  'claim_changed_number_failed: that alert shows as not sent'
);

-- R5 has a queued alert in B. A fatal send marks it failed; then R5 erases their account.
set local role anon;
select lives_ok(
  $$ select public.mark_crisis_alert_failed('test-token', (select id from alert_ids where name = 'b_r5')) $$,
  'mark_failed: the consumer records a fatal send'
);
reset role;
select is(
  (select status from public.crisis_alerts where id = (select id from alert_ids where name = 'b_r5')), 'failed',
  'mark_failed_state: a queued alert becomes failed'
);
delete from auth.users where id = '00000000-0000-0000-0000-000000000005';
select is(
  (select count(*) from public.crisis_alerts where user_id = '00000000-0000-0000-0000-000000000005'), 0::bigint,
  'erase_cascade: erasing the account deletes the resident''s alerts'
);
set local role anon;
insert into claims
select 'b_r5', c.* from public.claim_crisis_alert('test-token', (select id from alert_ids where name = 'b_r5')) as c;
reset role;
select is(
  (select count(*) from claims where name = 'b_r5'), 0::bigint,
  'claim_gone: an alert that no longer exists is claimed as nothing, without an error'
);

-- ---------------------------------------------------------------------------
-- The summary, and ending a crisis
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-0000-0000-000000000001","role":"authenticated"}', true);

select is(
  public.get_crisis_alert_summary((select id from crisis_ids where name = 'a')) -> 'statuses',
  '{"sent": 1, "failed": 1}'::jsonb,
  'summary_statuses: the summary counts alerts by status (R1 sent, R7 failed; R5 is erased)'
);
select is(
  jsonb_array_length(public.get_crisis_alert_summary((select id from crisis_ids where name = 'a')) -> 'batches'), 2,
  'summary_batches: both batches of crisis A are listed'
);

select is(
  public.end_crisis((select id from crisis_ids where name = 'a')), true,
  'end: the coordinator ends crisis A'
);
select throws_ok(
  $$ select * from public.queue_crisis_alerts((select id from crisis_ids where name = 'a'), 5) $$,
  'P0001', 'crisis_not_active',
  'end_no_queue: an ended crisis takes no more alerts'
);
reset role;

select is(
  (select count(*) from public.crisis_alerts where crisis_id = (select id from crisis_ids where name = 'a')), 0::bigint,
  'end_cascade: ending the crisis deletes its alerts'
);
select is(
  (select count(*) from public.crisis_alert_batches where crisis_id = (select id from crisis_ids where name = 'a')),
  2::bigint,
  'end_audit: the batch audit of an ended crisis remains'
);

-- ---------------------------------------------------------------------------
-- The daily budget and the caps (crisis C, coordinator K2, 505 eligible residents)
-- ---------------------------------------------------------------------------

update private.sms_daily_usage set sent = private.sms_daily_budget() - 4;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok(
  $$ select * from public.queue_crisis_alerts((select id from crisis_ids where name = 'c'), 5) $$,
  'P0001', 'sms_budget_exhausted',
  'budget: a batch larger than what is left of the day''s budget is refused whole'
);
reset role;
select is(
  (select count(*) from public.crisis_alerts where crisis_id = (select id from crisis_ids where name = 'c'))
  + (select count(*) from public.crisis_alert_batches where crisis_id = (select id from crisis_ids where name = 'c')),
  0::bigint,
  'budget_nothing_queued: a refused batch leaves no alert and no audit row'
);

update private.sms_daily_usage set sent = 0;

set local role authenticated;
insert into batches
select 'c1', q.* from public.queue_crisis_alerts((select id from crisis_ids where name = 'c'), 1000) as q;
reset role;
select is(
  (select queued from batches where name = 'c1'), 200,
  'cap_call: one call queues at most 200 alerts, whatever it asks for'
);

-- Bring crisis C to 499 alerts, one short of its cap.
insert into public.crisis_alerts (crisis_id, user_id)
select m.crisis_id, m.user_id
from public.crisis_matches m
where m.crisis_id = (select id from crisis_ids where name = 'c')
  and not exists (select 1 from public.crisis_alerts a where a.crisis_id = m.crisis_id and a.user_id = m.user_id)
order by m.position
limit 299;

set local role authenticated;
insert into batches
select 'c2', q.* from public.queue_crisis_alerts((select id from crisis_ids where name = 'c'), 5) as q;
select is(
  (select queued from batches where name = 'c2'), 1,
  'cap_crisis_clamp: a batch is cut to what is left under the 500-per-crisis cap'
);
select throws_ok(
  $$ select * from public.queue_crisis_alerts((select id from crisis_ids where name = 'c'), 5) $$,
  'P0001', 'alert_cap_reached',
  'cap_crisis: a crisis at its cap takes no more alerts'
);
reset role;

select * from finish();
rollback;
