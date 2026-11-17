-- Crisis alert replies, delivery reports and the confirmed-first order (S-07, Phase 4): a TAK
-- moves a person to the top and a later NIE to the bottom (the last answer wins), auto-replies are
-- limited per number and by the daily budget, a stranger gets nothing, delivery reports are
-- idempotent and never downgrade `delivered` or an answered alert, a resident keeps one open alert
-- across crises, teams prefer confirmed people, and the recreated list functions kept their
-- privileges.
-- Run with `npm run test:db`. Everything is rolled back at the end.

begin;
create extension if not exists pgtap with schema extensions;

select plan(69);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres: bypasses RLS, triggers still apply)
-- ---------------------------------------------------------------------------

-- Isolate the fixtures from the local demo seed and from a local operator's token and usage.
delete from public.profiles;
delete from public.crisis_alert_batches;
delete from private.worker_tokens;
delete from private.sms_daily_usage;
delete from private.sms_autoreply_log;

insert into private.worker_tokens (name, token_hash)
values ('sms_worker', encode(sha256(convert_to('test-token', 'UTF8')), 'hex'));

-- K1: coordinator. R1–R5: Kraków electricians, each one cell further north of the epicentre than
-- the last, so position N in every crisis is RN. All five have a verified number +4860000000N.
insert into auth.users (id, email) values ('cccccccc-0000-0000-0000-000000000001', 'k1@test.local');

insert into auth.users (id, email)
select ('00000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, 'r' || i || '@test.local'
from generate_series(1, 5) as i;

insert into public.user_roles (user_id, role, granted_by)
values ('cccccccc-0000-0000-0000-000000000001', 'coordinator', 'test');

insert into public.consent_events (user_id, version, source)
select u.id, '2026-10-06', 'signup'
from auth.users u
where not exists (select 1 from public.consent_events c where c.user_id = u.id);

insert into public.profiles (user_id, location_source, location)
select
  ('00000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid,
  'pin',
  extensions.st_setsrid(extensions.st_makepoint(19.9366, 50.0614 + i * 0.006), 4326)::extensions.geography
from generate_series(1, 5) as i;

insert into public.profile_skills (user_id, skill_slug, level)
select user_id, 'elektryk', 2 from public.profiles;

insert into public.profile_contacts (user_id, phone)
select ('00000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, '+4860000000' || i
from generate_series(1, 5) as i;

update public.profile_contacts set phone_verified_at = now();

create temp table crisis_ids (name text primary key, id uuid);
create temp table alert_ids (name text primary key, id uuid);
create temp table stamps (name text primary key, at timestamptz);
grant select, insert on crisis_ids to authenticated;
grant select on alert_ids to anon;

create function pg_temp.crisis(p_name text) returns uuid
language sql as $$ select id from crisis_ids where name = p_name $$;
create function pg_temp.alert(p_name text) returns uuid
language sql as $$ select id from alert_ids where name = p_name $$;
create function pg_temp.resident(p_n integer) returns uuid
language sql as $$ select ('00000000-0000-0000-0000-' || lpad(p_n::text, 12, '0'))::uuid $$;

-- K1 activates crisis A and alerts R1–R4. R5 gets no alert.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-0000-0000-000000000001","role":"authenticated"}', true);
insert into crisis_ids
select 'a', public.activate_crisis('awaria-pradu', 'pin', null, 50.0614, 19.9366, 10, 'Awaria prądu w centrum miasta');
select is(
  (select queued from public.queue_crisis_alerts(pg_temp.crisis('a'), 4)), 4,
  'fixture: four alerts are queued in crisis A'
);
reset role;

insert into alert_ids
select 'r' || right(a.user_id::text, 1), a.id
from public.crisis_alerts a where a.crisis_id = pg_temp.crisis('a');

-- The consumer sent R1–R3 (provider ids p1–p3). R4's alert is still queued, with no provider id.
set local role anon;
select public.mark_crisis_alert_sent('test-token', pg_temp.alert('r1'), 'p1');
select public.mark_crisis_alert_sent('test-token', pg_temp.alert('r2'), 'p2');
select public.mark_crisis_alert_sent('test-token', pg_temp.alert('r3'), 'p3');
reset role;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

select ok(
  has_function_privilege('anon', 'public.record_sms_status(text, text, uuid, text)', 'EXECUTE')
  and has_function_privilege('anon', 'public.record_sms_reply(text, text, text, timestamptz)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.record_sms_status(text, text, uuid, text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.record_sms_reply(text, text, text, timestamptz)', 'EXECUTE')
  and has_function_privilege('anon', 'public.mark_crisis_alert_failed(text, uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.mark_crisis_alert_failed(text, uuid)', 'EXECUTE'),
  'worker_rpcs: only the Worker (anon with the token) can call the webhook RPCs and the replaced mark_crisis_alert_failed'
);
select ok(
  has_function_privilege('authenticated', 'public.get_crisis_matches(uuid, integer)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.get_team_candidates(uuid, text, integer)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.get_crisis_matches(uuid, integer)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.get_team_candidates(uuid, text, integer)', 'EXECUTE'),
  'recreated_grants: after the drop and recreate, anon still cannot execute the list functions'
);
select is(
  (select array_agg(p.proowner::regrole::text order by p.proname) from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('get_crisis_matches', 'get_team_candidates', 'record_sms_reply', 'record_sms_status')),
  array['postgres', 'postgres', 'postgres', 'postgres'],
  'owners: the new and recreated functions belong to postgres'
);
select ok(
  not has_table_privilege('anon', 'private.sms_autoreply_log', 'SELECT')
  and not has_table_privilege('authenticated', 'private.sms_autoreply_log', 'SELECT')
  and not has_function_privilege('anon', 'private.take_autoreply(text, text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'private.take_autoreply(text, text)', 'EXECUTE')
  and not has_function_privilege('anon', 'private.prune_autoreply_log()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'private.prune_autoreply_log()', 'EXECUTE'),
  'autoreply_closed: no client can read the auto-reply log or call its helpers'
);

-- ---------------------------------------------------------------------------
-- The token gate and input checks
-- ---------------------------------------------------------------------------

set local role anon;
select throws_ok(
  $$ select public.record_sms_reply('other-token', '48600000001', 'yes') $$,
  'P0001', 'worker_token_invalid',
  'reply_token: a wrong token cannot record a reply'
);
select throws_ok(
  $$ select public.record_sms_status('other-token', 'p1', null, 'delivered') $$,
  'P0001', 'worker_token_invalid',
  'status_token: a wrong token cannot record a delivery report'
);
select throws_ok(
  $$ select public.record_sms_reply('test-token', '48600000001', 'maybe') $$,
  'P0001', 'invalid_answer',
  'reply_invalid: an answer other than yes, no or unclear is refused'
);
select throws_ok(
  $$ select public.record_sms_status('test-token', 'p1', null, 'SENT') $$,
  'P0001', 'invalid_status',
  'status_invalid: a status other than delivered, undelivered or failed is refused'
);
reset role;

-- ---------------------------------------------------------------------------
-- TAK goes to the top, a later NIE to the bottom
-- ---------------------------------------------------------------------------

set local role authenticated;
select is(
  (select array_agg(m.position) from public.get_crisis_matches(pg_temp.crisis('a')) m),
  array[1, 2, 3, 4, 5],
  'order_before: with no answers the list is in snapshot order'
);
select is(
  (select array_agg(m.alert_status) from public.get_crisis_matches(pg_temp.crisis('a')) m),
  array['sent', 'sent', 'sent', 'queued', null],
  'alert_status: each row carries its alert status, null where no alert was sent'
);

set local role anon;
select is(
  public.record_sms_reply('test-token', '48600000003', 'yes'), 'recorded',
  'reply_yes: R3 answers TAK (sender as 48…)'
);
reset role;
select ok(
  (select a.answer = 'yes' and a.answered_at is not null and a.status = 'delivered'
   from public.crisis_alerts a where a.id = pg_temp.alert('r3')),
  'reply_yes_state: the answer is stored, and a sent alert counts as delivered once answered'
);

set local role authenticated;
select is(
  (select array_agg(m.position) from public.get_crisis_matches(pg_temp.crisis('a')) m),
  array[3, 1, 2, 4, 5],
  'order_yes: R3 moves to the top'
);
select is(
  (select m.answer from public.get_crisis_matches(pg_temp.crisis('a')) m where m.position = 3), 'yes',
  'answer_column: the row carries the answer'
);
select is(
  (select array_agg(m.position) from public.get_crisis_matches(pg_temp.crisis('a'), 2) m),
  array[3, 1],
  'order_limit: the limit applies after the confirmed-first order'
);

set local role anon;
select is(
  public.record_sms_reply('test-token', '+48 600 000 001', 'yes'), 'recorded',
  'reply_yes_plus: R1 answers TAK (sender as +48 with spaces)'
);
set local role authenticated;
select is(
  (select array_agg(m.position) from public.get_crisis_matches(pg_temp.crisis('a')) m),
  array[1, 3, 2, 4, 5],
  'order_two_yes: confirmed people keep the snapshot order among themselves'
);

set local role anon;
select is(
  public.record_sms_reply('test-token', '0048600000003', 'no'), 'recorded',
  'reply_last_wins: R3 changes the answer to NIE in the same active crisis: recorded, never ended'
);
set local role authenticated;
select is(
  (select array_agg(m.position) from public.get_crisis_matches(pg_temp.crisis('a')) m),
  array[1, 2, 4, 5, 3],
  'order_no: R3 moves to the bottom'
);
reset role;
select is(
  (select count(*) from private.sms_autoreply_log), 0::bigint,
  'recorded_no_autoreply: a recorded answer logs no auto-reply'
);

-- ---------------------------------------------------------------------------
-- Unclear answers and strangers
-- ---------------------------------------------------------------------------

set local role anon;
select is(
  public.record_sms_reply('test-token', '600000002', 'unclear'), 'unclear',
  'unclear: R2 has an open alert and sends something else: ask again'
);
select is(
  public.record_sms_reply('test-token', '600000002', 'unclear'), 'unclear_silent',
  'unclear_silent: a second auto-reply to the same number within an hour is not sent'
);
select is(
  public.record_sms_reply('test-token', '48699999999', 'yes'), 'unknown',
  'stranger: a number no verified profile has is unknown'
);
select is(
  public.record_sms_reply('test-token', 'SkillNet', 'yes'), 'unknown',
  'not_a_number: a sender that is not a Polish number is unknown'
);
select is(
  public.record_sms_reply('test-token', '4915112345678', 'yes'), 'unknown',
  'foreign_number: a foreign number is unknown'
);
reset role;

select is(
  (select answer from public.crisis_alerts where id = pg_temp.alert('r2')), null,
  'unclear_not_stored: an unclear reply stores no answer'
);
select ok(
  (select count(*) = 1 and bool_and(l.phone_hash ~ '^[0-9a-f]{64}$') from private.sms_autoreply_log l),
  'autoreply_log: one auto-reply is logged, by a hash; a stranger logs nothing'
);
select is(
  (select sent from private.sms_daily_usage), 5,
  'autoreply_budget: the auto-reply took one SMS from the daily budget (4 alerts + 1)'
);

-- ---------------------------------------------------------------------------
-- Delivery reports
-- ---------------------------------------------------------------------------

set local role anon;
select lives_ok(
  $$ select public.record_sms_status('test-token', 'p2', null, 'undelivered') $$,
  'status_undelivered: a report for R2 is accepted'
);
reset role;
select is(
  (select status from public.crisis_alerts where id = pg_temp.alert('r2')), 'undelivered',
  'status_undelivered_state: a sent alert becomes undelivered'
);

set local role anon;
select public.record_sms_status('test-token', 'p2', null, 'failed');
reset role;
select is(
  (select status from public.crisis_alerts where id = pg_temp.alert('r2')), 'undelivered',
  'status_final: a failed report does not move an alert that is already undelivered'
);

set local role anon;
select public.record_sms_status('test-token', 'p2', null, 'delivered');
reset role;
select is(
  (select status from public.crisis_alerts where id = pg_temp.alert('r2')), 'delivered',
  'status_late_delivered: a late delivered report wins over an earlier bad one'
);

insert into stamps select 'r2', status_at from public.crisis_alerts where id = pg_temp.alert('r2');
set local role anon;
select public.record_sms_status('test-token', 'p2', null, 'delivered');
select public.record_sms_status('test-token', 'p2', null, 'undelivered');
reset role;
select ok(
  (select a.status = 'delivered' and a.status_at = (select at from stamps where name = 'r2')
   from public.crisis_alerts a where a.id = pg_temp.alert('r2')),
  'status_idempotent: a duplicate report changes nothing, and delivered is never downgraded'
);

-- R4's alert has no provider id (the report overtook mark_crisis_alert_sent, or the provider
-- refused a retry as a duplicate): the report finds it by the alert id.
set local role anon;
select public.record_sms_status('test-token', 'p4', pg_temp.alert('r4'), 'undelivered');
reset role;
select ok(
  (select a.status = 'undelivered' and a.provider_id = 'p4' and a.sent_at is not null
   from public.crisis_alerts a where a.id = pg_temp.alert('r4')),
  'status_by_alert_id: an alert with no provider id is found by its own id, and keeps the provider id'
);

-- A provider id wins over the alert id, and an unknown report is dropped.
set local role anon;
select public.record_sms_status('test-token', 'p1', pg_temp.alert('r3'), 'delivered');
select lives_ok(
  $$ select public.record_sms_status('test-token', 'nobody', '99999999-9999-9999-9999-999999999999', 'delivered') $$,
  'status_unknown: a report for an alert that does not exist is dropped without an error'
);
reset role;
select is(
  (select status from public.crisis_alerts where id = pg_temp.alert('r1')), 'delivered',
  'status_provider_id_first: the report goes to the alert with that provider id'
);

-- An answer proves the message arrived, whatever the report said.
set local role anon;
select is(
  public.record_sms_reply('test-token', '48600000004', 'yes'), 'recorded',
  'reply_undelivered: R4 answers although the provider reported the alert undelivered'
);
reset role;
select ok(
  (select a.answer = 'yes' and a.status = 'delivered' from public.crisis_alerts a where a.id = pg_temp.alert('r4')),
  'reply_undelivered_state: the answer is stored and the alert counts as delivered'
);

-- ---------------------------------------------------------------------------
-- The summary and the teams
-- ---------------------------------------------------------------------------

set local role authenticated;
select is(
  public.get_crisis_alert_summary(pg_temp.crisis('a')) -> 'answers',
  '{"yes": 2, "no": 1}'::jsonb,
  'summary_answers: the summary counts the answers (R1 and R4 TAK, R3 NIE)'
);
select is(
  public.get_crisis_alert_summary(pg_temp.crisis('a')) -> 'statuses',
  '{"delivered": 4}'::jsonb,
  'summary_statuses: all four alerts are delivered'
);

-- One technical team keeps three people per role. In snapshot order that would be R1, R2, R3.
select is(
  (select array_agg(t.position) from public.get_team_candidates(pg_temp.crisis('a'), 'techniczny', 1) t),
  array[1, 4, 2],
  'teams_prefer_confirmed: candidates are the two who answered TAK, then the first with no answer'
);
select is(
  (select array_agg(t.answer) from public.get_team_candidates(pg_temp.crisis('a'), 'techniczny', 1) t),
  array['yes', 'yes', null],
  'teams_columns: team candidates carry the answer'
);
select is(
  (select array_agg(t.alert_status) from public.get_team_candidates(pg_temp.crisis('a'), 'techniczny', 1) t),
  array['delivered', 'delivered', 'delivered'],
  'teams_alert_status: team candidates carry the alert status'
);

-- ---------------------------------------------------------------------------
-- After the crisis ends
-- ---------------------------------------------------------------------------

select is(public.end_crisis(pg_temp.crisis('a')), true, 'end: the coordinator ends crisis A');
reset role;

-- The auto-reply to R2 earlier must not get in the way of the checks below.
delete from private.sms_autoreply_log;

set local role anon;
select is(
  public.record_sms_reply('test-token', '48600000001', 'yes'), 'ended',
  'ended: a reply after the crisis ended gets the "action is over" auto-reply'
);
select is(
  public.record_sms_reply('test-token', '48600000001', 'no'), 'ended_silent',
  'ended_silent: a second auto-reply to the same number within an hour is not sent'
);
select is(
  public.record_sms_reply('test-token', '48600000005', 'unclear'), 'ended',
  'ended_never_alerted: a verified resident with no open alert gets the same auto-reply, whatever they wrote'
);
select lives_ok(
  $$ select public.record_sms_status('test-token', 'p1', null, 'delivered') $$,
  'status_after_end: a late report for a deleted alert is dropped'
);
reset role;

select is(
  (select count(*) from public.crisis_alerts), 0::bigint,
  'ended_nothing_stored: a reply after the end stores nothing'
);
select is(
  (select count(*) from private.sms_autoreply_log), 2::bigint,
  'ended_logged: both auto-replies are logged'
);

-- The daily budget refuses: no auto-reply, and no log row is left behind.
update private.sms_daily_usage set sent = private.sms_daily_budget();
set local role anon;
select is(
  public.record_sms_reply('test-token', '48600000002', 'yes'), 'ended_silent',
  'budget_silent: with the daily budget used up no auto-reply is sent'
);
reset role;
select ok(
  (select count(*) from private.sms_autoreply_log) = 2
  and (select sent from private.sms_daily_usage) = private.sms_daily_budget(),
  'budget_rollback: a refused auto-reply leaves no log row and takes nothing'
);
update private.sms_daily_usage set sent = 0;

-- An hour later the same number may get an auto-reply again, and old rows are cleared.
update private.sms_autoreply_log set sent_at = now() - interval '61 minutes';
set local role anon;
select is(
  public.record_sms_reply('test-token', '48600000001', 'yes'), 'ended',
  'autoreply_hour: after an hour the number gets an auto-reply again'
);
reset role;
select is(
  (select count(*) from private.sms_autoreply_log), 1::bigint,
  'autoreply_cleanup: log rows older than an hour are deleted'
);

-- Any callback clears old rows, also one that sends no auto-reply.
update private.sms_autoreply_log set sent_at = now() - interval '61 minutes';
set local role anon;
select public.record_sms_status('test-token', 'nobody', null, 'delivered');
reset role;
select is(
  (select count(*) from private.sms_autoreply_log), 0::bigint,
  'autoreply_prune_on_report: a delivery report also deletes log rows older than an hour'
);

-- ---------------------------------------------------------------------------
-- A new crisis: the reply goes to the open alert
-- ---------------------------------------------------------------------------

set local role authenticated;
insert into crisis_ids
select 'b', public.activate_crisis('awaria-pradu', 'pin', null, 50.0614, 19.9366, 10, 'Druga awaria prądu w centrum');
select is(
  (select queued from public.queue_crisis_alerts(pg_temp.crisis('b'), 3)), 3,
  'new_crisis: R1, R2 and R3 are alerted in crisis B'
);
reset role;

insert into alert_ids
select 'b_r' || right(a.user_id::text, 1), a.id
from public.crisis_alerts a where a.crisis_id = pg_temp.crisis('b');

set local role anon;
select is(
  public.record_sms_reply('test-token', '48600000001', 'no'), 'recorded',
  'new_crisis_reply: R1''s reply is recorded, although the alert is still queued'
);
reset role;
select ok(
  (select a.answer = 'no' and a.status = 'queued' and a.crisis_id = pg_temp.crisis('b')
   from public.crisis_alerts a where a.user_id = pg_temp.resident(1)),
  'new_crisis_state: the answer is on the alert of crisis B, which stays queued for the consumer'
);

-- The provider repeats an older callback after a newer answer was stored.
set local role anon;
select is(
  public.record_sms_reply('test-token', '48600000001', 'yes', now() - interval '1 hour'), 'stale',
  'reply_stale: a reply sent before the stored answer is ignored'
);
select is(
  public.record_sms_reply('test-token', '48600000001', 'no', now() + interval '1 day'), 'recorded',
  'reply_future: a send time in the future is read as now, so it cannot lock later answers out'
);
select is(
  public.record_sms_reply('test-token', '48600000001', 'no'), 'recorded',
  'reply_after_future: the next answer is still accepted'
);

-- An answered alert is never called undelivered or failed.
select public.record_sms_status('test-token', null, pg_temp.alert('b_r1'), 'failed');
select public.record_sms_status('test-token', null, pg_temp.alert('b_r1'), 'undelivered');
select public.mark_crisis_alert_failed('test-token', pg_temp.alert('b_r1'));
reset role;
select ok(
  (select a.status = 'queued' and a.answer = 'no' from public.crisis_alerts a where a.id = pg_temp.alert('b_r1')),
  'answered_kept: a bad report or the dead-letter queue does not move an alert that has an answer'
);

-- R2's alert was sent as pb2. A report naming pb2 and R3's alert id goes to R2 only.
set local role anon;
select public.mark_crisis_alert_sent('test-token', pg_temp.alert('b_r2'), 'pb2');
select public.record_sms_status('test-token', 'pb2', pg_temp.alert('b_r3'), 'undelivered');
reset role;
select ok(
  (select a.status = 'undelivered' from public.crisis_alerts a where a.id = pg_temp.alert('b_r2'))
  and (select a.status = 'queued' and a.provider_id is null from public.crisis_alerts a where a.id = pg_temp.alert('b_r3')),
  'status_guard: an alert id is not used when another alert already has that provider id'
);

-- A failed report with no provider id at all.
set local role anon;
select public.record_sms_status('test-token', null, pg_temp.alert('b_r3'), 'failed');
reset role;
select ok(
  (select a.status = 'failed' and a.provider_id is null and a.sent_at is null
   from public.crisis_alerts a where a.id = pg_temp.alert('b_r3')),
  'status_failed: a failed report found by alert id alone marks the alert as not sent'
);

-- ---------------------------------------------------------------------------
-- Two active crises: one open alert per resident
-- ---------------------------------------------------------------------------

-- R2 (undelivered in B) and R3 (failed in B) have no open alert, so crisis C may alert them.
set local role authenticated;
insert into crisis_ids
select 'c', public.activate_crisis('awaria-pradu', 'pin', null, 50.0614, 19.9366, 10, 'Trzecia awaria prądu w centrum');
select is(
  (select queued from public.queue_crisis_alerts(pg_temp.crisis('c'), 2)), 2,
  'two_crises: R2 and R3 are alerted in crisis C; R1 has an open alert in B'
);

-- A late delivered report for B must not give R2 a second open alert.
set local role anon;
select public.record_sms_status('test-token', 'pb2', null, 'delivered');
reset role;
select is(
  (select status from public.crisis_alerts where id = pg_temp.alert('b_r2')), 'undelivered',
  'late_delivered_guard: a late delivered report does not reopen an alert while the resident has an open one elsewhere'
);

-- R2's reply goes to the open alert in C, not to the undelivered one in B.
set local role anon;
select is(
  public.record_sms_reply('test-token', '48600000002', 'yes'), 'recorded',
  'two_crises_reply: R2 answers TAK'
);
reset role;
select ok(
  (select a.answer = 'yes' from public.crisis_alerts a
   where a.user_id = pg_temp.resident(2) and a.crisis_id = pg_temp.crisis('c'))
  and (select a.answer is null and a.status = 'undelivered' from public.crisis_alerts a where a.id = pg_temp.alert('b_r2')),
  'two_crises_routing: the answer is on the open alert of crisis C; the undelivered alert of B is untouched'
);

select * from finish();
rollback;
