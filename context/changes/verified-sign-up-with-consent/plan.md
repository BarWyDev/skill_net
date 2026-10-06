# Verified Sign-up with Consent Implementation Plan

## Overview

Roadmap S-05 (FR-001). A resident signs up in Polish, ticks an explicit, versioned consent to data processing, and verifies their email before they can sign in. The consent is written to an append-only Supabase audit table in the same transaction that creates the account. Accounts created before this change are gated to a consent page on their next visit. Residents who never consented are excluded from crisis matching and the density map. The last phase is the human production rollout: own domain, custom SMTP, Polish confirmation template.

## Current State Analysis

- `src/pages/api/auth/signup.ts` calls `supabase.auth.signUp({ email, password })` with no consent and redirects to `/auth/confirm-email`. `SignUpForm.tsx`, `SignInForm.tsx`, `signup.astro`, `signin.astro` and `confirm-email.astro` are in English, while the rest of the app (and `<html lang="pl">`) is Polish.
- Production already has **Confirm email ON** (`mailer_autoconfirm: false`, verified 2026-09-25, `context/changes/deployment/deployment-plan.md:117`), but:
  - there is no route that receives the confirmation link, so it lands on the site root;
  - the built-in SMTP sends about 2 emails/hour to team addresses only; custom SMTP needs a verified own domain (`workers.dev` can't be one);
  - an unconfirmed user who lost or let the link expire has no way to get a new one, and re-signing up with the same email fails.
- Local Supabase runs with `enable_confirmations = false` (`supabase/config.toml:209`). `scripts/smoke.mjs` depends on that: it signs up and signs in immediately.
- Audit pattern: `coordinator_role_events` and `contact_reveal_events` are append-only tables holding a bare user id, no email, no FK to `auth.users`; S-14 keeps those ids after erasure (`supabase/migrations/20261004150000_unregister_and_erase.sql`).
- `profile_is_matchable(p_user_id)` (`supabase/migrations/20261006120000_pause_availability.sql:68`) is the single eligibility contract used by `activate_crisis` and `get_skills_density`. Live crisis lists read the activation snapshot, so they inherit whatever this function decides at activation.
- pgTAP suites insert residents straight into `auth.users (id, email)` with no metadata. Nine suites depend on matchability: `break_glass_contact_reveal`, `crisis_deactivation`, `crisis_ranking`, `pause_availability`, `public_skills_density`, `crisis_team_templates`, `resident_contact_availability`, `unregister_and_erase`, `resident_profile`.
- Middleware (`src/middleware.ts`) resolves the user and the coordinator flag on every request; coordinator lookup fails closed.
- `src/pages/api/auth/unregister.ts` redirects every error to `/profil?error=`.

## Desired End State

- `/auth/signup` is Polish, has an unticked consent checkbox linking to `/prywatnosc`, and the account can't be created without it, neither through the form nor by calling GoTrue's `/signup` directly with the publishable key.
- Every account created through email sign-up has a `consent_events` row (`source = 'signup'`, the consent version, timestamp) written atomically with the `auth.users` row.
- The confirmation email (Polish) links to `/auth/confirm?token_hash=…&type=email`, which verifies the address, signs the resident in, and lands them on `/profil`. Expired or invalid links land on a Polish error page with a resend form. Signing in with an unconfirmed address offers a resend.
- A signed-in user whose latest consent is not the current version is redirected to `/zgoda` (accept, sign out, or delete the account) from every non-exempt route.
- Residents with no consent row at all are absent from new crisis activations and the density map.
- On production: custom SMTP on an own domain delivers the Polish confirmation email to a non-team address, and the link lands on the production site.

Verify with: `npm run test:db`, `npm run test:unit`, `npm run smoke` locally, `SMOKE_READONLY=1` smoke on production, and the manual checks per phase.

### Key Discoveries:

- `profile_is_matchable` is security invoker and is called from security-definer functions (`activate_crisis`, `get_skills_density`) and from `get_my_profile` (caller's own row), so an owner-only select policy on `consent_events` is enough for every caller (`supabase/migrations/20261006120000_pause_availability.sql:68`).
- GoTrue sets `raw_app_meta_data ->> 'provider' = 'email'` on email sign-up; direct fixture inserts leave `raw_app_meta_data` null. That is the exemption rule for the trigger.
- PKCE `?code=` links only work in the browser that holds the code verifier cookie; a `token_hash` link + `supabase.auth.verifyOtp({ type: 'email', token_hash })` works cross-device (sign up on a laptop, click on a phone).
- `supabase.auth.signInWithPassword` returns `error.code === 'email_not_confirmed'` for unconfirmed accounts.
- Supabase limits resends by `max_frequency` and its rate limits; `resend({ type: 'signup', email })` returns no error for unknown addresses only in some configurations, so the endpoint must respond identically regardless of outcome.
- `CLAUDE.md`: the smoke test asserts exact auth redirect targets; update it with every redirect change. No personal data in `console.*`.

## What We're NOT Doing

- SMS verification at sign-up (FR-001's "SMS" half). The phone stays optional on `/profil` (S-06) and is verified, if ever, with S-07.
- Consent withdrawal without deleting the account (GDPR Art. 7(3) partial). Withdrawal = unregister (S-14) for now.
- Backfilling consent for existing accounts. They go through the gate.
- Excluding residents who accepted an older consent version from matching. A version bump only triggers the UI gate, never empties a live crisis list.
- Final legal wording. The plan drafts the consent and privacy text; legal review is the owner's task before a real pilot.
- Moving the Worker to a custom domain (deployment Phase 8). Only the email sending domain is required here; the Worker may stay on `workers.dev`.
- A service-role key in the Worker.
- Polish translation beyond the auth pages (sign-up, sign-in, confirm, resend, consent, privacy).

## Implementation Approach

Database first, so the invariants live where the app can't weaken them: an append-only `consent_events` table, a whitelist of published versions in `consent_versions`, and an `after insert` trigger on `auth.users` that reads `consent_version` from the sign-up metadata. Email-provider accounts without a valid version are rejected, including those created by admin (Studio "Add user", `auth.admin.createUser`), which must pass `consent_version` in user metadata; only rows inserted straight into `auth.users` without app metadata (test fixtures) are exempt. The app then sends the version from one constant, gates older accounts in middleware, and handles the confirmation link with `verifyOtp`. Production configuration (template, SMTP, domain) is a human phase at the end because it has DNS lead time and touches dashboards the agent can't change.

## Critical Implementation Details

- **Deploy order.** Merge first, then `npx supabase db push` immediately (lessons.md). The old code never sends `consent_version`, so pushing the migration before merging would make production sign-up fail. The new code before the push is harmless: metadata is ignored, and the middleware consent lookup must **fail open** (treat an RPC error as "no gate") so a missing RPC can't redirect every user to a `/zgoda` page whose accept also fails. Matching in the database still enforces consent, so failing open in the UI costs nothing.
- **Version source of truth.** The current version exists twice: as a row in `consent_versions` (seeded by migration) and as the app constant. The trigger accepts any published version; the gate compares the user's latest version with the app constant. Bumping the wording = new migration inserting the version row, merged and pushed **before** the constant changes, otherwise sign-ups fail.
- **Trigger safety.** The trigger runs inside GoTrue's insert as `supabase_auth_admin`. It must be `security definer` owned by `postgres` with `set search_path = ''`, insert only into `public.consent_events`, and raise a named error (`consent_required`). A bug here breaks all sign-ups, so it gets its own pgTAP cases, including GoTrue-shaped inserts.

## Phase 1: Consent data model

### Overview

Tables, trigger, RPCs and the matchability clause, fully tested in pgTAP, with types regenerated.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/20261007120000_signup_consent.sql`

**Intent**: Store consent as an append-only audit trail that outlives the account as a bare id, and make "no consent, no email sign-up" a database rule.

**Contract**:
- `public.consent_versions (version text primary key, published_at timestamptz not null default now())`, seeded with the initial version (e.g. `'2026-10-07'`). RLS on; `select` for `anon` and `authenticated`; no write policies.
- `public.consent_events (id bigint identity pk, user_id uuid not null, version text not null references consent_versions, source text not null check (source in ('signup','reaccept')), occurred_at timestamptz not null default now())`, index on `(user_id, occurred_at desc)`. No FK to `auth.users` (kept after erasure). RLS on; `select` policy for `authenticated` on own rows only; no insert/update/delete policies. Column comment matching the S-14 retention wording.
- `public.record_signup_consent()` trigger function, `after insert on auth.users for each row`: if `new.raw_app_meta_data ->> 'provider' = 'email'`, require `new.raw_user_meta_data ->> 'consent_version'` to exist in `consent_versions` (else `raise exception 'consent_required'`) and insert a `source = 'signup'` row. Otherwise do nothing.
- `public.record_my_consent(p_version text) returns void`, security definer: `not_authenticated` without a user, `unknown_consent_version` for an unpublished version, otherwise inserts a `reaccept` row for `auth.uid()`.
- `public.my_latest_consent_version() returns text`, security invoker: the caller's most recent version, or null.
- `create or replace function public.profile_is_matchable` adds `and exists (select 1 from public.consent_events c where c.user_id = p.user_id)`, keeping the rest of the body as it is now.
- Revoke execute from `public, anon` on the RPCs; grant to `authenticated`. Revoke execute on the trigger function from everyone.

#### 2. pgTAP

**File**: `supabase/tests/signup_consent_test.sql` (new) and the nine existing suites listed above

**Intent**: Prove the trigger, RPCs, RLS and matchability rule; keep existing suites green by giving their residents consent.

**Contract**: The new suite covers: GoTrue-shaped insert (`provider = email`) with a valid version writes one `signup` row; without a version or with an unknown one raises `consent_required` and creates no user; a fixture insert with null app metadata is exempt; RLS hides other users' rows and blocks direct inserts/updates/deletes; `record_my_consent` writes `reaccept`, rejects unknown versions and anon; `my_latest_consent_version` returns the newest; a complete profile without consent is not matchable and is absent from `activate_crisis` and `get_skills_density`; consent rows survive `unregister_me`. Existing suites insert a `consent_events` row for each fixture resident that must match.

#### 3. Types

**File**: `src/db/database.types.ts`

**Intent**: Regenerate with `npm run db:types` so the new RPCs are typed.

### Success Criteria:

#### Automated Verification:

- Migration applies on a fresh local database: `npx supabase db reset`
- All pgTAP suites pass, including `signup_consent_test.sql`: `npm run test:db`
- Types regenerated and type check passes: `npm run db:types && npx astro check`
- Lint passes: `npm run lint`

#### Manual Verification:

- In Studio, `consent_events` shows RLS enabled with only the select policy, and the trigger is listed on `auth.users`

**Implementation Note**: After automated verification passes, pause for manual confirmation before the next phase.

---

## Phase 2: Polish sign-up with consent

### Overview

The resident sees a Polish sign-up form with an explicit consent checkbox and a privacy page; the endpoint enforces the checkbox and passes the version to GoTrue.

### Changes Required:

#### 1. Consent module

**File**: `src/lib/consent.ts`

**Intent**: Single source of the current consent version and the checkbox wording, imported by the form, the endpoint, the middleware and `/zgoda`.

**Contract**: exports `CURRENT_CONSENT_VERSION` (equal to the seeded row) and the consent label text. Must stay importable from `node:test` (relative imports only).

#### 2. Privacy page

**File**: `src/pages/prywatnosc.astro`

**Intent**: A public, Polish information notice (GDPR Art. 13): controller, which data (email, coarsened location, skills, optional phone, availability), purpose (crisis coordination and neighbour help), legal basis (consent), retention (immediate erasure on unregister; bare-id audit records kept), rights and how to exercise them. Shows the version. Drafted by the implementer, flagged for owner review.

**Contract**: `GET /prywatnosc`, public (not in `PROTECTED_ROUTES`), `Cache-Control: private` per lessons.md.

#### 3. Sign-up form and endpoint

**Files**: `src/components/auth/SignUpForm.tsx`, `src/pages/api/auth/signup.ts`, `src/pages/auth/signup.astro`

**Intent**: Add an unticked, required consent checkbox (client validation + server check) linking to `/prywatnosc`; translate all copy to Polish. The endpoint rejects a missing checkbox with a Polish `?error=` before calling GoTrue, and calls `signUp` with `options.data.consent_version = CURRENT_CONSENT_VERSION`.

**Contract**: form field `consent=on`; missing → `302 /auth/signup?error=…`; success → `302 /auth/confirm-email` (unchanged). The checkbox must not be pre-ticked.

#### 4. Polish auth copy and error mapping

**Files**: `src/components/auth/SignInForm.tsx`, `src/pages/auth/signin.astro`, `src/pages/auth/confirm-email.astro`, `src/lib/auth-errors.ts`, `src/lib/auth-errors.test.ts`

**Intent**: Translate sign-in and confirm-email pages; map Supabase auth error codes (`invalid_credentials`, `email_not_confirmed`, `user_already_exists`, `weak_password`, `over_email_send_rate_limit`, unknown → generic) to Polish messages, used by sign-in, sign-up and resend endpoints.

**Contract**: `authErrorMessage(code: string | undefined): string`. Unit-tested.

#### 5. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Sign-up step sends `consent: "on"`; new write step "signup rejects missing consent" → `302 /auth/signup?error=`; new read-only step "privacy page renders" → `200`, `private`.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test:unit`
- Lint and type check pass: `npm run lint && npx astro check`
- Build passes: `npm run build`
- Smoke passes locally against `npm run dev`: `npm run smoke`

#### Manual Verification:

- The sign-up page is fully Polish; the checkbox is unticked and submitting without it shows an inline error
- After sign-up, Studio shows a `consent_events` row with `source = signup` and the current version
- `/prywatnosc` reads correctly and the owner has reviewed the draft wording

**Implementation Note**: After automated verification passes, pause for manual confirmation before the next phase.

---

## Phase 3: Email verification flow

### Overview

The confirmation link verifies and signs the resident in; broken links and unconfirmed sign-ins lead to a resend instead of a dead end.

### Changes Required:

#### 1. Confirmation route

**File**: `src/pages/auth/confirm.ts`

**Intent**: Receive the email link, verify it server-side, set the session cookies, and send the resident to finish their profile.

**Contract**: `GET /auth/confirm?token_hash=…&type=email` → `verifyOtp({ type, token_hash })`; success → `302 /profil`; missing params or failure → `302 /auth/link-wygasl`. Accept only `type` in `{email, signup}`. Response `Cache-Control: private, no-store`.

#### 2. Confirmation email template

**Files**: `supabase/templates/confirmation.html`, `supabase/config.toml`

**Intent**: Polish confirmation email whose link is `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`. Wire it under `[auth.email.template.confirmation]` (subject in Polish) and set local `site_url` to `http://localhost:4321` with it in `additional_redirect_urls`. Keep `enable_confirmations = false` locally (smoke depends on it).

#### 3. Resend

**Files**: `src/pages/api/auth/resend.ts`, `src/pages/auth/link-wygasl.astro`, `src/components/auth/ResendForm.tsx` (or plain Astro form)

**Intent**: Let a resident request a new link from the error page or from sign-in, without revealing whether an address is registered.

**Contract**: `POST /api/auth/resend` with `email` → `supabase.auth.resend({ type: 'signup', email })`; always `302 /auth/confirm-email?ponownie=1`, except a malformed email → `302 /auth/link-wygasl?error=`. Rate-limit errors map to a Polish message only when they don't leak existence (same message for every address).

#### 4. Unconfirmed sign-in

**Files**: `src/pages/api/auth/signin.ts`, `src/components/auth/SignInForm.tsx`

**Intent**: When sign-in fails with `email_not_confirmed`, show the Polish message and a resend form prefilled with the address (the address stays in the form state, never in the URL).

**Contract**: `302 /auth/signin?error=…&niepotwierdzony=1`; the form shows the resend block when the flag is present. Smoke's `?error=` prefix assertions keep passing.

#### 5. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Read-only steps: "confirm without token redirects to link error" → `302 /auth/link-wygasl`; "confirm with bogus token redirects to link error" → same; "resend answers neutrally" → `302 /auth/confirm-email?ponownie=1` for an unregistered `@example.com` address.

### Success Criteria:

#### Automated Verification:

- Lint, type check, build: `npm run lint && npx astro check && npm run build`
- Smoke passes locally: `npm run smoke`

#### Manual Verification:

- With local `enable_confirmations = true` temporarily: sign up, open the email in Mailpit (http://localhost:54324), the Polish email arrives, the link signs you in and lands on `/profil`; revert the flag
- A reused or edited link lands on `/auth/link-wygasl`, and resend delivers a new email
- Sign-in with an unconfirmed address shows the Polish message and a working resend

**Implementation Note**: After automated verification passes, pause for manual confirmation before the next phase.

---

## Phase 4: Consent gate for older accounts

### Overview

Signed-in users without a consent for the current version are sent to `/zgoda` until they accept, sign out, or delete their account.

### Changes Required:

#### 1. Service and middleware

**Files**: `src/lib/services/consent.ts`, `src/middleware.ts`, `src/env.d.ts`

**Intent**: Look up the caller's latest consent version alongside the coordinator check (in parallel) and redirect when it isn't current.

**Contract**: `latestConsentVersion(supabase): Promise<string | null>` throws on RPC error. Middleware sets `locals.needsConsent`; on lookup error it is `false` (fail open, see Critical Implementation Details). A signed-in user with `needsConsent` requesting any path outside the exempt list gets `302 /zgoda`. Exempt: `/zgoda`, `/api/zgoda`, `/prywatnosc`, `/auth/`, `/api/auth/`, static assets. Anonymous requests are never gated.

#### 2. Consent page and endpoint

**Files**: `src/pages/zgoda.astro`, `src/pages/api/zgoda.ts`

**Intent**: Polish page explaining that consent is needed to continue, with the same checkbox + link as sign-up, a sign-out button, and the unregister form (password) for residents who refuse.

**Contract**: `POST /api/zgoda` with `consent=on` → `record_my_consent(CURRENT_CONSENT_VERSION)` → `302 /`; missing checkbox or RPC error → `302 /zgoda?error=`. Page sends `Cache-Control: private, no-store`.

#### 3. Unregister return path

**File**: `src/pages/api/auth/unregister.ts`

**Intent**: Errors redirect back to the page the form came from, so a refusing user on `/zgoda` sees the error instead of being bounced.

**Contract**: optional field `return_to`, allowlisted to `/profil` and `/zgoda` (anything else → `/profil`). Success target unchanged.

#### 4. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Read-only: "zgoda redirects anonymous user" → `302 /auth/signin`. Write steps: the fresh smoke account (consented at sign-up) reaches `/profil` without a gate. The gated path needs an account without consent, which the smoke can't create through the API, so pgTAP plus a manual check cover it.

### Success Criteria:

#### Automated Verification:

- Lint, type check, build: `npm run lint && npx astro check && npm run build`
- Unit tests pass: `npm run test:unit`
- Smoke passes locally: `npm run smoke`

#### Manual Verification:

- Delete your local account's `consent_events` rows in Studio: every page redirects to `/zgoda`; accepting lands on `/` and writes a `reaccept` row
- From `/zgoda`, a wrong password on unregister shows the error on `/zgoda`; the right one erases the account
- Signed-out visitors see `/`, `/mapa`, `/prywatnosc` with no redirect

**Implementation Note**: After automated verification passes, pause for manual confirmation before the next phase.

---

## Phase 5: Production rollout (human)

### Overview

Push the migration, configure the confirmation template and custom SMTP on an own domain, and prove the full flow on production.

### Changes Required:

#### 1. Database

**Intent**: Right after the PR merges: `npx supabase migration list --linked`, then `npx supabase db push`. Verify production sign-up and the gate. Push only when no crisis is active: from the push until each resident accepts on `/zgoda`, existing residents have no consent row and are absent from new activations and the density map. Count matchable residents (`select count(*) from public.profiles p where public.profile_is_matchable(p.user_id)` in the SQL editor) before and after the push, and note the drop in the deployment log.

#### 2. Supabase dashboard (human)

**Intent**: Auth → Email Templates → "Confirm signup": paste the Polish subject and body from `supabase/templates/confirmation.html`. Confirm Site URL is `https://skillnet.barwy.workers.dev` and the redirect allowlist includes it. After the push, creating a user in Studio or through the admin API fails with `consent_required` unless the user metadata carries `{"consent_version": "<current version>"}`.

#### 3. Domain and SMTP (human)

**Intent**: Register a domain, add it to the chosen provider (Resend or Postmark), publish SPF/DKIM (and DMARC) records, then Supabase → Auth → SMTP Settings with the provider's credentials and a sender like `no-reply@<domain>`. Raise the auth email rate limit from the built-in 2/hour. Record the domain and provider in `context/foundation/infrastructure.md` and close the SMTP open item in `context/changes/deployment/deployment-plan.md`.

### Success Criteria:

#### Automated Verification:

- `npx supabase migration list --linked` shows the new migration applied remotely
- Production read-only smoke passes: `SMOKE_READONLY=1 BASE_URL=https://skillnet.barwy.workers.dev npm run smoke`
- No errors in `npx wrangler tail skillnet --format json --status error` during the manual test

#### Manual Verification:

- Sign up on production with a non-team address: the Polish email arrives from the own domain, the link lands on production `/auth/confirm` and then `/profil`
- The new account has a `signup` consent row; existing team accounts are gated to `/zgoda` and can accept
- Roadmap S-05 marked done via `/10x-archive`

---

## Testing Strategy

### Unit Tests:

- `authErrorMessage`: every mapped code, unknown and undefined codes
- Consent module constant matches the format used by the seed (`YYYY-MM-DD`)

### Integration Tests:

- pgTAP `signup_consent_test.sql`: trigger accept/reject/exempt, RLS, RPCs, matchability and density exclusion, retention after erasure
- Smoke: consent required at sign-up, privacy page, confirm-link error paths, neutral resend, gate redirects anonymous to sign-in

### Manual Testing Steps:

1. Local sign-up with confirmations temporarily on, through Mailpit, cross-check the consent row
2. Expired/reused link → resend → new link works
3. Remove consent rows → gate → accept / refuse paths
4. Production: non-team address end to end after SMTP is live

## Performance Considerations

Middleware gains one RPC per signed-in request, run in parallel with `is_coordinator`, so latency stays at one round trip. That's two subrequests per request, well inside the Workers Free limit. `consent_events` is indexed on `(user_id, occurred_at desc)`; the `exists` in `profile_is_matchable` uses the same index.

## Migration Notes

Expand-only migration: new tables, a new trigger, new functions, and one `create or replace` of `profile_is_matchable`. Existing production accounts get no consent rows. They are gated in the UI and drop out of new crisis activations until they accept once. Rollback: `drop trigger` on `auth.users` restores old sign-up behaviour without touching data.

## References

- Roadmap item: `context/foundation/roadmap.md` (S-05)
- PRD: `context/foundation/prd.md` (FR-001, consent requirement)
- Deployment SMTP open item: `context/changes/deployment/deployment-plan.md:118`, `:263`
- Audit table pattern: `supabase/migrations/20260928120000_coordinator_role.sql:27`
- Matchability contract: `supabase/migrations/20261006120000_pause_availability.sql:68`
- Erasure retention: `supabase/migrations/20261004150000_unregister_and_erase.sql`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Consent data model

#### Automated

- [x] 1.1 Migration applies on a fresh local database — 2f0bf66
- [x] 1.2 All pgTAP suites pass, including signup_consent_test.sql — 2f0bf66
- [x] 1.3 Types regenerated and type check passes — 2f0bf66
- [x] 1.4 Lint passes — 2f0bf66

#### Manual

- [x] 1.5 Studio shows RLS with only the select policy and the trigger on auth.users — 2f0bf66

### Phase 2: Polish sign-up with consent

#### Automated

- [x] 2.1 Unit tests pass — 83cf585
- [x] 2.2 Lint and type check pass — 83cf585
- [x] 2.3 Build passes — 83cf585
- [x] 2.4 Smoke passes locally — 83cf585

#### Manual

- [x] 2.5 Sign-up page is Polish; unticked checkbox blocks submit — 83cf585
- [x] 2.6 Sign-up writes a signup consent row with the current version — 83cf585
- [x] 2.7 Privacy page reviewed by the owner — 83cf585

### Phase 3: Email verification flow

#### Automated

- [x] 3.1 Lint, type check, build — 54920fd
- [x] 3.2 Smoke passes locally — 54920fd

#### Manual

- [x] 3.3 Polish email via Mailpit; link signs in and lands on /profil — 54920fd
- [x] 3.4 Reused or edited link lands on /auth/link-wygasl; resend works — 54920fd
- [x] 3.5 Unconfirmed sign-in shows message and working resend — 54920fd

### Phase 4: Consent gate for older accounts

#### Automated

- [x] 4.1 Lint, type check, build — 2eae82a
- [x] 4.2 Unit tests pass — 2eae82a
- [x] 4.3 Smoke passes locally — 2eae82a

#### Manual

- [x] 4.4 Account without consent is gated; accepting writes a reaccept row — 2eae82a
- [x] 4.5 Unregister from /zgoda shows errors there and erases on success — 2eae82a
- [x] 4.6 Signed-out visitors are never gated — 2eae82a

### Phase 5: Production rollout (human)

#### Automated

- [ ] 5.1 Migration applied remotely
- [ ] 5.2 Production read-only smoke passes
- [ ] 5.3 No errors in wrangler tail during the manual test

#### Manual

- [ ] 5.4 Non-team address receives the Polish email from the own domain; link works end to end
- [ ] 5.5 New account has a signup consent row; existing accounts are gated and can accept
- [ ] 5.6 Roadmap S-05 marked done via /10x-archive
