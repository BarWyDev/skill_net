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
