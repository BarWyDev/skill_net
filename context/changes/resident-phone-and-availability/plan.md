# Resident Phone and Availability Implementation Plan

## Overview

Roadmap S-06 (FR-004, FR-005). A resident can add an optional phone number that nobody else can see, and declare their weekly availability on a grid of days and time-of-day slots. The coordinator sees the availability on the ranked list as information only: an "available now" badge, a short schedule summary, and a "bez telefonu" marker on rows without a phone. They never see the number itself. Ranking order and eligibility do not change.

The phone is the most sensitive field in the product. S-07 (SMS alerts), S-08 (operational list) and S-09 (break-glass reveal) will read it later. This slice builds the privilege boundary they inherit. In this slice only the owner can read the number.

## Current State Analysis

- **Profile schema** (`supabase/migrations/20260927120000_resident_profile_schema.sql`, `20260927150000_profile_postcode_never_stored.sql`): `profiles` (location) and `profile_skills` have owner-only RLS. `save_my_profile(p_location_source, p_postcode, p_lat, p_lng, p_skills)` replaces the location and the whole skill set in one transaction (insert-on-conflict-do-nothing, then `UPDATE`, so the location trigger sees `old`). `get_my_profile()` returns jsonb.
- **Crisis schema** (`20261001120000_crisis_matching.sql`, `20261002120000_crisis_deactivation.sql`): `crisis_matches` is a snapshot keyed by `(crisis_id, user_id)`. `get_crisis_matches(p_crisis_id, p_limit)` is security definer, gated by `is_coordinator()`, and returns `rank, position, distance_km_rounded, matched_skills` with no identity. `availability_score` in the ranking means the S-07 YES confirmation and stays 0. It has nothing to do with declared availability.
- **App**: `/profil` (`src/pages/profil.astro`) renders one React island (`src/components/profile/ProfileForm.tsx`) that posts to `/api/profile` (`src/pages/api/profile.ts`). The form is parsed with zod (`src/lib/validation/profile.ts`) and saved by the service in `src/lib/services/profile.ts`. Errors come back as `?error=` redirects. The middleware sends `Cache-Control: private, no-store` on gated routes (`src/middleware.ts:43`).
- **Coordinator list**: `src/pages/koordynator/kryzys/[id].astro` renders `CrisisMatchDTO` rows (`src/types.ts`) from `getCrisisMatches` (`src/lib/services/crisis.ts:138`). Formatters live in `src/lib/crisis-format.ts`.
- **Tests**: pgTAP in `supabase/tests/*.sql` (`npm run test:db`); HTTP smoke in `scripts/smoke.mjs` (supports `bodyIncludes` / `bodyExcludes`). `crisis_ranking_test.sql:340` asserts `get_crisis_matches`'s argument names.
- **Seed**: `supabase/seed.sql` creates 500 synthetic residents around Kraków (local only), with no phone and no availability.
- **Absent**: any phone or availability storage, any contact data anywhere in the database.

## Desired End State

- On `/profil` a resident can enter, change or clear a Polish mobile number. It is normalised to `+48XXXXXXXXX`, shown back only to them, and comes with a note that nobody else sees it.
- On `/profil` a resident can tick availability on a 7 × 4 grid (`noc 0–6`, `rano 6–12`, `popołudnie 12–18`, `wieczór 18–24`), with a "Zawsze / o każdej porze" button that ticks all slots and a "Wyczyść" button. An empty grid means "not declared".
- A resident without a phone sees a hint that they won't get crisis alerts. "Profil kompletny" (matchability) is unchanged.
- On an active crisis's ranked list, each row shows one of three badges, computed when the page is viewed on the Europe/Warsaw clock: "Deklaruje dostępność teraz", "Teraz poza deklarowaną dostępnością" or "Nie podano". Rows also show a compact schedule summary (e.g. "pn–pt: wieczór") and a "bez telefonu" marker when there is no phone. No number reaches the coordinator.
- The phone lives in `profile_contacts`, which only its owner can read or write. `phone_verified_at` exists and only a future server-side verification path (S-07) can set it.
- Verification: `npm run test:db`, `npm run smoke`, and the manual steps below.

### Key Discoveries:

- `save_my_profile` must keep its insert-then-`UPDATE` order (`20260927150000_profile_postcode_never_stored.sql:63-71`). The location trigger depends on it.
- Changing an RPC's argument list or return type needs `drop function` + `create function`. `create or replace` with a new argument list leaves the old overload callable, and with a new return type it fails. Re-apply owner, `revoke` and `grant` after each re-create (the pattern at `20261001120000_crisis_matching.sql:236-283`).
- `get_crisis_matches` is security definer owned by `postgres`, so it can join `profiles` and `profile_contacts` for other residents. Their RLS stays owner-only.
- `/profil` already sends `private, no-store`, so showing residents their own number in the page is consistent with the lesson in `context/foundation/lessons.md`.
- No unit-test runner exists. SQL logic is tested in pgTAP. The TS formatter is checked manually and through the coordinator page.

## What We're NOT Doing

- SMS/OTP verification of the phone, and any SMS provider (S-07). The phone is stored unverified with `phone_verified_at = null`.
- Showing the number to anyone but its owner: no operational list (S-08), no break-glass reveal (S-09).
- Per-field, per-mode visibility controls (S-12).
- Foreign or landline numbers. Only Polish mobiles are accepted (prefixes 4–8 after `+48`).
- Fine-grained availability (exact hours, ranges, exceptions, holidays).
- Using declared availability in the score, the ranking order or eligibility (FR-005). `availability_score` stays the S-07 confirmation, still 0.
- Changing `profile_is_matchable` or the "Profil kompletny" rule. A resident without a phone remains matchable and ranked.
- Freezing availability into the crisis snapshot. Badges are computed when the list is viewed, from current profiles.
- Encrypting the phone at rest (pgsodium/Vault).

## Implementation Approach

The guarantees live in the database, as in S-01 and S-03. A new `profile_contacts` table holds the phone behind owner-only RLS and column-level grants. `profiles.availability_slots` holds a 28-bit mask. One SQL helper answers "is this mask available at timestamp T (Warsaw)". `save_my_profile` and `get_my_profile` gain the two fields, still in one transaction. `get_crisis_matches` gains three display-only columns: `has_phone`, `availability_slots` and `available_now`. The app layer parses and renders; the shared TS module `src/lib/availability.ts` owns the slot constants, labels and the summary formatter.

**Availability encoding.** Bit index = `(isodow − 1) × 4 + floor(hour / 6)`, so Monday `noc 0–6` is bit 0 and Sunday `wieczór 18–24` is bit 27. Slots are chronological and the labels carry explicit hours, so "pn noc" means Monday 00:00–06:00. A slot includes its start and excludes its end (18:00 is `wieczór`). `null` means "not declared". A saved empty grid is stored as `null`, so "never available" cannot be declared.

## Critical Implementation Details

**`phone_verified_at` must not be writable by the owner.** `save_my_profile` is security invoker, so the owner has write policies on `profile_contacts`. Without column-level grants, a direct PostgREST `PATCH` could set `phone_verified_at = now()` and fake a verification that S-07 will trust. Grant `insert (user_id, phone)` and `update (phone)` only, and add a trigger that sets `phone_verified_at := null` whenever `phone` changes.

**Phone format is checked in two layers on purpose.** The table check is `^\+48\d{9}$`. The mobile-prefix rule `^\+48[4-8]\d{8}$` is enforced in `save_my_profile` (raises `invalid_phone`) and in zod. The seed inserts `+48000XXXXXX` numbers straight into the table. Polish numbering never assigns the `0` prefix, so a seed number can never reach a real person. An owner's direct PostgREST write of such a number only affects their own row, and S-07 can never verify it.

**Never echo or log the phone.** Validation messages and `?error=` redirects must not contain the typed value, and no `console.*` call may include it (CLAUDE.md conventions).

## Phase 1: Database

### Overview

Schema, guarantees, RPCs, seed data and tests. After this phase the database holds and protects both fields, and the coordinator RPC exposes the display columns.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/20261003120000_resident_phone_and_availability.sql`

**Intent**: Add phone storage behind its own privilege boundary, add availability to profiles, and extend the three RPCs. The header comment lists the guarantees, like earlier migrations.

**Contract**:
- `profile_contacts(user_id uuid pk references profiles(user_id) on delete cascade, phone text not null check (phone ~ '^\+48\d{9}$'), phone_verified_at timestamptz, updated_at timestamptz not null default now())`. RLS on, with owner-only policies for select, insert, update and delete (`to authenticated`, separate per operation). `revoke all` from `anon`. For `authenticated`: revoke table-wide insert and update, then `grant insert (user_id, phone)` and `grant update (phone)`. Trigger `profile_contacts_reset_verification` (before insert or update): on insert, or when `phone` changes, set `phone_verified_at := null`. Always set `updated_at := now()`.
- `profiles.availability_slots integer null check (availability_slots between 1 and 268435455)`. 0 is excluded, so "not declared" is only ever `null`.
- `public.availability_covers(p_slots integer, p_at timestamptz) returns boolean`: immutable, `set search_path = ''`. Returns `null` when `p_slots` is null; otherwise tests the bit for `p_at at time zone 'Europe/Warsaw'`.
- `save_my_profile`: drop the 5-argument version and create `save_my_profile(p_location_source text, p_postcode text, p_lat double precision, p_lng double precision, p_skills jsonb, p_phone text, p_availability_slots integer)`. Keep the existing location and skills body unchanged. Then: if `p_phone` is null or empty, delete the caller's `profile_contacts` row; otherwise raise `invalid_phone` unless it matches `^\+48[4-8]\d{8}$`, and upsert it. A changed number resets verification through the trigger. Set `profiles.availability_slots = nullif(p_availability_slots, 0)`. Re-apply `revoke` from `public, anon` and `grant` to `authenticated`.
- `get_my_profile`: add `phone` (text or null), `phone_verified` (boolean) and `availability_slots` (integer or null) to the returned jsonb.
- `get_crisis_matches`: drop and re-create with the return table `(rank integer, "position" integer, distance_km_rounded numeric, matched_skills jsonb, has_phone boolean, availability_slots integer, available_now boolean)`. Left-join `profiles` and `profile_contacts` on `m.user_id`. `has_phone` = a contacts row exists (verified or not). `available_now = availability_covers(p.availability_slots, now())`. Same gate, ordering, limit, owner (`postgres`) and grants as before. Never return the number.

#### 2. Seed

**File**: `supabase/seed.sql`

**Intent**: Make every badge state demoable locally: availability for every seed resident, phones for about 70%.

**Contract**: After the existing profile and skills inserts, set `availability_slots` to a random non-zero 28-bit mask on every seed profile, biased toward realistic patterns (e.g. weekday evenings, weekends), and insert `profile_contacts` rows with `+48000` followed by 6 digits derived from `i`, for about 70% of residents. Keep `setseed` determinism. Update the header comment to say these are fake, unassignable numbers.

#### 3. Database tests

**File**: `supabase/tests/resident_contact_availability_test.sql` (new); `supabase/tests/crisis_ranking_test.sql` (update)

**Intent**: Prove the privacy and semantics guarantees.

**Contract**: The new file covers:
- A resident cannot select, insert, update or delete another resident's `profile_contacts` row. `anon` has no access.
- The owner cannot set `phone_verified_at` directly (permission denied). Changing the phone resets a previously set `phone_verified_at` (set as `postgres` in the fixture) to null.
- `save_my_profile` normalises nothing (that's the app's job) but rejects `+48123456789` and `+48000123456` with `invalid_phone`. It accepts `+48600123456`. An empty or null phone deletes the row. Location, skills and phone are saved atomically: a bad phone rolls back skills too.
- `availability_slots = 0` saves as null. The out-of-range check rejects values ≥ 2^28.
- `availability_covers` boundaries: Monday 00:00 Warsaw → bit 0; Monday 05:59:59 → bit 0; Monday 06:00 → bit 1; Sunday 23:59 → bit 27; a timestamp across the DST change (last Sunday of October, 02:30 local) maps to the local hour; null mask → null.
- `get_my_profile` returns the owner's phone. `get_crisis_matches` returns `has_phone`, `availability_slots` and `available_now` for matched rows, and no column contains a phone value.
- A deleted auth user cascades to `profile_contacts`.

In `crisis_ranking_test.sql`, update the `proargnames` assertion at line 340 to the new signature's argument and output names.

#### 4. Generated types

**File**: `src/db/database.types.ts`

**Intent**: Regenerate with `npm run db:types` after `npx supabase db reset`, so the app compiles against the new RPC signatures.

### Success Criteria:

#### Automated Verification:

- Migration and seed apply cleanly: `npx supabase db reset`
- DB tests pass: `npm run test:db`
- Types regenerated with no manual edits: `npm run db:types`
- Type check passes: `npx astro check`
- Lint passes: `npm run lint`

#### Manual Verification:

- In Studio (http://localhost:54323), about 70% of seed profiles have a `profile_contacts` row and every number starts with `+48000`
- Querying `profile_contacts` from the SQL editor as `authenticated` with another user's JWT returns no rows

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Resident Profile

### Overview

The resident enters, changes and clears their phone, and fills the availability grid on `/profil`.

### Changes Required:

#### 1. Shared availability module

**File**: `src/lib/availability.ts` (new)

**Intent**: One place for the encoding, so the form and the coordinator page agree with the SQL helper.

**Contract**: Exports the day labels (`pn … nd`), slot labels with hours (`noc 0–6`, `rano 6–12`, `popołudnie 12–18`, `wieczór 18–24`), `ALL_SLOTS_MASK = 2^28 − 1`, `slotBit(dayIndex, slotIndex)`, `maskToSlots` / `slotsToMask`, and `formatAvailabilitySummary(mask): string`. The summary groups consecutive days with identical slot sets, e.g. `"pn–pt: wieczór; sb–nd: cały dzień"`, with `"zawsze"` for all slots. The encoding comment must match the migration's.

#### 2. Validation

**File**: `src/lib/validation/profile.ts`

**Intent**: Parse the new fields from the form POST.

**Contract**: `phone`: trim and remove spaces and dashes; accept `+48`, `0048` or no prefix followed by 9 digits starting with 4–8; normalise to `+48XXXXXXXXX`; empty → `null`. The error message ("Podaj polski numer komórkowy, np. 600 123 456.") never contains the input. `availability`: repeated field of bit indexes `0`–`27`, deduplicated and folded into a mask; none → `null`. Both are added to every branch of the discriminated union. `SaveProfileInput` gains `phone: string | null` and `availabilitySlots: number | null`.

#### 3. Types and service

**Files**: `src/types.ts`, `src/lib/services/profile.ts`

**Intent**: Carry the fields through the DTOs and the RPC calls.

**Contract**: `MyProfileDTO` gains `phone: string | null`, `phoneVerified: boolean` and `availabilitySlots: number | null`. `getMyProfile` parses them with zod. `saveMyProfile` passes `p_phone` and `p_availability_slots`. `DB_ERROR_MESSAGES` maps `invalid_phone` to the same Polish message as validation.

#### 4. Form UI

**Files**: `src/components/profile/ProfileForm.tsx`, `src/components/profile/PhoneField.tsx` (new), `src/components/profile/AvailabilityGrid.tsx` (new)

**Intent**: Two new sections in the existing form, usable on a 375 px phone screen.

**Contract**:
- "Telefon (opcjonalnie)": a `type="tel"`, `autocomplete="tel"`, `inputmode="tel"` input named `phone`, prefilled with the stored number. Helper copy: only you see the number; a coordinator will be able to see it in crisis mode after you confirm readiness (future versions); without a number you won't get crisis alerts. Client-side format check mirrors validation.
- "Dostępność (informacyjnie)": a 7 × 4 grid of checkbox buttons (`name="availability"`, value = bit index), with day and slot labels and accessible names like "poniedziałek, wieczór 18–24". Plus "Zawsze / o każdej porze" (tick all) and "Wyczyść" buttons. Copy: availability is only information for the coordinator and doesn't exclude anyone. On a phone, either days are rows or the grid scrolls inside its own container; the page itself never scrolls horizontally.
- One submit still saves everything.

#### 5. Profile page hint

**File**: `src/pages/profil.astro`

**Intent**: Tell a resident without a phone what that means (FR-004) without changing "Profil kompletny".

**Contract**: When `profile.phone` is null, a secondary amber note under the completeness banner: "Bez numeru telefonu nie otrzymasz alertów kryzysowych."

#### 6. Smoke steps

**File**: `scripts/smoke.mjs`

**Intent**: Cover the HTTP contract for the new fields (write steps only, never in `SMOKE_READONLY`).

**Contract**: New steps after "profile save accepts pin and skill":
- "profile save rejects landline": phone `12 345 67 89` → 302 `/profil?error=`.
- "profile save accepts phone and availability": phone `600 000 000` plus `availability` `16`, `20` → 302 `/profil?zapisano=1` exact.
- "profil shows own phone": `bodyIncludes: "+48600000000"`.
- "profile save clears phone": empty phone → saved.
- "profil no longer shows phone": `bodyExcludes: "+48600000000"`.

The existing steps send no `phone` field, which means "clear". That is fine, because they run after the phone steps or don't assert on the phone.

### Success Criteria:

#### Automated Verification:

- Type check passes: `npx astro check`
- Lint passes: `npm run lint`
- Build passes: `npm run build`
- Smoke passes against the local dev server: `npm run smoke`

#### Manual Verification:

- On `/profil`, saving `600-123-456` shows `+48600123456` after reload; clearing it removes it and shows the "Bez numeru telefonu…" note
- An invalid number shows the Polish error, and the URL and page don't contain the typed value
- "Zawsze / o każdej porze" ticks all 28 slots, "Wyczyść" unticks them, and the grid survives a save and reload
- At 375 px width, the phone and grid sections are usable with no horizontal page scroll

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Coordinator Ranked List

### Overview

The coordinator sees availability and phone presence on each ranked row.

### Changes Required:

#### 1. DTO and service

**Files**: `src/types.ts`, `src/lib/services/crisis.ts`

**Intent**: Carry the three new RPC columns.

**Contract**: `CrisisMatchDTO` gains `hasPhone: boolean`, `availabilitySlots: number | null` and `availableNow: boolean | null` (`null` = not declared). `getCrisisMatches` maps them.

#### 2. Ranked list rows

**File**: `src/pages/koordynator/kryzys/[id].astro`

**Intent**: Show availability and phone presence at a glance, without touching the ranking.

**Contract**: Per row:
- A badge: green "Deklaruje dostępność teraz", grey "Teraz poza deklarowaną dostępnością" or muted "Nie podano".
- The `formatAvailabilitySummary` text when declared.
- A "bez telefonu" marker when `!hasPhone`.

Badges carry text, not only colour. The snapshot note becomes: the order and skills are from the moment of activation, availability is the residents' current declaration checked against the current time, phone numbers are not shown, and "bez telefonu" means the person won't get an alert.

### Success Criteria:

#### Automated Verification:

- Type check passes: `npx astro check`
- Lint passes: `npm run lint`
- Build passes: `npm run build`
- DB tests still pass: `npm run test:db`
- Smoke passes: `npm run smoke`

#### Manual Verification:

- With the seed loaded and your local account made coordinator, activating "awaria prądu" at 31-001 with a 5 km radius shows all three badge states and some "bez telefonu" rows
- Changing your own resident profile's availability and reloading an active crisis page updates that row's badge; ranking order is unchanged
- The page source contains no `+48` string
- At 375 px width, rows with badges and the marker wrap cleanly

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful.

---

## Testing Strategy

### Unit Tests:

- None: there is no unit runner (Module 3). The SQL logic (`availability_covers`, the save rules, grants) is covered in pgTAP.

### Integration Tests:

- pgTAP: RLS isolation, column grants on `phone_verified_at`, the verification reset trigger, phone format, atomic save, slot boundaries including DST, and the `get_crisis_matches` columns with no phone leak.
- Smoke: phone save, reject, display and clear, plus an availability save.

### Manual Testing Steps:

1. Save a phone and a weekday-evening grid on `/profil`, reload, and confirm both persist.
2. As coordinator, activate a crisis over the seed area and check the badges, summaries and markers.
3. View the page source of the crisis page and confirm no `+48` appears.
4. Repeat 1 and 2 at 375 px width.

## Performance Considerations

`get_crisis_matches` gains two primary-key left joins over at most 200 rows. That's negligible against the ≤ 3 s target. `availability_covers` is immutable bit arithmetic.

## Migration Notes

The changes are additive for existing data: existing profiles get `availability_slots = null` ("Nie podano") and no contacts row ("bez telefonu"). Crisis snapshots are unaffected. The dropped and re-created RPCs change signatures, so the app must deploy together with the migration. The migration lands before or with the master merge that ships Phases 2–3. Rollback of the Worker does not undo the migration, and the old app would call the dropped 5-argument `save_my_profile`. So if a rollback is needed, revert forward with a migration rather than relying on a Worker rollback.

## References

- Roadmap item: `context/foundation/roadmap.md` (S-06)
- PRD: FR-004, FR-005, Guardrails (`context/foundation/prd.md`)
- Profile schema pattern: `supabase/migrations/20260927150000_profile_postcode_never_stored.sql`
- Security-definer RPC pattern: `supabase/migrations/20261001120000_crisis_matching.sql:200-283`
- Prior plans: `context/archive/2026-09-27-resident-skills-profile/plan.md`, `context/archive/2026-10-01-crisis-activation-ranked-list/plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Database

#### Automated

- [x] 1.1 Migration and seed apply cleanly: `npx supabase db reset`
- [x] 1.2 DB tests pass: `npm run test:db`
- [x] 1.3 Types regenerated with no manual edits: `npm run db:types`
- [x] 1.4 Type check passes: `npx astro check`
- [x] 1.5 Lint passes: `npm run lint`

#### Manual

- [x] 1.6 In Studio, about 70% of seed profiles have a `profile_contacts` row and every number starts with `+48000`
- [x] 1.7 Querying `profile_contacts` as `authenticated` with another user's JWT returns no rows

### Phase 2: Resident Profile

#### Automated

- [ ] 2.1 Type check passes: `npx astro check`
- [ ] 2.2 Lint passes: `npm run lint`
- [ ] 2.3 Build passes: `npm run build`
- [ ] 2.4 Smoke passes against the local dev server: `npm run smoke`

#### Manual

- [ ] 2.5 Saving `600-123-456` shows `+48600123456` after reload; clearing removes it and shows the no-phone note
- [ ] 2.6 An invalid number shows the Polish error; URL and page don't contain the typed value
- [ ] 2.7 "Zawsze" ticks all 28 slots, "Wyczyść" unticks them, grid survives save and reload
- [ ] 2.8 At 375 px width, phone and grid sections are usable with no horizontal page scroll

### Phase 3: Coordinator Ranked List

#### Automated

- [ ] 3.1 Type check passes: `npx astro check`
- [ ] 3.2 Lint passes: `npm run lint`
- [ ] 3.3 Build passes: `npm run build`
- [ ] 3.4 DB tests still pass: `npm run test:db`
- [ ] 3.5 Smoke passes: `npm run smoke`

#### Manual

- [ ] 3.6 Seed crisis at 31-001, 5 km shows all three badge states and some "bez telefonu" rows
- [ ] 3.7 Changing own availability updates that row's badge on reload; ranking order unchanged
- [ ] 3.8 The crisis page source contains no `+48` string
- [ ] 3.9 At 375 px width, rows with badges and the marker wrap cleanly
