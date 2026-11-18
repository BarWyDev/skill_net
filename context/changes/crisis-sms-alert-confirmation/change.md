---
change_id: crisis-sms-alert-confirmation
title: Crisis SMS alert with YES/NO confirmation
status: impl_reviewed
created: 2026-10-29
updated: 2026-11-17
---

## Notes

Roadmap S-07, issue #8 (FR-011, US-01). Plan: `plan.md`, brief: `plan-brief.md`.

Decisions taken with the owner on 2026-10-29: SMSAPI.pl as the provider, residents answer by replying TAK or NIE to the SMS (two-way, no link), SMS only in v1 (no push), the coordinator sends alerts to the top N themselves, phone numbers are verified by an SMS code first, confirmed people go to the top of the ranking, the last answer wins, exercises only simulate the send, one open alert per resident at a time, S-07 shows each person's alert status while S-08 adds confirmed contacts and live refresh, and retries plus delivery reports.

Blocked for production on two owner steps: the Workers Paid plan (Queues need it) and an SMSAPI account with a reply-capable sender. Code can be built and tested locally before both.

## Phase 1 adaptations (2026-11-17)

The plan predates the staging environment (2026-11-16) and assumed the site-wide config banner was safe to extend. Three things differ from the plan text:

- **Staging queues.** A merge to `master` now deploys `skillnet-staging`, and production deploys on promotion. `env.staging` inherits no bindings, so it has its own pair: `skillnet-sms-alerts-staging` and `skillnet-sms-alerts-staging-dlq`. The pre-merge gate (1.6) therefore means: Workers Paid on and the two **staging** queues created before the Phase 1 PR merges; the two production queues created before the promotion PR that carries Phase 1.
- **Banner audience.** `Layout.astro` shows every missing-config banner to every visitor. The SMS entry is shown to coordinators only (`missingConfigsFor`), as a warning, so residents on production never see "SMS nie jest skonfigurowany" between Phase 1 and Phase 5.
- **Queue handler.** Phase 1 ships the batch loop (`src/lib/sms/queue.ts`) with handlers that only ack. The claim, send and mark handlers arrive in Phase 3 with the `crisis_alerts` RPCs.

SMSAPI's API was checked against https://www.smsapi.pl/docs/ on 2026-11-17: delivery reports arrive as GET with `MsgId`, `status`, `status_name`; replies arrive as POST with `sms_from`, `sms_to`, `sms_text`, `sms_date`, `MsgId`; both callbacks must answer the string `OK`. Errors 200, 202 and 203 are the retryable ones. Phase 4 can rely on these names.

## Phase 2 adaptations (2026-11-17)

- **The code row is kept, not deleted.** `phone_verification_codes` references `profiles` (not `auth.users`) and keeps `window_started_at` and `window_sends`. A successful confirm clears the code fields instead of deleting the row. Otherwise confirming, or removing and re-adding the number, would reset the 3-per-hour send limit.
- **The code hash is peppered.** The Worker hashes `token:user_id:code`, not `user_id:code`: six digits are trivial to brute-force from a bare hash.
- **A wrong code returns `false`** instead of raising, because a raise would roll back the attempt count.
- **The fake provider shows the code only on a local dev server** (`import.meta.env.DEV`), as a one-shot notice on `/profil`. A deployed build on the fake provider says that no SMS was sent and shows nothing: showing the code there would let anyone verify a number they do not hold. So staging needs a real `SMSAPI_TOKEN` to complete a verification.
- **No migration or seed creates a worker token.** `db:seed:staging` runs `supabase/seed.sql` on staging, so a seeded token would be a known token there. Local setup is one command in the README.
- **Both routes are in the visitor throttle** (`THROTTLED_AUTH_PATHS`), as the plan's `AUTH_IP_LIMITER` asks.
- **`src/db/database.types.ts` was edited by hand.** `npm run db:types` with the installed CLI rewrites the whole file in another format (2000 changed lines), so only the new table and the two functions were added.
- `get_my_profile` already returned `phone_verified`, so the read model needed no change.

## Phase 3 adaptations (2026-11-17)

- **A fifth skip reason, `hidden`.** A resident who took their skills out of crises (or lost matchability) after activation is not on the coordinator's list, so they are not alerted either. The plan listed four reasons and had nowhere to count them.
- **`skipped` counts only the people passed over on the way to the last one queued.** When fewer than N were eligible, the whole remaining list was walked and everyone left is counted.
- **Retries cannot double-send.** The alert id goes to SMSAPI as `idx` with `check_idx=1`; a second send answers error 53, which the consumer records as sent (with no provider id). So a retry after a lost answer, or after `mark_crisis_alert_sent` failed, never texts a resident twice. Phase 4's delivery report must therefore match by `idx` as well as by `MsgId`.
- **`claim_crisis_alert` marks an alert failed** when the resident stopped being eligible since queueing. Otherwise the alert would stay "queued" for the rest of the crisis and block that resident in other crises.
- **A global advisory lock in `queue_crisis_alerts`** keeps two coordinators in two crises from alerting the same resident at once.
- **`get_crisis_alert_summary`** (coordinator RPC, counts only) feeds the crisis page: status counts and the batch list. The plan's "flash summary" is read from the batch audit instead, because the flash cookie is an error notice and success text never travels in the URL (F-06).
- **Without the queue binding the route sends in the request** (previews, `astro preview`). Local `npm run dev` has the binding, so it runs the real consumer through the local queue.
- **The cost estimate uses 0.17 zł per SMS**, the upper end of the range in the plan.
- `database.types.ts` was again edited by hand (see Phase 2).

## Phase 4 adaptations (2026-11-17)

- **The Worker reads SMSAPI's statuses, not the database.** `record_sms_status` takes `delivered`, `undelivered` or `failed`; the mapping from SMSAPI's codes lives next to the client (`src/lib/sms/webhook.ts`) with unit tests. SMSAPI's status table was read from the docs on 2026-11-17: 404 DELIVERED; 402 EXPIRED, 405 UNDELIVERED and 407 REJECTED count as undelivered; 406 FAILED as failed. 403 SENT, 408 UNKNOWN, 409 QUEUE, 410 ACCEPTED and the rest change nothing. One callback can carry up to 5 comma-separated reports, and the route reads them all.
- **`record_sms_status` takes the alert id too** (`p_alert_id`, SMSAPI's `idx`), as Phase 3 required: an alert with no provider id is found by its own id and then keeps the provider id.
- **A late `delivered` wins** over an earlier `undelivered` or `failed`. Nothing downgrades `delivered`.
- **An answer proves delivery.** A reply moves a `sent` or `undelivered` alert to `delivered`. A reply also reaches an `undelivered` alert when the sender has no open alert, so a willing resident is not told "akcja zakończona" during an active crisis because of a wrong report. A `queued` alert stays queued, so the consumer still sends it.
- **The auto-reply hash is peppered** with the worker token (`sha256(token:number)`), like the code hash in Phase 2. Rows older than an hour are deleted on the next reply.
- **Three older pgTAP suites changed.** The plan expected them to keep working, but `crisis_ranking_test` pins the RPC's column list, and `resident_contact_availability_test` and `crisis_team_templates_test` insert `select *` into fixed-shape temp tables. Each gained the two new columns; no assertion was weakened.
- **Teams.** `get_team_candidates` keeps the top people per role in the confirmed-first order, and `assembleCrisisTeams` hands the solver each row's place in that order instead of the snapshot position. `team-assembly.ts` itself is unchanged.
- **`get_crisis_alert_summary` also counts answers** (`answers: {yes, no}`), shown as "Odpowiedzi: TAK: 2, NIE: 1" under the alert form. The list shows at most 200 people, so the page had no other total.
- **Break-glass hint.** It appears when a quarter or more of the crisis's alerts are "nie doręczono" or "nie wysłano".
- **No middleware change.** The webhook paths need no exclusion: a callback carries no cookie, and Astro's origin check lets a POST without `Origin` through (confirmed with curl).
- **The app code tolerates a database without the new columns** (`alert_status`, `answer`, `answers` parse as null or empty), so the deploy and the migration push can happen in either order.
- **Privacy notice.** It names SMSAPI.pl as a processor and says what is stored and when it is deleted. It does not describe how long SMSAPI itself keeps messages: that needs the DPO and SMSAPI's terms (Phase 5, owner question 9).
- `database.types.ts` was again edited by hand (see Phase 2).

## Phase 4 review fixes (2026-11-17)

From `reviews/impl-review-phase-4.md`; all ten findings were fixed. The Phase 4 migration was edited in place, because it had not left the local database.

- **Replies are POST-only** (F2). SMSAPI's docs say replies arrive as POST, and a GET would put the sender's number and the text in the request URL, which Workers Logs record. Reports still accept GET, so the recipient's number (`to`) and the path secret are in that URL: the owner decides about invocation logs in Phase 5 (`follow-ups/review-fixes.md`). Manual row 4.4 was walked with a GET for the second reply; that request now gets a 404.
- **An answered alert is never downgraded** (F3): not by an `undelivered` or `failed` report, and not by `mark_crisis_alert_failed`, which the Phase 4 migration replaces. Such an alert can stay "queued" with an answer for the rest of the crisis; the page shows the answer.
- **A late `delivered` does not reopen an alert** while the resident has an open alert in another active crisis (F4). One narrow race remains: `record_sms_reply` does not take the advisory lock of `queue_crisis_alerts`, so a reply that reopens an undelivered alert can interleave with a batch in another crisis. Replies then go to the newest alert.
- **The last answer wins by send time** (F8). `record_sms_reply` takes `p_sent_at` (SMSAPI's `sms_date`) and answers `stale` for a reply older than the stored one. A time in the future is read as now.
- **The auto-reply log is pruned by every webhook call** (F1), and the privacy notice says "około godziny" and "skrót". With no SMS traffic at all a row still outlives its hour; a hard bound needs a scheduled job.
- **An unreadable form body gets a 503** (F5), so SMSAPI repeats the callback. A body that is not a form is ignored, as before.
- **`idx` is used only when it lines up with `MsgId`** (F6).
- **Not in the adaptations above, now recorded** (F9):
  - a callback that cannot be processed is answered 503, not `OK`, so SMSAPI retries; both RPCs are idempotent;
  - an auto-reply whose send fails still uses that number's hourly slot and one SMS of the daily budget;
  - a late reply to an ended crisis is recorded on the resident's queued alert of a newer crisis, if there is one: SMS has no threading, and accepting `queued` is what makes a lost `mark_crisis_alert_sent` harmless;
  - auto-replies share the 1000-a-day budget with alerts, so many late replies after a large crisis leave less for the next one that day.
- **Reports depend on the callback set in the SMSAPI panel** (F7): no caller passes `notify_url`. Staging and production therefore need separate SMSAPI accounts or subusers (`follow-ups/review-fixes.md`).
