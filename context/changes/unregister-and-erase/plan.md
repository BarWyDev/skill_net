# Unregister and Erase Implementation Plan

## Overview

A resident can unregister at any time from a "Usuń konto" section on `/profil`. After re-entering their password, their auth account and every row of personal data are hard-deleted in one transaction, they are signed out, and they land on the home page with a confirmation. This delivers roadmap S-14 / FR-007 and the PRD guardrail "disappears from searches immediately, personal data fully removed within ≤ 30 days" — met on day 0, so no scheduled purge job is needed.

## Current State Analysis

- All personal data hangs off `auth.users` through `on delete cascade`: `profiles` (location, availability) → `profile_skills`, `profile_contacts` (phone), `crisis_matches`; plus `user_roles`. GoTrue's own `auth.identities` / `auth.sessions` / `auth.refresh_tokens` also cascade from `auth.users`. The email lives only in `auth.users`.
- Four audit records hold a bare user id with **no FK on purpose**, each commented "S-14 decides retention": `coordinator_role_events.user_id`, `contact_reveal_subjects.user_id`, `crises.activated_by` / `crises.ended_by`, `contact_reveal_events.revealed_by`.
- The app holds only the publishable key. Verified locally: role `postgres` has `DELETE` on `auth.users`, `authenticated` does not — so a `security definer` function owned by `postgres` can erase the caller without a service key.
- Verified locally: a password sign-in JWT carries `amr: [{"method":"password","timestamp":<epoch>}]`, and the timestamp is the sign-in time (it is not reset by refresh).
- No consent record exists yet (S-05 not built), so there is nothing consent-related to reconcile.
- `scripts/smoke.mjs` creates an account per run and never removes it.

## Desired End State

- `/profil` shows a "Usuń konto" section below the profile form: a short explanation, a password field and a submit button (plain HTML form POST, works without JS).
- Correct password → the account, profile, skills, phone, availability, roles and any crisis-match rows are gone; the session cookies are cleared; the browser lands on `/?konto-usuniete=1` showing "Twoje konto i dane zostały usunięte."; signing in with the old credentials fails; the same email can sign up again as a fresh account.
- Wrong password → back to `/profil?error=…` and nothing is deleted.
- An active crisis that had matched the resident no longer lists them (gap in `Osoba #N` numbering), and later reveals / team assembly exclude them.
- Audit rows keep the bare uuid, which no longer resolves to any person in the system.
- A stolen session cannot erase the account by calling the RPC directly through PostgREST: the database itself requires a password sign-in within the last 5 minutes.

### Key Discoveries:

- Cascade roots: `supabase/migrations/20260927120000_resident_profile_schema.sql:40` (`profiles.user_id → auth.users`), `20260928120000_coordinator_role.sql:16` (`user_roles`), `20261001120000_crisis_matching.sql:57` (`crisis_matches → profiles`), `20261003120000_resident_phone_and_availability.sql:26` (`profile_contacts → profiles`).
- Audit rows without FK: `20260928120000_coordinator_role.sql:24-33`, `20261001120000_crisis_matching.sql:37-48`, `20261002120000_crisis_deactivation.sql:17-19`, `20261004120000_break_glass_contact_reveal.sql:24-49`.
- RPC error pattern: `raise exception '<code>'` mapped to Polish copy in the service (`src/lib/services/profile.ts:13-25`).
- Endpoint pattern: form POST → redirect with `?error=` (`src/pages/api/profile.ts`, `src/pages/api/auth/signin.ts`).
- pgTAP convention: `begin; … select plan(N); … set local role authenticated; set_config('request.jwt.claims', …)`, rolled back (`supabase/tests/break_glass_contact_reveal_test.sql`).
- Types regenerate with `npm run db:types`.

## What We're NOT Doing

- No soft delete, grace period, restore, or `pg_cron` purge — hard delete now satisfies "≤ 30 days".
- No change to audit rows (no deletion, no tombstoning); they stay id-only.
- No "N osób wyrejestrowało się" note in the crisis view; the gap in numbering is accepted. `crises.match_count` is not recomputed.
- No special case for coordinators: they may unregister, and their role goes with the account (history stays in `coordinator_role_events`).
- No block during an active crisis — "at any time" holds.
- No support for passwordless / OTP accounts (none exist today; S-05 must revisit the re-auth guard if it adds them).
- No unit test for the endpoint; coverage is pgTAP + smoke.
- No pause-availability (S-13) or consent record (S-05).

## Implementation Approach

The guarantee lives in the database, like every other privacy rule in this repo: one `security definer` function erases the caller, and it refuses unless the caller's JWT shows a password sign-in from the last 5 minutes. The Worker endpoint re-runs `signInWithPassword` with the user's email and the typed password (which refreshes the session and its `amr` timestamp), then calls the function, then clears the local session. The password is never passed to the database.

## Critical Implementation Details

- **Re-auth must be enforced in SQL, not only in the endpoint.** A check only in the Worker is bypassable by calling `rpc('unregister_me')` directly with a session token. Read `auth.jwt() -> 'amr'` and require an element with `method = 'password'` and `timestamp >= extract(epoch from now()) - 300`.
- **Sign out locally after erasure.** Once `auth.users` is gone, a global `signOut()` would call GoTrue's logout for a session that no longer exists. Use `signOut({ scope: "local" })` so only the cookies are cleared, with no network call.
- **Order in the endpoint:** `signInWithPassword` → `rpc('unregister_me')` → `signOut({ scope: "local" })` → redirect. The re-sign-in replaces the in-memory session on the same SSR client, so the RPC carries the fresh `amr`.
- **Never log the email or password** in the endpoint or service (CLAUDE.md personal-data rule).

## Phase 1: Erasure function and database tests

### Overview

Add the `unregister_me()` function with its re-auth guard and privilege boundary, record the audit retention decision on the affected columns, and prove the guarantee with a pgTAP suite.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/20261004150000_unregister_and_erase.sql`

**Intent**: Give a signed-in resident a single, atomic way to erase their own account and every cascade of personal data, guarded by a recent password sign-in, and document that audit ids are kept.

**Contract**:
- `public.unregister_me() returns void`, `language plpgsql`, `security definer`, `set search_path = ''`, owned by `postgres`.
- Raises `not_authenticated` when `auth.uid()` is null; raises `reauthentication_required` when the JWT `amr` has no `password` entry with a timestamp in the last 300 s; otherwise `delete from auth.users where id = auth.uid()`.
- `revoke execute … from public, anon; grant execute … to authenticated`.
- `comment on column` for `coordinator_role_events.user_id`, `contact_reveal_subjects.user_id`, `crises.activated_by`, `crises.ended_by`, `contact_reveal_events.revealed_by`: kept as a bare id after account erasure (S-14); the id resolves to nothing once `auth.users` is gone.

#### 2. pgTAP suite

**File**: `supabase/tests/unregister_and_erase_test.sql`

**Intent**: Prove the erasure guarantee and its boundaries where they live.

**Contract**: Fixtures for resident R (profile, skills, phone, availability, matched in an active crisis, subject of a reveal), coordinator K (role, activated the crisis, did the reveal), and an untouched resident O. Assert:
- anon cannot execute `unregister_me`;
- authenticated with no `amr` / a non-password `amr` / a password `amr` older than 300 s → `reauthentication_required`, and nothing is deleted;
- R with a fresh password `amr` → R's `auth.users`, `auth.identities`, `profiles`, `profile_skills`, `profile_contacts`, `crisis_matches` rows are gone; `get_crisis_matches` for the active crisis (as K) no longer returns R; R's `contact_reveal_subjects` row remains;
- O's rows are untouched;
- K with a fresh password `amr` → K's `user_roles` row is gone; `coordinator_role_events`, `crises.activated_by` and `contact_reveal_events.revealed_by` still hold K's id.

#### 3. Generated types

**File**: `src/db/database.types.ts`

**Intent**: Expose `unregister_me` to the typed client.

**Contract**: Regenerated with `npm run db:types`; no hand edits.

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly: `npx supabase db reset`
- pgTAP suites pass, including the new one: `npm run test:db`
- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`

#### Manual Verification:

- In Studio, `unregister_me` is owned by `postgres`, is `security definer`, and `anon` has no execute grant

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Endpoint, UI and smoke coverage

### Overview

Wire the function into a form-POST endpoint, add the "Usuń konto" section on `/profil` and the confirmation notice on the home page, and extend the smoke test to unregister the account it created.

### Changes Required:

#### 1. Account service

**File**: `src/lib/services/account.ts`

**Intent**: Encapsulate the re-auth + erase sequence and map database errors to Polish copy, following the `profile.ts` service style.

**Contract**: `unregisterMe(supabase: SupabaseClient, email: string, password: string): Promise<{ ok: true } | { ok: false; message: string }>`. Wrong password → "Nieprawidłowe hasło."; `reauthentication_required` → "Potwierdź hasło ponownie."; anything else → "Nie udało się usunąć konta. Spróbuj ponownie." On success it has already called `signOut({ scope: "local" })`. No `console.*` of inputs.

#### 2. Endpoint

**File**: `src/pages/api/auth/unregister.ts`

**Intent**: Handle the form POST from `/profil`.

**Contract**: `POST` only. No `locals.user` → redirect `/auth/signin`. Missing Supabase → `/profil?error=…`. Empty password or user without email → `/profil?error=…`. Failure → `/profil?error=<message>`. Success → `/?konto-usuniete=1`.

#### 3. "Usuń konto" section on `/profil`

**File**: `src/pages/profil.astro` (optionally a small `src/components/profile/DeleteAccount.astro`)

**Intent**: Let the resident find and trigger erasure where they manage their data, without JS.

**Contract**: A visually separated danger section below the profile form, rendered whenever a user is signed in (also when the profile failed to load). Polish copy states that the account, profile, skills, phone and availability are deleted immediately and irreversibly, and that audit logs keep only an anonymous identifier. A `<form method="post" action="/api/auth/unregister">` with a `password` input (`autocomplete="current-password"`, required) and a destructive-styled submit "Usuń konto na zawsze". Errors reuse the existing `?error=` alert at the top of the page.

#### 4. Home-page notice

**File**: `src/pages/index.astro`

**Intent**: Confirm to the resident that erasure happened.

**Contract**: When `konto-usuniete` is in the query string, show a `role="status"` message "Twoje konto i dane zostały usunięte." above `<Welcome />`, styled like the `/profil` "Zapisano." notice.

#### 5. Smoke steps

**File**: `scripts/smoke.mjs`

**Intent**: Cover the HTTP flow and stop smoke runs from accumulating test accounts.

**Contract**: Append to `writeSteps` (after the final signout): sign in again (`/`, exact); unregister with a wrong password → `302 /profil?error=`; unregister with the right password → `302 /?konto-usuniete=1` exact; `/profil` → `302 /auth/signin`; sign in with the old credentials → `302 /auth/signin?error=`. Nothing added to `readonlySteps`.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`
- Build succeeds: `npm run build`
- Unit tests still pass: `npm run test:unit`
- Smoke passes against the local dev server: `npm run smoke`

#### Manual Verification:

- On `/profil`, the "Usuń konto" section is clearly separated from the profile form and readable on a phone-width screen
- Wrong password shows the error at the top of `/profil` and the profile is intact
- Correct password lands on the home page with the notice, and `/profil` then redirects to sign-in
- A coordinator matched in an active crisis: after a resident in that crisis unregisters, the crisis view no longer shows them and loads without error
- The same email can sign up again and gets an empty profile

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- None added; the logic is the SQL function (pgTAP) and a thin endpoint (smoke).

### Integration Tests:

- pgTAP `unregister_and_erase_test.sql`: privilege boundary, re-auth window (missing, wrong method, stale, fresh), full cascade, audit rows retained, active-crisis list drops the resident, other users untouched, coordinator erasure.
- Smoke: wrong password refused, erasure redirect, session gone, old credentials rejected.

### Manual Testing Steps:

1. Sign in as a resident with a complete profile and phone; open `/profil`; submit "Usuń konto" with a wrong password → error, profile intact.
2. Submit with the right password → home page notice; `/profil` redirects to sign-in; sign-in with old credentials fails.
3. As a coordinator, activate a crisis that matches a test resident; unregister that resident in another browser; reload the crisis view → resident gone, no error.
4. Sign up again with the erased email → fresh, empty profile.

## Performance Considerations

None: one delete per request, cascades over indexed foreign keys (`crisis_matches_user_id_idx` exists).

## Migration Notes

Additive only (a new function and column comments). Rollback of the Worker does not undo the migration, but the function is harmless when unused. Erased accounts cannot be restored; Supabase backups follow the platform's retention window.

## References

- Roadmap: `context/foundation/roadmap.md` (S-14)
- PRD: `context/foundation/prd.md` (FR-007, guardrails)
- Audit-row precedent: `context/archive/2026-10-04-break-glass-contact-reveal/`
- Endpoint pattern: `src/pages/api/profile.ts`, `src/pages/api/auth/signin.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Erasure function and database tests

#### Automated

- [x] 1.1 Migration applies cleanly: `npx supabase db reset`
- [x] 1.2 pgTAP suites pass, including the new one: `npm run test:db`
- [x] 1.3 Type checking passes: `npx astro check`
- [x] 1.4 Linting passes: `npm run lint`

#### Manual

- [x] 1.5 In Studio, `unregister_me` is owned by `postgres`, is `security definer`, and `anon` has no execute grant

### Phase 2: Endpoint, UI and smoke coverage

#### Automated

- [ ] 2.1 Type checking passes: `npx astro check`
- [ ] 2.2 Linting passes: `npm run lint`
- [ ] 2.3 Build succeeds: `npm run build`
- [ ] 2.4 Unit tests still pass: `npm run test:unit`
- [ ] 2.5 Smoke passes against the local dev server: `npm run smoke`

#### Manual

- [ ] 2.6 On `/profil`, the "Usuń konto" section is clearly separated from the profile form and readable on a phone-width screen
- [ ] 2.7 Wrong password shows the error at the top of `/profil` and the profile is intact
- [ ] 2.8 Correct password lands on the home page with the notice, and `/profil` then redirects to sign-in
- [ ] 2.9 A coordinator matched in an active crisis: after a resident in that crisis unregisters, the crisis view no longer shows them and loads without error
- [ ] 2.10 The same email can sign up again and gets an empty profile
