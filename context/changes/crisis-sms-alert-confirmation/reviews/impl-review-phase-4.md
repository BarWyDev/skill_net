<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Crisis SMS Alert with YES/NO Confirmation

- **Plan**: `context/changes/crisis-sms-alert-confirmation/plan.md`
- **Scope**: Phase 4 of 5 (commit `130a89e`)
- **Date**: 2026-11-17
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 7 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

Every Phase 4 contract bullet and every test case in the plan's "4. Tests" has an implementation and an assertion. The deviations are recorded in `change.md` ("Phase 4 adaptations"). No "What We're NOT Doing" line is crossed. Automated criteria re-run on the committed code: `npm run test:db` (27 suites), `npm run test:unit` (184), `npx astro check`, `npm run lint`, `npm run build` and `npm run smoke` (against the dev server on 4371, not the production preview) all pass. Manual rows 4.4–4.7 are ticked on the owner's confirmation after a local walk.

Checked and found sound: the secret comparison (hashed, closed when unset), the token gate on both webhook RPCs, privileges and owner after the drop and recreate, `search_path` on every definer function, stranger and auto-reply abuse limits, the sub-block rollback in `private.take_autoreply`, idempotency of reports and replies under provider retries, expand-only rollout in both directions, and the team-assembly change (nobody is mislabelled).

## Findings

### F1 — Privacy notice promises one hour of retention the code does not guarantee

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: `src/pages/prywatnosc.astro:163-168`, `supabase/migrations/20261030140000_crisis_alert_replies.sql:47`
- **Detail**: The notice says the number's hash is kept "przez godzinę" and calls it "zaszyfrowany skrót". Rows in `private.sms_autoreply_log` are deleted only inside `private.take_autoreply`, which runs only when the next unclear or late reply arrives from anyone. With no such reply the row stays indefinitely. The hash is peppered, not encrypted.
- **Fix**: Run the same `delete` at the top of `record_sms_reply` and `record_sms_status`, and reword the notice to "około godziny" and "skrót".
  - Strength: Every webhook call then clears old rows, and the published text stops overpromising.
  - Tradeoff: Still not a hard bound when no SMS traffic arrives at all; a hard bound needs a scheduled job, which the project does not have.
  - Confidence: HIGH — two one-line SQL additions and a wording change.
  - Blind spot: Whether the DPO wants a hard bound (Phase 5, owner question 9).
- **Decision**: FIXED

### F2 — The path secret and phone numbers reach Workers Logs through the request URL

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: `wrangler.jsonc:21-23`, `src/pages/api/sms/odpowiedz/[secret].ts:22`, `src/pages/api/sms/raport/[secret].ts:19`
- **Detail**: `observability.enabled` is on, and Workers invocation logs record the request URL. Every callback URL carries `SMS_WEBHOOK_SECRET` in its path. SMSAPI's delivery report is a GET whose query string includes `to`, the recipient's number. The reply route also accepts GET, which would put `sms_from` and `sms_text` in the URL. The code logs nothing personal, but the platform log breaks the CLAUDE.md rule. That invocation logs record the full URL was not verified against a real callback.
- **Fix A ⭐ Recommended**: Make the reply route POST-only now, and add a Phase 5 checklist step: read one real staging report in Workers Logs, then turn invocation logs off for the Worker or accept and document it.
  - Strength: Removes the avoidable exposure (reply text and sender) today; SMSAPI's docs say replies are POST. Leaves the plan-level decision to the owner with evidence.
  - Tradeoff: Reports still carry `to` in the URL until that decision; the plan's "accept both methods" is narrowed for replies.
  - Confidence: MEDIUM — the docs were read, not exercised against a live account.
  - Blind spot: Whether SMSAPI can be set to send replies as GET in some account types.
- **Fix B**: Also set `observability.logs.invocation_logs: false` in `wrangler.jsonc` now.
  - Strength: Closes the leak for both routes at once.
  - Tradeoff: Loses request logs for the whole Worker, which `wrangler tail --status error` debugging relies on; a production config change.
  - Confidence: MEDIUM — the setting exists, its effect on current debugging habits is untested.
  - Blind spot: Other sessions' work that depends on invocation logs.
- **Decision**: FIXED via Fix A (Phase 5 step queued in `follow-ups/review-fixes.md`)

### F3 — A bad report or the dead-letter path can downgrade an alert that already has an answer

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `supabase/migrations/20261030140000_crisis_alert_replies.sql:110-113`, `supabase/migrations/20261030130000_crisis_alerts.sql:374-376`
- **Detail**: A reply leaves a `queued` alert `queued` (the send succeeded but `mark_crisis_alert_sent` was lost). A later `undelivered` or `failed` report, or `mark_crisis_alert_failed` from the dead-letter queue, then moves it although the resident answered. With `failed` the alert is no longer found by `record_sms_reply`, so a later NIE gets "akcja zakończona" during an active crisis, and the resident counts in the "alert nie dotarł" hint.
- **Fix**: Add `and a.answer is null` to the undelivered/failed branch of `record_sms_status` and to `mark_crisis_alert_failed` (recreated in the Phase 4 migration), plus a pgTAP case.
- **Decision**: FIXED

### F4 — A late `delivered` report can leave one resident with two open alerts

- **Severity**: OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: `supabase/migrations/20261030140000_crisis_alert_replies.sql:110-113`, `:166-174`
- **Detail**: The alert in crisis A is reported undelivered, the resident is alerted in crisis B, then a late `delivered` arrives for A. Both alerts are now open, which Phase 3 assumes cannot happen. Replies go to B (the newest); A shows "dostarczono" with no answer. The reply path has the same gap only as a narrow race with `queue_crisis_alerts`, which holds an advisory lock that `record_sms_reply` does not take.
- **Fix**: In `record_sms_status`, let `delivered` reopen an `undelivered` or `failed` alert only when the resident has no other open alert; document the remaining reply race in `change.md`.
  - Strength: Restores the Phase 3 invariant on the path that breaks it sequentially.
  - Tradeoff: A truly delivered message in A then stays "nie doręczono" when B exists; that is the lesser error.
  - Confidence: HIGH — one `not exists` clause, testable in pgTAP.
  - Blind spot: None significant.
- **Decision**: FIXED

### F5 — A POST whose body cannot be read is answered `OK`, so the reply is lost

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `src/lib/sms/webhook.ts:46-48`, `src/pages/api/sms/odpowiedz/[secret].ts:17`
- **Detail**: `readParams` swallows a body error, the route finds no sender and answers `OK`, and SMSAPI never retries.
- **Fix**: Let `readParams` report a failed body read, and answer 503 for it; keep `OK` for a well-read callback with a non-Polish sender.
- **Decision**: FIXED

### F6 — Multi-report parsing trusts that `idx` and `MsgId` lists line up

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `src/lib/sms/webhook.ts:104-112`
- **Detail**: If SMSAPI omits empty `idx` entries instead of sending `A,,B`, a later alert id pairs with an earlier `MsgId`, and an alert with no provider id gets another message's status. The real shape was read in the docs, not seen.
- **Fix**: When the two lists differ in length, ignore `idx` and match by `MsgId` only; add a unit test.
- **Decision**: FIXED

### F7 — Nothing sets `notify_url`, so reports depend on one account-wide setting

- **Severity**: OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: `src/lib/sms/alert-runtime.ts:37`, plan Phase 1 §2
- **Detail**: The plan says each message carries `notify_url`. The provider supports it, but no caller passes it. Reports arrive only through the callback set in the SMSAPI panel, and if staging and production share one SMSAPI account all reports go to one environment; the other's alerts stay "wysłano".
- **Fix A ⭐ Recommended**: Add to the Phase 5 owner checklist: staging and production use separate SMSAPI accounts or subusers, each with its own callbacks.
  - Strength: No code, and it also separates reply routing, which `notify_url` cannot fix.
  - Tradeoff: Relies on a manual step.
  - Confidence: MEDIUM — SMSAPI subusers were not checked.
  - Blind spot: Cost of a second two-way number.
- **Fix B**: Pass `notifyUrl` (canonical origin plus secret) in `createAlertRuntime`.
  - Strength: Matches the plan text; reports find the right environment.
  - Tradeoff: The queue consumer has no request, so the origin needs a new env var; replies still follow the panel setting.
  - Confidence: MEDIUM.
  - Blind spot: How `notify_url` interacts with the panel callback.
- **Decision**: FIXED via Fix A (queued in `follow-ups/review-fixes.md`)

### F8 — A retried old reply can overwrite a newer one

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `supabase/migrations/20261030140000_crisis_alert_replies.sql:184-192`
- **Detail**: "Last answer wins" is by arrival. TAK gets a 503, NIE is recorded, then SMSAPI retries the TAK: the list shows TAK. `sms_date` is in the callback and unused.
- **Fix**: Pass `sms_date` to `record_sms_reply` and ignore a reply older than the stored `answered_at`.
- **Decision**: FIXED

### F9 — Behaviours not recorded in `change.md`, and logs that cannot tell errors apart

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: `src/lib/sms/webhook-response.ts:17`, `src/lib/services/sms-webhooks.ts:44`, `:67`, `:71-76`
- **Detail**: Four things are in the code but not in the adaptations: the 503 answer that makes SMSAPI retry; a failed auto-reply send still uses the hourly slot and the budget; a late reply to ended crisis A is recorded on a still-queued alert of crisis B; auto-replies share the daily budget with alerts. Separately, every raise is `P0001`, so logging `error.code` cannot tell `worker_token_unset` from `invalid_status`.
- **Fix**: Add the four notes to `change.md`, and log `error.message` when the code is `P0001` (the messages are fixed strings with no personal data).
- **Decision**: FIXED

### F10 — Test gaps in the new suite and in smoke

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: `supabase/tests/crisis_alert_replies_test.sql`, `scripts/smoke.mjs`
- **Detail**: Not covered: a `failed` report; a report with a null provider id found by alert id; the `not exists` guard on a provider id held by another alert; reply routing with two active crises (undelivered in A, open in B). Smoke has no check for the new routes.
- **Fix**: Add the four pgTAP cases, and a read-only "wrong secret → 404" smoke step for both routes.
- **Decision**: FIXED
