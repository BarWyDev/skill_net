# Crisis SMS Alert with YES/NO Confirmation Implementation Plan

## Overview

A coordinator sends a crisis SMS to the top N matched residents of an active crisis. Each resident who has a verified phone number can reply `TAK` or `NIE`, and a `TAK` moves that person to the top of the ranking. Sending goes through a Cloudflare Queue to SMSAPI.pl. Replies and delivery reports come back through two webhooks. An exercise only simulates the send. This is roadmap S-07 (FR-011, the alert half of US-01). S-08 then adds the confirmed people's contacts and live refresh.

## Current State Analysis

- **Activation and ranking.** `activate_crisis` (`supabase/migrations/20261025120000_crisis_rpc_limits.sql:32-176`) writes a frozen snapshot to `crisis_matches` (at most 1000 rows) with `rank` and `position`. The score already reserves `w_availability = 0.20` for every crisis type (`20261001120100_seed_crisis_matrix.sql`), but the term is a literal `0` (`rpc_limits.sql:159`). No confirmation is stored anywhere.
- **The coordinator's list.** `get_crisis_matches(p_crisis_id, p_limit)` (`rpc_limits.sql:189-240`) returns at most 200 rows `order by m.position`. It never returns `user_id`, score or phone, and it logs to `crisis_list_views`. Team candidates (`20261004140000_crisis_team_templates.sql:57-119`) are also taken in `position` order.
- **Phone numbers.** They live in `profile_contacts(user_id, phone '^\+48\d{9}$', phone_verified_at)` (`20261003120000_resident_phone_and_availability.sql:25-30`). A trigger clears `phone_verified_at` when the number changes. Clients cannot write that column (`narrow_table_grants_test.sql:74-82`). Its comment reserves it for S-07, and today no number is verified.
- **Audience rules already promised.** Alerts may go only to people who pass `profile_is_matchable`, which means a location, at least one skill with `use_in_crisis`, consent and no active pause (`20261019120000_data_visibility_controls.sql:14-15,79-95`; `20261006120000_pause_availability.sql:11-15`). Exercises never alert anyone (`20261020120000_crisis_exercises.sql:13-14`). The UI copy says the same (`CrisisActivationForm.tsx:157`, `CrisisFacts.astro:38`, `koordynator/index.astro:133`).
- **Ending a crisis.** `end_crisis` (`20261002120000_crisis_deactivation.sql:34-67`) deletes the snapshot. The rule is that nothing links a resident to an incident once it has ended. Audit tables (`contact_reveal_events`, `crisis_list_views`) outlive it without a resident link.
- **Platform.** `wrangler.jsonc` has no queues and no crons. The Worker entry is the adapter's default (`@astrojs/cloudflare/entrypoints/server`). Adapter 14.3.4 exports `@astrojs/cloudflare/handler`, so a custom entry can add a `queue` handler. Production runs on Workers **Free**, and Queues need **Paid**. The app uses only the publishable Supabase key; CLAUDE.md forbids the service key.
- **Privacy notice.** `src/pages/prywatnosc.astro:73-76` already promises that a `TAK` reveals the number to the coordinator for that crisis. That reveal arrives in S-08.

## Desired End State

- A resident can verify their number on `/profil` with a 6-digit SMS code. Changing the number clears the verification, as it does today.
- On an active, real crisis, the coordinator picks N (default 50, max 200) and presses "Wyślij alert". Only eligible residents are queued: verified number, matchable, not paused, not already alerted in this crisis, and no open alert in another active crisis. The page says how many were queued and how many were skipped, with the reason. A further batch can be sent later.
- In an exercise, the same button sends nothing. It shows how many people would have been alerted and the estimated cost.
- Each person in the ranking shows an alert status: not sent, queued, sent, delivered, not delivered, TAK, NIE. People who answered `TAK` are listed first, then those with no answer, then `NIE`. Within each group the original `position` order holds. Team assembly uses the same order.
- A `TAK` or `NIE` reply updates the status, and the last answer wins. A reply to an alert whose crisis has ended gets one SMS saying the action is over. Nothing about it is stored.
- A failed send is retried three times, then lands in a dead-letter queue and shows as "nie wysłano". Delivery reports from SMSAPI turn "sent" into "delivered" or "not delivered".
- Ending a crisis deletes its alerts along with the snapshot. Only an aggregate batch audit (who sent how many, when) remains.

Verify with `npm run test:db`, `npm run test:unit`, `npm run lint`, `npx astro check`, the local end-to-end walk in Phase 4 using the fake provider, and a real-phone run on production in Phase 5.

### Key Discoveries:

- The ranking is frozen at activation (`rpc_limits.sql:111-174`). "Confirmed first" is an `ORDER BY` change at read time, not a re-score. `w_availability` stays at 0 in the score; see "What We're NOT Doing".
- `phone_verified_at` is already guarded, with no client write, reset on change and asserted in `narrow_table_grants_test.sql`, so verification only needs a server path that sets it.
- The S-12 and S-13 headers explicitly require S-07's sender to reuse `profile_is_matchable` and `pause_active` (`data_visibility_controls.sql:14-15`, `pause_availability.sql:11-15`).
- `@astrojs/cloudflare/handler` exports `handle`, so `src/worker.ts` can export `{ fetch: handle, queue }` with `wrangler.jsonc` `main` pointing at it.
- A Polish diacritic switches an SMS to UCS-2 (70 characters per segment), which doubles the cost of a 100-character alert. Alert text is GSM-7 only.

## What We're NOT Doing

- No push notifications (owner decision: SMS only in v1).
- No link in the SMS and no web page for answering. Residents reply by SMS only.
- No automatic send on activation. The coordinator sends each batch.
- No phone numbers of confirmed people on the crisis page and no live refresh. Both are S-08. Until then break-glass (S-09) stays the way to reach people.
- No re-scoring with `w_availability`. The seeded 0.20 weight stays unused in the score. Rebalancing the matrix is a separate decision for the owner.
- No reminders or re-sends to people who did not answer, and no alert expiry inside an active crisis.
- No SMS to the coordinator in exercises.
- No Supabase Auth phone sign-in. Verification is our own code flow, not an auth identity.
- No consent-version bump. The privacy notice gains the SMS processing text; whether the council's DPO wants a new consent version is an open owner question (Phase 5).
- No backup SMS provider.

## Implementation Approach

The Worker never holds the Supabase service key. Every server-only database path (claiming an alert to send, recording a reply or a delivery report, starting or checking a phone code) is a `security definer` RPC callable by `anon`. Each one hashes `p_token` with SHA-256 and compares it with the hash stored in `private.worker_tokens(name text pk, token_hash text)` under `name = 'sms_worker'` before doing anything. That table has RLS on and no client grants, and the project uses no Vault. The plain token is a Worker secret, `SMS_WORKER_TOKEN` (32+ random bytes). Clients hold no grants on the new tables.

New functions get `EXECUTE` for `PUBLIC` by default, because `narrow_table_grants` only changed table defaults. So every new or recreated function is followed by an explicit `revoke execute … from public, anon` (and `authenticated` where it applies) and a grant to exactly the role that calls it: `authenticated` for coordinator RPCs, `anon` for token-gated ones. A function that is dropped and recreated loses its grants (see `20261003120000…:170,252-254`), so it must be re-granted in the same migration.

The flow:

```
coordinator POST /api/koordynator/kryzysy/[id]/alert
  → queue_crisis_alerts(crisis, n)   (coordinator RPC: picks eligible rows, inserts crisis_alerts 'queued', returns alert ids + skip counts)
  → env.SMS_ALERTS.sendBatch(ids)
queue consumer (src/worker.ts)
  → claim_crisis_alert(token, id)    (returns phone + GSM-7 text, or nothing if no longer eligible)
  → SMSAPI send → mark_crisis_alert_sent(token, id, provider_id) / retry / DLQ → mark_crisis_alert_failed
SMSAPI → POST /api/sms/raport/[secret]     → record_sms_status(token, provider_id, status)
SMSAPI → POST /api/sms/odpowiedz/[secret]  → record_sms_reply(token, from, text) → optional auto-reply SMS
```

A fake provider (`SMS_PROVIDER=fake`, the default when `SMSAPI_TOKEN` is missing) records sends in memory and logs only alert ids, so local dev, CI and previews never send a real SMS.

## Critical Implementation Details

**Timing & lifecycle.** The consumer must re-check eligibility at claim time, not only at queue time. The crisis may have ended, the resident may have paused, unregistered or changed their number in the minutes since queueing. `claim_crisis_alert` returns nothing in those cases, and the message is acked without sending. `end_crisis` deletes `crisis_alerts` rows, so a late delivery report or reply finds no row and is dropped. A reply from a number that belongs to a verified profile still gets the "akcja zakończona" auto-reply.

**Security.** Webhook URLs carry a path secret (`SMS_WEBHOOK_SECRET`), compared in constant time. SMSAPI cannot sign callbacks, and the secret is the only gate besides the worker-token check inside the RPC. The routes accept both GET and POST, because SMSAPI's callback method is unverified. Astro's default `checkOrigin` rejects a form POST only when an `Origin` or `Sec-Fetch-Site` header shows it is cross-site, so a server-to-server callback without those headers passes. Never log phone numbers, reply text or the secret; log alert ids and status codes only (CLAUDE.md). An unknown sender gets no auto-reply, so strangers cannot make us pay for outgoing SMS.

**Cost guard.** One daily SMS budget covers every outgoing message: alerts, verification codes and auto-replies. It is 1000 per day across the account, counted in `private.sms_daily_usage(day date pk, sent int)`, which a helper `private.take_sms_budget(n)` increments atomically. When the budget runs out, the helper raises `sms_budget_exhausted`. On top of that:
- `queue_crisis_alerts` caps 200 per call and 500 per crisis;
- phone codes: 3 sends per user per hour, 5 check attempts per code, plus the existing `AUTH_IP_LIMITER`;
- auto-replies: at most 1 per number per hour, tracked by a hash of the number in `private.sms_autoreply_log(phone_hash, sent_at)`, never the number itself.

**Open alert.** An alert is *open* while its crisis is `active` and its status is `queued`, `sent` or `delivered`, **whatever its answer is**. This one definition serves two purposes:
- "One alert at a time": a person who answered TAK in crisis A is not alerted for crisis B while A is active.
- Reply routing: a second reply (TAK → NIE) still finds the same alert, so the last answer wins.

`undelivered` and `failed` alerts are not open.

**Reply parsing.** Normalise case, strip whitespace, punctuation and diacritics. `tak`, `t`, `yes` count as TAK; `nie`, `n`, `no` count as NIE. Anything else is stored nowhere and gets one auto-reply asking for TAK or NIE. A reply maps to the sender's single open alert. Two rules make that unambiguous: one open alert per person at a time, and a verified number belongs to one account only (Phase 2's unique index).

## Phase 1: Platform foundation

### Overview

Queue, custom Worker entry, SMS client with a fake provider, alert text builder and secrets. Nothing user-visible yet.

### Changes Required:

#### 1. Worker entry and queue binding

**File**: `src/worker.ts`, `wrangler.jsonc`, `src/env.d.ts`

**Intent**: Replace the adapter's default entry with one that forwards `fetch` to the adapter and adds a `queue` handler. Bind a producer and a consumer for `skillnet-sms-alerts`, with a dead-letter queue `skillnet-sms-alerts-dlq`. Previews get no queue binding, so the producer must treat a missing binding as "fake provider".

**Contract**: `wrangler.jsonc` `main: "src/worker.ts"`; `queues.producers [{ binding: "SMS_ALERTS", queue: "skillnet-sms-alerts" }]`; `queues.consumers [{ queue: "skillnet-sms-alerts", max_batch_size: 10, max_batch_timeout: 2, max_retries: 3, dead_letter_queue: "skillnet-sms-alerts-dlq" }]` plus a consumer on the DLQ that marks alerts failed. Message body `{ alertId: string }`. `export default { fetch: handle, async queue(batch, env, ctx) {…} }`. Verify `npm run build` and `npm run preview` still serve every page before going on.

#### 2. SMS client

**File**: `src/lib/sms/smsapi.ts`, `src/lib/sms/fake.ts`, `src/lib/sms/index.ts`

**Intent**: A tiny provider interface over `fetch` with no SDK (Node stubs fail on workerd). SMSAPI implementation: bearer token, `POST https://api.smsapi.pl/sms.do` with `format=json`, `encoding=utf-8` off and `notify_url` set to the delivery-report webhook. The fake provider records calls for tests.

**Contract**: `sendSms({ to, text }): Promise<{ ok: true; providerId: string } | { ok: false; retryable: boolean; code: string }>`. `getSmsProvider(env)` returns SMSAPI only when `SMSAPI_TOKEN` is set and `SMS_PROVIDER !== "fake"`. Confirm the exact parameter names against SMSAPI's docs at implementation time.

#### 3. Alert and code text

**File**: `src/lib/sms/text.ts`, `src/lib/sms/text.test.ts`, `src/lib/sms/reply.ts`, `src/lib/sms/reply.test.ts`

**Intent**: Build GSM-7-only Polish text (diacritics folded: ą→a, ł→l, …) within 160 characters, and parse replies.

**Contract**: `alertText({ crisisTypeLabel, postcode })`. `crises` has no place name, only `epicentre_postcode`, which is null for a pin activation. The text is something like `SkillNet: <typ> w Twojej okolicy (<kod>). Koordynator prosi o pomoc. Odpisz TAK jesli mozesz pomoc lub NIE.`, and when `postcode` is null the brackets are dropped.; `codeText(code)`; `endedText()`; `unclearText()`. `isGsm7(text)` and `parseReply(text): "yes" | "no" | null`. Tests cover a 160-character boundary, every diacritic, and replies such as `Tak!`, ` t `, `NIE.`, `tak, będę`, `ok`.

#### 4. Env and config

**File**: `astro.config.mjs`, `src/lib/config-status.ts`, `.dev.vars.example` (if present) or README

**Intent**: Declare the new optional server secrets and show a banner entry when SMS is not configured.

**Contract**: `SMSAPI_TOKEN`, `SMS_WEBHOOK_SECRET`, `SMS_WORKER_TOKEN` (secret, optional), `SMS_PROVIDER` and `SMSAPI_SENDER` (public, optional). Banner message: "SMS nie jest skonfigurowany — alerty i weryfikacja numeru działają w trybie testowym."

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test:unit`
- Type check passes: `npx astro sync && npx astro check`
- Lint passes: `npm run lint`
- Build passes and the generated config carries the queue bindings: `npm run build`

#### Manual Verification:

- `npm run preview` serves `/`, `/profil` and a coordinator crisis page exactly as before the entry change
- Pre-merge gate (owner, human-only): the account is on Workers Paid, and `npx wrangler queues create skillnet-sms-alerts` and `npx wrangler queues create skillnet-sms-alerts-dlq` have run. Workers Builds deploys every merge, and a queue binding cannot deploy without both.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Do not merge the Phase 1 PR before the pre-merge gate is ticked.

---

## Phase 2: Phone verification

### Overview

A resident confirms their number with a code sent by SMS, and `phone_verified_at` gets set. This is the gate for receiving alerts.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/20261030120000_phone_verification.sql`

**Intent**: Store one pending code per user and add worker-token-gated RPCs. The Worker generates the code, sends it, and stores only its hash. The user then submits the code through an authenticated route, and the Worker checks it through the RPC. A user can never call the RPCs directly, because they need the token.

**Contract**: The migration adds:
- table `phone_verification_codes(user_id pk references auth.users on delete cascade, phone text, code_hash text, expires_at, attempts int, sent_at)`, with RLS enabled, no policies and no client grants;
- table `private.worker_tokens` and helper `private.check_worker_token(p_token text)`, which compares `sha256(p_token)` with the stored hash and raises `worker_token_unset` when no row exists;
- `private.sms_daily_usage` and `private.take_sms_budget(n)` (see Cost guard);
- a partial unique index `profile_contacts (phone) where phone_verified_at is not null`.

Then:

- `begin_phone_verification(p_token, p_user_id, p_code_hash)` returns `phone text`. It raises `no_phone`, `already_verified`, `phone_taken` (another account has verified this number), `rate_limited` (3 per hour) or `sms_budget_exhausted`.
- `confirm_phone_verification(p_token, p_user_id, p_code_hash)` returns `boolean`. It raises `expired`, `too_many_attempts` or `phone_taken`. It sets `profile_contacts.phone_verified_at = now()` only if the stored phone still equals the current one, then deletes the code row.

Both: `revoke execute … from public, authenticated` and `grant execute … to anon`. The Worker calls them with the publishable key, and they are useless without the token.

#### 2. Routes and UI

**File**: `src/pages/api/profile/telefon/wyslij-kod.ts`, `src/pages/api/profile/telefon/potwierdz.ts`, `src/lib/services/phone-verification.ts`, `src/components/profile/PhoneField.tsx` (or its sibling), `src/lib/services/profile.ts`

**Intent**: Two form-POST routes that follow the existing redirect-with-`?error=` pattern and are throttled by `AUTH_IP_LIMITER`. `PROTECTED_ROUTES` has `/profil` but not `/api/profile` (`src/middleware.ts:16-25`), so each route checks `locals.user` itself and redirects anonymous callers, as `src/pages/api/profile/pause.ts` does. `phone_taken` maps to "Ten numer jest już potwierdzony na innym koncie." `/profil` shows "Numer niezweryfikowany — nie dostaniesz alertu" with a "Wyślij kod" button, then a code field. The profile read model exposes `phone_verified`.

**Contract**: The code is 6 digits from `crypto.getRandomValues`, hashed with SHA-256 together with the user id, and valid for 10 minutes. `get_my_profile` (or the contacts read) adds `phone_verified boolean`.

#### 3. Tests

**File**: `supabase/tests/phone_verification_test.sql`, `supabase/tests/narrow_table_grants_test.sql`

**Intent**: Each test inserts its own `private.worker_tokens` row. Prove that:
- a wrong token is refused;
- a wrong code counts an attempt;
- expiry works and the 3-per-hour limit holds;
- changing the number after the code was sent prevents verification;
- a number verified on account A gives `phone_taken` on account B;
- the daily budget refuses once exhausted;
- the new table has no client grants;
- `has_function_privilege` shows `authenticated` cannot execute the token-gated RPCs.

### Success Criteria:

#### Automated Verification:

- DB tests pass: `npm run test:db`
- Unit tests pass: `npm run test:unit`
- Type check and lint pass: `npx astro check`, `npm run lint`

#### Manual Verification:

- On `npm run dev` with the fake provider, a resident sends a code (read from the dev log by alert or code id, never the number), confirms it, and `/profil` shows the number as verified; changing the number shows it as unverified again

**Implementation Note**: Pause for manual confirmation before Phase 3.

---

## Phase 3: Sending alerts

### Overview

The coordinator queues a batch, the consumer sends it, and exercises simulate the send.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/20261030130000_crisis_alerts.sql`

**Intent**: Per-person alert state, tied to the snapshot so that `end_crisis` removes it. Add an aggregate audit of batches that outlives the crisis and carries no resident link. Add the coordinator RPC that picks recipients and the token-gated RPCs that the consumer uses.

**Contract**:

- **Tables.**
  - `crisis_alerts(id uuid pk, crisis_id, user_id, status text check in ('queued','sent','delivered','undelivered','failed'), answer text check in ('yes','no') null, answered_at, provider_id text unique, queued_at, sent_at, status_at)`. It has a foreign key `(crisis_id, user_id) references crisis_matches on delete cascade`, a unique `(crisis_id, user_id)`, and RLS with no client grants.
  - `crisis_alert_batches(id, crisis_id, sent_by, requested int, queued int, skipped jsonb, simulated boolean, created_at)`, with no foreign key to the user (matches the `contact_reveal_events` pattern).
- **`queue_crisis_alerts(p_crisis_id uuid, p_count int)`** (coordinator only) returns `table(alert_ids uuid[], queued int, skipped jsonb, simulated boolean, estimated_cost_pln numeric)`.
  - It refuses an ended crisis.
  - It takes the first `p_count` (clamped to 1..200) not-yet-alerted rows in `position` order that pass `profile_is_matchable`, `not pause_active`, `phone_verified_at is not null` with the current phone, and have no open alert (see "Open alert": active crisis and status `queued`, `sent` or `delivered`, whatever the answer) in another crisis.
  - It counts skips by reason: `unverified`, `no_phone`, `paused`, `other_crisis`.
  - For `is_exercise` it inserts no `crisis_alerts` rows and returns `simulated = true` with the counts.
  - It enforces the per-crisis cap (500), raising `alert_cap_reached`, and takes the queued count from the daily budget with `private.take_sms_budget`, which raises `sms_budget_exhausted`. A simulated batch takes nothing. It writes a batch row.
  - Grants: `revoke … from public, anon`, `grant … to authenticated`.
- **`claim_crisis_alert(p_token, p_alert_id)`** returns `table(phone text, crisis_type text, epicentre_postcode text)`. It returns no row if the crisis ended, the resident paused, unregistered or changed their number, or the status is not `queued`.
- **`mark_crisis_alert_sent(p_token, p_alert_id, p_provider_id)`** and **`mark_crisis_alert_failed(p_token, p_alert_id)`** update the status.
- All token-gated RPCs: `revoke … from public, authenticated`, `grant … to anon`.

#### 2. Producer route and service

**File**: `src/pages/api/koordynator/kryzysy/[id]/alert.ts`, `src/lib/services/crisis.ts`

**Intent**: The form POST calls `queue_crisis_alerts`, then `env.SMS_ALERTS.sendBatch` in chunks of 100. Without the binding, as in previews and with the fake provider, it hands the ids to an in-process fake send so that dev works end to end. It redirects back with a flash summary: "Wysłano do kolejki: 42. Pominięto: 5 bez zweryfikowanego numeru, 3 w innym zdarzeniu." For an exercise the summary reads "Ćwiczenie: alert trafiłby do 42 osób (ok. 6 zł). Nikt nie dostał SMS-a." Error codes map to Polish messages the same way `activateCrisis` errors do (`crisis.ts:38-42`).

#### 3. Consumer

**File**: `src/worker.ts`, `src/lib/sms/dispatch.ts`

**Intent**: For each message, claim the alert, send it, and mark it. A retryable provider error calls `message.retry()`; a non-retryable one marks the alert failed and acks the message. The DLQ consumer marks the alert failed. The consumer builds its own Supabase client from env, with no cookies.

**Contract**: `dispatchAlert(alertId, deps)`, a pure function with its dependencies injected so that `dispatch.test.ts` can cover claim-empty → ack, send-ok → mark sent, send-retryable → retry, send-fatal → mark failed.

#### 4. Crisis page

**File**: `src/pages/koordynator/kryzys/[id].astro`, `src/components/crisis/AlertForm.astro` (new)

**Intent**: A form with N (default 50, 1..200) and "Wyślij alert SMS". For an exercise the label reads "Symuluj alert (ćwiczenie)". It shows the batches sent so far for this crisis. Exercise copy elsewhere stays true.

#### 5. Tests

**File**: `supabase/tests/crisis_alerts_test.sql`, `narrow_table_grants_test.sql`, `src/lib/sms/dispatch.test.ts`

**Intent**: Cover each skip reason, exercise → no rows, the one-open-alert rule across two active crises (including a person who already answered TAK in crisis A being skipped for crisis B), the caps and the shared daily budget, `end_crisis` cascading the alerts while keeping the batch audit, claim returning nothing after a pause, unregister or number change, a wrong token refused, and no client grants.

### Success Criteria:

#### Automated Verification:

- DB tests pass: `npm run test:db`
- Unit tests pass: `npm run test:unit`
- Type check, lint and build pass: `npx astro check`, `npm run lint`, `npm run build`

#### Manual Verification:

- On `npm run dev`, a coordinator sends a batch on a real (non-exercise) seeded crisis, and statuses move from queued to sent with the fake provider
- In an exercise, the button simulates the send, and no `crisis_alerts` rows exist
- Ending the crisis removes the alerts; the batch audit remains

**Implementation Note**: Pause for manual confirmation before Phase 4.

---

## Phase 4: Replies, delivery reports and ranking

### Overview

Close the loop: replies and delivery reports update the alert, and the ranking puts `TAK` first.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/20261030140000_crisis_alert_replies.sql`

**Intent**: Add the token-gated RPCs for webhooks, and change the read order of the list and the teams.

**Contract**:

- **`record_sms_status(p_token, p_provider_id, p_status text)`** maps SMSAPI's statuses to `delivered`, `undelivered` or `failed`. It is idempotent and never downgrades `delivered`.
- **`record_sms_reply(p_token, p_phone, p_answer text)`**, with `p_answer` one of `'yes'`, `'no'` or `'unclear'`, returns `text`: `recorded`, `unclear`, `ended` or `unknown`.
  - It normalises the sender (`48…`, `+48…`, `0048…`) to `+48XXXXXXXXX`, finds the sender's open alert (see "Open alert") and sets `answer` and `answered_at`; the last answer wins.
  - `ended` means the sender has a verified profile but no open alert, so the Worker sends the auto-reply.
  - `unknown` means no auto-reply.
  - On `ended` or `unclear` it also checks the per-number auto-reply limit and the daily budget, and returns `ended_silent` or `unclear_silent` when either refuses.
- **`get_crisis_matches`** gains `alert_status text` and `answer text` columns. Its order becomes `case answer when 'yes' then 0 when 'no' then 2 else 1 end, position`.
- **Team candidates** use the same order.
- **Grants after drop and recreate.** Return types change, so the migration drops and recreates `get_crisis_matches` and `get_team_candidates`. Right after each, it re-runs `revoke … from public, anon` and `grant … to authenticated` as in `20261003120000…:252-254`, and redoes `owner to postgres`. Columns are only added, never renamed, so the ten pgTAP suites that call these RPCs keep working. Keep it expand-then-contract: the current app code must keep working against the new columns, which it ignores.
- **Types.** Regenerate `src/db/database.types.ts`.

#### 2. Webhook routes

**File**: `src/pages/api/sms/raport/[secret].ts`, `src/pages/api/sms/odpowiedz/[secret].ts`, `src/middleware.ts` (only if these paths need excluding from session work)

**Intent**: Export both `GET` and `POST` and read the fields from the query string or the form body. Constant-time secret check → 404 on mismatch. Parse SMSAPI's callback fields, call the RPC, and answer what SMSAPI expects (plain `OK`). On `ended` or `unclear`, send the matching auto-reply through the provider. The routes set `Cache-Control: no-store` (see lessons.md on cache headers) and log nothing personal.

#### 3. Ranking UI and privacy notice

**File**: `src/pages/koordynator/kryzys/[id].astro`, `src/components/crisis/PersonStatus*`, `src/lib/crisis-format.ts`, `src/types.ts`, `src/pages/prywatnosc.astro`

**Intent**: Each row shows a status badge: "TAK", "NIE", "dostarczono", "wysłano", "w kolejce", "nie doręczono", or nothing when no alert was sent. Add a hint next to "Nikt nie potwierdza?" pointing at break-glass when many alerts went undelivered. The privacy notice gains:
- SMS alerts and the verification code;
- SMSAPI.pl as a processor;
- what is stored (status and answer) and that it is deleted when the crisis ends.

#### 4. Tests

**File**: `supabase/tests/crisis_alert_replies_test.sql`, `src/lib/sms/reply.test.ts` (extend)

**Intent**: Cover:
- yes → top of the list, then no → bottom in the same active crisis, returning `recorded` both times (last answer wins, never `ended`);
- a second auto-reply to the same number within an hour → `ended_silent`;
- `has_function_privilege` showing that `anon` still cannot execute `get_crisis_matches` or `get_team_candidates` after the recreate;
- a reply after `end_crisis` → `ended`; a stranger → `unknown`, a duplicate delivery report → idempotent, `delivered` never downgraded, teams preferring confirmed people, and a wrong token refused.

### Success Criteria:

#### Automated Verification:

- DB tests pass: `npm run test:db`
- Unit tests pass: `npm run test:unit`
- Type check, lint, build and smoke pass: `npx astro check`, `npm run lint`, `npm run build`, `npm run smoke`

#### Manual Verification:

- Locally, a curl to the reply webhook (fake secret, a seeded verified number, no `Origin` header, once as POST and once as GET) with `Tak` moves that person to the top. A second curl with `nie` moves them to the bottom.
- A curl after ending the crisis triggers the "akcja zakończona" fake send. A curl from an unknown number triggers nothing.
- A wrong secret returns 404.
- `/prywatnosc` reads correctly.

**Implementation Note**: Pause for manual confirmation before Phase 5.

---

## Phase 5: Production rollout

### Overview

Owner-run steps, then a real-phone test and documentation. Merging Phases 1–4 to `master` before the owner steps is safe, because without `SMSAPI_TOKEN` the app stays on the fake provider. The one exception is that the Worker cannot deploy with a queue binding on the Free plan, so **Workers Paid must happen before the Phase 1 PR merges**.

### Changes Required:

#### 1. Owner checklist

**File**: `context/changes/crisis-sms-alert-confirmation/owner-checklist.md`

**Intent**: Step-by-step list in Polish:
1. Confirm that the Phase 1 pre-merge gate is done: Workers Paid, and both queues created.
2. Open an SMSAPI account and choose the product that both sends and receives replies on one number (two-way). Confirm the monthly fee for the number. Top up.
3. Ask SMSAPI and CERT Polska whether the sender needs registering under the Polish rules on SMS impersonation.
4. Create an API token limited to sending.
5. Set the reply callback and delivery-report URLs, carrying `SMS_WEBHOOK_SECRET`, in the SMSAPI panel.
6. Generate the worker token locally. In Studio on production, insert only its SHA-256 hash: `insert into private.worker_tokens (name, token_hash) values ('sms_worker', '<hex sha256>')`.
7. Run `npx wrangler secret put` for `SMSAPI_TOKEN`, `SMS_WEBHOOK_SECRET` and `SMS_WORKER_TOKEN` (each deploys a new version).
8. Run `npx supabase migration list --linked`, then `npx supabase db push`.
9. Ask the DPO whether the privacy-notice change needs a new consent version.

#### 2. End-to-end on production

**File**: `context/changes/crisis-sms-alert-confirmation/e2e-results.md`

**Intent**: With `npx wrangler tail skillnet --format json --status error` running:
1. Verify the owner's own number on `/profil`.
2. Activate a real crisis in an empty area so that only the owner matches, then send N=1.
3. Receive the SMS. Reply `TAK` and check the top of the list, then `NIE`.
4. End the crisis, reply again and receive "akcja zakończona".
5. Check delivery status, the batch audit and the time from send to `TAK` (must be under 5 minutes).

Record the results without numbers.

#### 3. Docs

**File**: `context/foundation/infrastructure.md`, `context/foundation/roadmap.md`, `CLAUDE.md`

**Intent**: Record the Queues, the custom entry, SMSAPI, the secrets, the worker-token hash in `private.worker_tokens` and the costs. Mark the risk-register rows for fan-out and Free-plan limits resolved. Add an entry to the CLAUDE.md Deploy section: secrets, "previews use the fake SMS provider", and "never merge while a crisis is active" now applies.

### Success Criteria:

#### Automated Verification:

- Read-only smoke against production passes: `SMOKE_READONLY=1 BASE_URL=https://skillnet.barwy.workers.dev npm run smoke`
- `npx supabase migration list --linked` shows no pending migrations

#### Manual Verification:

- Every step of the production E2E passes and is recorded in `e2e-results.md`
- The SMSAPI panel shows the delivered message and the received replies

---

## Testing Strategy

### Unit Tests:

- GSM-7 folding and the 160-character limit, and reply parsing (`text.test.ts`, `reply.test.ts`).
- Consumer decisions with an injected provider and RPCs (`dispatch.test.ts`).
- The provider selection rule (fake vs SMSAPI).

### Integration Tests:

- pgTAP for every new RPC: the token gate, eligibility and skip reasons, caps, one open alert across crises, exercise simulation, `end_crisis` cascade, last-answer-wins ordering, idempotent delivery reports, and grants.

### Manual Testing Steps:

1. Locally, verify a seeded resident's phone with the fake provider.
2. Send a batch on a real seeded crisis and watch the statuses.
3. Curl the reply and report webhooks and watch the order of the list change.
4. Run an exercise and confirm nothing is queued.
5. On production, run the real-phone E2E (Phase 5).

## Performance Considerations

`queue_crisis_alerts` is one statement over at most 1000 snapshot rows. The consumer's batch of 10 makes about 3 subrequests per message, well under the Paid limits. SMSAPI's own rate limit has not been verified. If it rejects bursts, lower `max_batch_size` or add `max_concurrency` on the consumer. `get_crisis_matches` keeps its 200-row cap; the new join to `crisis_alerts` uses the `(crisis_id, user_id)` key.

## Migration Notes

All three migrations are additive. The functions whose return types change are dropped and recreated in the same migration, and the code on `master` ignores the new columns. Push each one right after its PR merges (lessons.md). `crisis_alerts` starts empty. Existing residents have unverified numbers until they verify; the crisis page's skip summary makes that visible to coordinators.

## References

- Roadmap: `context/foundation/roadmap.md` S-07; PRD FR-011, US-01
- Ranking and list: `supabase/migrations/20261025120000_crisis_rpc_limits.sql:32-240`
- Phone storage: `supabase/migrations/20261003120000_resident_phone_and_availability.sql:25-48`
- Audience rules: `20261019120000_data_visibility_controls.sql:14-15,79-95`, `20261006120000_pause_availability.sql:11-15`, `20261020120000_crisis_exercises.sql:13-14`
- Audit pattern without a resident link: `20261004120000_break_glass_contact_reveal.sql:26-46`
- Fan-out risks: `context/foundation/infrastructure.md` (Devil's Advocate 2 and 4, Risk Register)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Platform foundation

#### Automated

- [ ] 1.1 Unit tests pass: `npm run test:unit`
- [ ] 1.2 Type check passes: `npx astro sync && npx astro check`
- [ ] 1.3 Lint passes: `npm run lint`
- [ ] 1.4 Build passes and the generated config carries the queue bindings: `npm run build`

#### Manual

- [ ] 1.5 `npm run preview` serves `/`, `/profil` and a coordinator crisis page exactly as before the entry change
- [ ] 1.6 Pre-merge gate: Workers Paid on, and both queues created

### Phase 2: Phone verification

#### Automated

- [ ] 2.1 DB tests pass: `npm run test:db`
- [ ] 2.2 Unit tests pass: `npm run test:unit`
- [ ] 2.3 Type check and lint pass: `npx astro check`, `npm run lint`

#### Manual

- [ ] 2.4 On `npm run dev` with the fake provider, a resident sends a code, confirms it, and `/profil` shows the number as verified; changing the number shows it as unverified again

### Phase 3: Sending alerts

#### Automated

- [ ] 3.1 DB tests pass: `npm run test:db`
- [ ] 3.2 Unit tests pass: `npm run test:unit`
- [ ] 3.3 Type check, lint and build pass: `npx astro check`, `npm run lint`, `npm run build`

#### Manual

- [ ] 3.4 On `npm run dev`, a coordinator sends a batch on a real seeded crisis, and statuses move from queued to sent with the fake provider
- [ ] 3.5 In an exercise, the button simulates the send, and no `crisis_alerts` rows exist
- [ ] 3.6 Ending the crisis removes the alerts; the batch audit remains

### Phase 4: Replies, delivery reports and ranking

#### Automated

- [ ] 4.1 DB tests pass: `npm run test:db`
- [ ] 4.2 Unit tests pass: `npm run test:unit`
- [ ] 4.3 Type check, lint, build and smoke pass: `npx astro check`, `npm run lint`, `npm run build`, `npm run smoke`

#### Manual

- [ ] 4.4 Locally, a curl to the reply webhook (no `Origin`, POST and GET) with `Tak` moves that person to the top, and a second curl with `nie` moves them to the bottom
- [ ] 4.5 A curl after ending the crisis triggers the "akcja zakończona" fake send; an unknown number triggers nothing
- [ ] 4.6 A wrong secret returns 404
- [ ] 4.7 `/prywatnosc` reads correctly

### Phase 5: Production rollout

#### Automated

- [ ] 5.1 Read-only smoke against production passes
- [ ] 5.2 `npx supabase migration list --linked` shows no pending migrations

#### Manual

- [ ] 5.3 Every step of the production E2E passes and is recorded in `e2e-results.md`
- [ ] 5.4 The SMSAPI panel shows the delivered message and the received replies
