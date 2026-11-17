---
change_id: crisis-sms-alert-confirmation
title: Crisis SMS alert with YES/NO confirmation
status: implementing
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
