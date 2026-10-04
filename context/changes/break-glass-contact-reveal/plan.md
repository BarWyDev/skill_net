# Break-glass Contact Reveal Implementation Plan

## Overview

Roadmap S-09 (FR-012). When nobody has confirmed (no network, night, or no SMS path yet), a coordinator can deliberately reveal the phone numbers of everyone matched to an active crisis. They must state a reason. The numbers exist only in the response to that one request. Every reveal is written to an append-only audit trail in Supabase that names the residents whose numbers were exposed and that outlives both the crisis and Workers' 7-day log retention.

## Current State Analysis

- Phone numbers live in `public.profile_contacts`, and only their owner can read or write them. No RPC returns another resident's number. `get_crisis_matches` exposes only `has_phone` (`supabase/migrations/20261003120000_resident_phone_and_availability.sql`). S-06 built this boundary for S-07, S-08 and S-09 to inherit.
- The ranking is a snapshot in `public.crisis_matches`, written at activation. Clients have no privileges on it and read it only through `get_crisis_matches`, which is capped at 200 rows (`MATCHES_PAGE_SIZE` in `src/lib/services/crisis.ts`). Rows are pseudonymous (`Osoba #N`). Residents have no name in the product, so the phone is the only contact detail.
- `end_crisis` locks the crisis row `FOR UPDATE`, flips its status and deletes the snapshot in one transaction (`supabase/migrations/20261002120000_crisis_deactivation.sql`). After a crisis, no record links a resident to the incident. The S-04 plan deferred "a full audit trail" to S-09.
- The audit precedent is `public.coordinator_role_events` (`supabase/migrations/20260928120000_coordinator_role.sql`): an identity PK, no FK to `auth.users` (it outlives the account), no RLS policies, and every privilege revoked from `anon` and `authenticated`.
- The middleware gates `/koordynator` and `/api/koordynator` to coordinators and sets `Cache-Control: private, no-store` (`src/middleware.ts`). Any sub-route inherits both.
- The crisis page `src/pages/koordynator/kryzys/[id].astro` renders the masked list. Its copy says numbers are never shown.
- No phone is verified yet: `phone_verified_at` is set only by S-07, which is blocked.
- Tests: pgTAP suites in `supabase/tests/*.sql` (`npm run test:db`), and HTTP gate checks in `scripts/smoke.mjs`.

## Desired End State

- On an active crisis page, a coordinator sees a "Ujawnij kontakty (break-glass)" entry. It opens `/koordynator/kryzys/<id>/kontakty`, a page that explains what will happen, shows no numbers and asks for a reason of at least 10 characters.
- Submitting the form (POST to the same URL) writes one audit event plus one subject row per exposed resident. In the same response it renders a contact list: every matched resident with a phone number, in position order, with no 200-row cap. Each row shows the current number as a `tel:` link, plus rank, `Osoba #N`, distance, skills and the availability badge. A banner says that numbers are unverified, and the page says how many matched people have no phone.
- A reload of the GET page, another coordinator, or the crisis page never shows numbers. Seeing them again means a new reveal and a new audit row.
- An ended or unknown crisis cannot be revealed. A non-coordinator is refused by the middleware and again by the RPC.
- The audit rows survive `end_crisis` and the deletion of the resident or coordinator account. No client role can read or write them.

Verify with `npm run test:db`, `npm run smoke`, and the manual steps in the Testing Strategy.

### Key Discoveries:

- `end_crisis` serialises on `SELECT … FOR UPDATE` of the crisis row (`20261002120000_crisis_deactivation.sql`). A reveal that takes `FOR SHARE` on the same row either completes before the end, or sees `status = 'ended'` afterwards. It never reads a half-deleted snapshot.
- `is_coordinator()` is security invoker and reads the caller's `auth.uid()` even inside a security-definer function (`20260928120000_coordinator_role.sql`). Reuse it as the in-database gate.
- Supabase grants `execute` on new functions to `anon` and `authenticated` by default. Every migration in this repo revokes it explicitly. Follow that pattern.
- The generated types mark RPC arguments and outputs non-null even when SQL returns null. `getCrisisMatches` parses nullable columns with zod (`src/lib/services/crisis.ts`), so do the same here.
- Lesson "Public cache headers on routes that pass through the auth middleware": the new page is under `/koordynator`, so it gets `private, no-store` from the middleware. Never override it.

## What We're NOT Doing

- No persistent "revealed" state, per crisis or per coordinator. Numbers appear only in the POST response that wrote the audit row.
- No export: no CSV, no copy-all button, no print styling.
- No resident-facing view of reveals on `/profil`. The subject rows make the question "was my number revealed?" answerable by an operator query. A resident-facing view is parked for S-12 or later.
- No filtering to verified numbers. All stored numbers are shown and marked unverified.
- No gating on the lack of confirmations. S-07 does not exist, so the reveal is available on any active crisis.
- No partial reveal (top N, or selected rows).
- No retention or erasure policy for the audit rows. S-14 decides it, as it does for `coordinator_role_events`.
- No email or other contact channel. Only the phone, consistent with "no phone = no operational-list presence".
- No operator UI for reading the audit trail. The operator uses SQL (Studio or the SQL editor).
- No change to `end_crisis`, `get_crisis_matches` or the ranking.

## Implementation Approach

The privacy guarantees live in the database, as in S-03, S-04 and S-06. A single security-definer RPC checks the role, the crisis status and the reason, writes the audit rows and returns the contacts, all in one transaction, so no path returns numbers without a log entry. The app layer adds a thin service wrapper and one Astro page that handles GET (the reason form) and POST (the reveal), rendering the numbers in the POST response with no redirect. Phase 1 (the migration) goes to production with `npx supabase db push` before Phase 2 merges, as in previous slices, so the page never ships ahead of its RPC.

## Critical Implementation Details

- **State sequencing**: inside `reveal_crisis_contacts`, take `FOR SHARE` on the crisis row and check `status = 'active'` *before* reading `crisis_matches`. Write the event row and the subject rows from the same set of rows the function returns, so the log never disagrees with what was shown. A reveal that finds zero numbers is still logged, with `revealed_count = 0`.
- **User experience spec**: the POST response is the only place numbers ever appear. Do not redirect after the POST (the numbers would be lost), and do not store them in a cookie, a query string or session storage. A browser "resend form" is a new reveal with a new audit row; that is the intended per-view semantics. Never `console.*` the reason or any phone number.

## Phase 1: Database — audit trail and reveal RPC

### Overview

Add the two audit tables and `reveal_crisis_contacts`, cover them with a pgTAP suite, and regenerate the types.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/20261004120000_break_glass_contact_reveal.sql`

**Intent**: Create the append-only audit trail and the only path by which a coordinator can read other residents' numbers. Open with a header comment in the style of the previous crisis migrations, listing the guarantees: coordinator only, active crisis only, a reason is required, every returned number is logged in the same transaction, clients cannot read or write the log, and the log deliberately survives crisis end and account deletion (an explicit, documented exception to the S-04 rule that no record links a resident to an incident after it ends, because it is a log of access to personal data).

**Contract**:

- `public.contact_reveal_events`:
  - `id bigint generated always as identity primary key`
  - `crisis_id uuid not null references public.crises (id)`. Crises are never deleted, so this needs no cascade.
  - `revealed_by uuid not null`. No FK, as with `activated_by`.
  - `reason text not null`, with a check that `char_length(btrim(reason)) between 10 and 500`.
  - `revealed_count integer not null default 0`
  - `occurred_at timestamptz not null default now()`
  - An index on `crisis_id`.
- `public.contact_reveal_subjects`:
  - `event_id bigint not null references public.contact_reveal_events (id)`
  - `user_id uuid not null`. No FK, so the row outlives the resident's deletion.
  - `primary key (event_id, user_id)`
  - An index on `user_id`, for "who saw my number" queries and later S-14 erasure.
- `public.reveal_crisis_contacts(p_crisis_id uuid, p_reason text)` is `security definer`, `set search_path = ''`, owned by `postgres`. It returns a table of `rank integer`, `"position" integer`, `distance_km_rounded numeric`, `matched_skills jsonb`, `phone text`, `phone_verified boolean`, `availability_slots integer`, `available_now boolean`. The column semantics match `get_crisis_matches`, plus the current `profile_contacts.phone` and `phone_verified_at is not null`.
  - It raises `not_coordinator`, `unknown_crisis`, `crisis_not_active` and `reason_required`, in that order. `reason_required` covers a null reason or a trimmed reason shorter than 10 characters. A reason over 500 characters raises `reason_too_long`.
  - It includes only snapshot rows that have a `profile_contacts` row (an inner join), in `position` order, with no limit.
  - It stores the reason trimmed.
- RLS is enabled on both tables, with no policies. `revoke all` on both tables from `anon, authenticated`. Revoke `execute` on the function from `public, anon`, and grant it to `authenticated`.

#### 2. pgTAP suite

**File**: `supabase/tests/break_glass_contact_reveal_test.sql`

**Intent**: Prove the guarantees, following the structure of `crisis_deactivation_test.sql`: isolated fixtures, `set local role` / `request.jwt.claims` to switch callers, rolled back at the end.

**Contract**: the named cases are:

- An anon caller cannot execute the RPC. A resident gets `not_coordinator`.
- An unknown crisis gets `unknown_crisis`. An ended crisis gets `crisis_not_active`, and no event row is written.
- The reasons `null`, `'   '` and `'krótko'` each get `reason_required`, and no event row is written. A reason of 501 characters gets `reason_too_long`.
- **Scope beyond the page cap**: a crisis with more than 200 matched residents who have phones returns all of them, in `position` order. The fixture can generate about 205 residents with `generate_series`.
- Matched residents without a phone are absent from the result. A resident who changed their number after activation is returned with the *current* number.
- One call writes one event row (`revealed_by` = caller, trimmed reason, `revealed_count` = rows returned) and exactly one subject row per returned resident. Two calls write two events.
- A crisis whose matched residents have no phones still writes an event with `revealed_count = 0`.
- After `end_crisis`, the event and subject rows still exist. Deleting a revealed resident's auth user succeeds, and their subject row remains.
- As `authenticated` (a coordinator included), `select`, `insert`, `update` and `delete` on both tables fail with permission denied.
- No other RPC changed: `get_crisis_matches` still returns no phone column. This is a column-name check on `proargnames`.

#### 3. Generated types

**File**: `src/db/database.types.ts`

**Intent**: Regenerate with `npm run db:types` after `npx supabase db reset`, so Phase 2 compiles against `reveal_crisis_contacts`. Make no manual edits.

### Success Criteria:

#### Automated Verification:

- Migration and seed apply cleanly: `npx supabase db reset`
- DB tests pass, new suite and existing suites: `npm run test:db`
- Types regenerated with no manual edits: `npm run db:types`
- Type check passes: `npx astro check`
- Lint passes: `npm run lint`

#### Manual Verification:

- In Studio, as a coordinator JWT via the SQL editor or the REST RPC, a reveal on a seeded crisis returns numbers, and both audit tables show the expected rows.
- The migration is pushed to production (`npx supabase db push`) before the Phase 2 PR merges.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: App — reveal page and entry point

### Overview

Add the DTO, the service call, the `kontakty` page (GET form, POST reveal), the entry link on the crisis page and the smoke gate checks.

### Changes Required:

#### 1. Types

**File**: `src/types.ts`

**Intent**: Add the DTO for one revealed row.

**Contract**: `CrisisContactDTO` has the `CrisisMatchDTO` fields except `hasPhone`, plus `phone: string` (normalised `+48XXXXXXXXX`) and `phoneVerified: boolean`. Its doc comment states that it exists only in the response to a logged reveal.

#### 2. Service

**File**: `src/lib/services/crisis.ts`

**Intent**: Wrap the RPC in the existing style: map DB error messages to Polish, and reuse the skill-name lookup and the zod parsing of nullable columns that `getCrisisMatches` uses. Never log the reason or the numbers.

**Contract**: `revealCrisisContacts(supabase, id, reason): Promise<{ ok: true; contacts: CrisisContactDTO[] } | { ok: false; message: string; field?: "reason" }>`. The messages are:

- `not_coordinator`: "Tylko koordynator może ujawnić kontakty."
- `unknown_crisis`: "Nie znaleziono kryzysu."
- `crisis_not_active`: "Ten kryzys został już zakończony — kontaktów nie można ujawnić."
- `reason_required`: "Podaj powód (co najmniej 10 znaków)." with `field: "reason"`
- `reason_too_long`: "Powód może mieć najwyżej 500 znaków." with `field: "reason"`
- Anything else gets a generic message.

`src/lib/phone.ts` has only `normalisePhone`, so add an exported `formatPhone` there that displays `+48600123456` as `+48 600 123 456`.

#### 3. Reveal page

**File**: `src/pages/koordynator/kryzys/[id]/kontakty.astro`

**Intent**: One page for both steps.

- **GET** loads the crisis with `getCrisis`. An unknown crisis gets 404 with the same copy as the crisis page. An ended crisis shows a short note and a link back. An active crisis renders the break-glass warning and a POST form:
  - The warning says that every matched number will be shown, that the act is recorded with your account and reason, and that the numbers disappear on leaving the page.
  - The form has a required `reason` textarea with `minlength=10 maxlength=500`, and a red "Ujawnij kontakty" submit button.
- **POST** reads `reason` from the form data, then validates it with zod: a trimmed string of 10–500 characters, with the same Polish messages. An invalid reason re-renders the form with the error and the entered text (status 422), and the RPC is not called. A valid reason calls `revealCrisisContacts`:
  - On failure, re-render the form (or the ended note, for `crisis_not_active`) with the message.
  - On success, render the contact list.

**Contract**:

- No redirect after the POST. The numbers are never placed in a URL, a cookie or client storage.
- The contact list view has:
  - a red break-glass header with the crisis type, the radius and "ujawniono {time}" (`formatActivatedAt`)
  - a banner, shown while any `phoneVerified` is false: "Numery nie są zweryfikowane — mogą być błędne."
  - an `<ol>` of rows: rank, `Osoba #N`, distance, skill chips, the availability badge (reuse the crisis page's badge logic, extracted to a shared helper if needed), and the phone as `<a href="tel:+48…">`, large enough to tap on a phone
  - a footer with the count of matched residents without a phone (`crisis.matchCount - contacts.length`) and a link back to the crisis page
- No export controls.
- The page sets no `Cache-Control` of its own. The middleware's `private, no-store` applies.
- An invalid UUID is treated as unknown (`UUID_RE`, as on the crisis page).

#### 4. Crisis page entry point

**File**: `src/pages/koordynator/kryzys/[id].astro`

**Intent**: Make the reveal discoverable and update the copy that now overstates the guarantee.

**Contract**:

- For an active crisis, add a link styled as a secondary danger action, "Ujawnij kontakty (break-glass)", pointing to `/koordynator/kryzys/<id>/kontakty`, near the "Zakończ kryzys" button or below the info box.
- Change the info-box sentence "Numery telefonów nie są pokazywane" so it says numbers are hidden by default and can be revealed only through the logged break-glass action.
- Nothing else on the page changes.

#### 5. Smoke checks

**File**: `scripts/smoke.mjs`

**Intent**: Assert that the new route inherits the gates.

**Contract**: there are four new steps, using the existing zero-UUID path `/koordynator/kryzys/00000000-0000-0000-0000-000000000000/kontakty`:

- anonymous GET returns 302 to `/auth/signin`
- anonymous POST (form `reason=…`) returns 302 to `/auth/signin`
- resident GET returns 403 with `no-store`
- resident POST returns 403 with `no-store`

The anonymous steps go in `readonlySteps`, next to the existing crisis gate steps, so `SMOKE_READONLY=1` runs them against production. The resident steps go in `writeSteps`, next to "crisis page denies resident".

### Success Criteria:

#### Automated Verification:

- Type check passes: `npx astro check`
- Lint passes: `npm run lint`
- Build passes: `npm run build`
- DB tests still pass: `npm run test:db`
- Smoke passes against the local dev server, including the four new gate steps: `npm run smoke`

#### Manual Verification:

- As a coordinator on a seeded active crisis, the crisis page shows the break-glass link, and the GET page shows the warning and form with no numbers.
- Submitting a 5-character reason shows the inline error and writes no audit row (check in Studio).
- Submitting a valid reason shows all matched residents with phones, including more than 200 on a large seeded crisis if available, each with a working `tel:` link, plus the unverified banner and the no-phone count. One event row and N subject rows appear in Studio.
- Reloading the GET URL, or opening the crisis page, shows no numbers. Another coordinator account sees no numbers until they reveal themselves.
- After ending the crisis, the `kontakty` page shows the ended note, a stale form submit shows the "already ended" message, and the audit rows remain.
- The response headers on the POST include `Cache-Control: private, no-store`.
- The layout works at phone width (375 px).

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- No unit runner exists (Module 3 introduces one). The zod reason schema is small and covered by the manual 422 check.

### Integration Tests:

- pgTAP suite `break_glass_contact_reveal_test.sql` (Phase 1) is the primary guarantee test: access, scope beyond 200, phone omission, the current number, reason validation, ended crisis, audit row contents, survival across `end_crisis` and account deletion, and the client privilege boundary.
- Smoke: the four gate steps (Phase 2).

### Manual Testing Steps:

1. `npx supabase db reset`, sign in as a seeded coordinator, activate a crisis with a large radius near the seed area.
2. Open the crisis page, follow "Ujawnij kontakty (break-glass)", submit a short reason, see the error.
3. Submit a valid reason, check the list, tap a `tel:` link on a phone-width viewport, and compare the row count with Studio's `contact_reveal_subjects` for that event.
4. Reload, then open the crisis page as a second coordinator, and confirm no numbers are visible.
5. End the crisis, revisit `kontakty`, confirm the ended note and that the audit rows remain.

## Performance Considerations

The reveal returns every matched row with a phone. At pilot scale (hundreds) this is one round trip, well under the 3-second budget. The insert of subject rows scales with the same row count. At thousands of rows, the rendered page grows, but it does not need pagination for the pilot. Revisit if a 20 km radius in a dense city exceeds a few thousand matches.

## Migration Notes

The migration is purely additive: two new tables and one new function, with no change to existing objects. Push it to production with `npx supabase db push` before merging Phase 2. A rollback of the Worker leaves the function and tables unused and harmless. Audit rows written in production must not be deleted by hand; S-14 defines their retention.

## References

- Roadmap: `context/foundation/roadmap.md` S-09; PRD FR-012 (`context/foundation/prd.md:105`)
- Infrastructure risk "break-glass audit lost to log retention": `context/foundation/infrastructure.md:127`, `:171`
- Phone boundary: `supabase/migrations/20261003120000_resident_phone_and_availability.sql`
- Snapshot and lock pattern: `supabase/migrations/20261002120000_crisis_deactivation.sql`
- Audit table precedent: `supabase/migrations/20260928120000_coordinator_role.sql`
- Service pattern: `src/lib/services/crisis.ts`; page pattern: `src/pages/koordynator/kryzys/[id].astro`
- Test pattern: `supabase/tests/crisis_deactivation_test.sql`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Database — audit trail and reveal RPC

#### Automated

- [x] 1.1 Migration and seed apply cleanly: `npx supabase db reset` — 38b9f80
- [x] 1.2 DB tests pass, new suite and existing suites: `npm run test:db` — 38b9f80
- [x] 1.3 Types regenerated with no manual edits: `npm run db:types` — 38b9f80
- [x] 1.4 Type check passes: `npx astro check` — 38b9f80
- [x] 1.5 Lint passes: `npm run lint` — 38b9f80

#### Manual

- [x] 1.6 Coordinator reveal in Studio returns numbers and writes the expected audit rows — 38b9f80
- [x] 1.7 Migration pushed to production before the Phase 2 PR merges — 38b9f80

### Phase 2: App — reveal page and entry point

#### Automated

- [x] 2.1 Type check passes: `npx astro check`
- [x] 2.2 Lint passes: `npm run lint`
- [x] 2.3 Build passes: `npm run build`
- [x] 2.4 DB tests still pass: `npm run test:db`
- [x] 2.5 Smoke passes against the local dev server, including the four new gate steps: `npm run smoke`

#### Manual

- [x] 2.6 Crisis page shows the break-glass link; GET page shows warning and form with no numbers
- [x] 2.7 Short reason shows the inline error and writes no audit row
- [x] 2.8 Valid reason shows all matched residents with phones, tel: links, unverified banner and no-phone count; audit rows match
- [x] 2.9 Reload, the crisis page, and a second coordinator show no numbers
- [x] 2.10 After ending the crisis, the reveal is refused and the audit rows remain
- [x] 2.11 POST response carries `Cache-Control: private, no-store`
- [x] 2.12 Layout works at phone width (375 px)
