# Pause and Resume Availability Implementation Plan

## Overview

Roadmap S-13 (FR-019): a signed-in resident can pause their availability without deleting the account, and resume it later. The PRD accepted pausing as the alternative to deletion that keeps the directory full. While a pause is active, the resident is out of new crisis rankings, out of the public density map, and out of the lists of crises that are already active. Resuming, or reaching the pause's end date, brings them back.

## Current State Analysis

- `profile_is_matchable(user_id)` is the single eligibility rule: a location plus at least one skill (`supabase/migrations/20260927120000_resident_profile_schema.sql:168-182`). `activate_crisis` uses it in `having` (`20261001120000_crisis_matching.sql:165-180`), and `get_skills_density` uses it in `eligible` (`20261005120000_public_skills_density.sql:30-41`). The S-11 plan already says that S-13 extends this rule.
- An active crisis's list is a snapshot in `crisis_matches`, written at activation. Three security-definer RPCs read it without re-checking eligibility:
  - `get_crisis_matches`: `20261003120000_resident_phone_and_availability.sql:177-218`.
  - `reveal_crisis_contacts`: `20261004130000_reveal_contacts_single_snapshot.sql:13-110`. It reads once in the `revealed` CTE.
  - `get_team_candidates`: `20261004140000_crisis_team_templates.sql:62-145`.
- `crises.match_count` is frozen at activation. Pages derive counts from it:
  - `hidden = matchCount − matches.length` (`src/pages/koordynator/kryzys/[id].astro:47`).
  - `withoutPhone = matchCount − contacts.length` (`src/pages/koordynator/kryzys/[id]/kontakty.astro:76`).
  - The "N dopasowanych" headline on the crisis, contacts and teams pages and on `/koordynator`.

  Rows removed from the snapshot are already miscounted today: S-14 cascades unregistered residents out of the snapshot. A paused resident filtered at read time would be miscounted the same way, as "hidden beyond the limit" or "without a phone".
- The RLS policy "profiles: owner can update" gives the owner table-level update on `profiles`. Any rule about new columns must therefore live in a trigger, not only in an RPC.
- `get_my_profile` returns `matchable` (`20261003120000_resident_phone_and_availability.sql:141-170`). `/profil` uses it for the "Profil kompletny / niekompletny" banner (`src/pages/profil.astro:52-63`). Once pause enters `profile_is_matchable`, a paused, complete profile would wrongly show as "niekompletny".
- `signin.ts:22-23` sends a non-matchable user to `/profil` after sign-in.
- `availability_covers(slots, at)` is the precedent for a pure, time-parameterised predicate on the Europe/Warsaw clock, which makes it testable at any instant.
- The pattern for a plain-POST form is "Usuń konto": `DeleteAccount.astro`, then `src/pages/api/auth/unregister.ts`, then `src/lib/services/account.ts`, then an RPC. Errors return through `/profil?error=`.

## Desired End State

- `/profil` has a "Wstrzymaj dostępność" section. The resident picks an end date (today up to today + 365 days, on the Europe/Warsaw calendar) or "bezterminowo", and submits.
- While a pause is active, a banner at the top of `/profil` reads "Twoja dostępność jest wstrzymana do 15.10.2026 włącznie" (or "…wstrzymana bezterminowo") and has a "Wznów dostępność" button. The rest of the profile stays editable.
- A pause "until D" holds through the whole of day D, Warsaw time, and ends at 00:00 on D+1. No job runs: every read evaluates the predicate.
- While paused, the resident:
  - is not a candidate in any newly activated crisis;
  - is not counted in any density-map cell;
  - does not appear in `get_crisis_matches`, `reveal_crisis_contacts` (neither shown nor logged as a subject) or `get_team_candidates` for any active crisis.
- After a resume or expiry during an active crisis, the resident is back at their original `position` ("Osoba #N"). The snapshot row was never removed.
- Coordinators see no indication that anyone paused. For an active crisis, every "N dopasowanych" count and every number derived from it uses the current visible count. An ended crisis keeps its historical `match_count`.
- Verify with `npm run test:db` (new suite plus existing ones), `npm run test:unit`, lint, type check and build, then a manual pass through the pause and resume flow and an active crisis list.

### Key Discoveries:

- PostgREST exposes a SQL function that takes the table's row type as a computed column. `create function public.visible_match_count(public.crises) returns integer` can be selected as `visible_match_count` in `CRISIS_COLUMNS` (`src/lib/services/crisis.ts:87`), with no new endpoint.
- `profile_is_matchable` is security invoker. Inside the security-definer RPCs, which `postgres` owns, it reads every resident. Called by a resident, it sees only that resident's own row. The pause predicate inherits the same behaviour.
- `reveal_crisis_contacts` logs exactly the `revealed` CTE. The pause filter goes inside that CTE, so the logged set still equals the shown set (the S-09 F3 invariant).

## What We're NOT Doing

- No counter or label for paused people in coordinator views. They are absent, and gaps in "Osoba #N" stay unexplained.
- No deletion of snapshot rows on pause. A pause is fully reversible within a crisis.
- No scheduled job, cron or notification when a pause expires.
- No pause history or audit table. Only the current pause is stored.
- No change to `signin.ts`. A paused user is still sent to `/profil` after sign-in, which reminds them that they are paused. The smoke flow uses unpaused users, so its redirect assertions don't change.
- No S-07 work. The alert sender, when it is built, must exclude paused residents through `profile_is_matchable`. This plan records that, but does not build it.
- No limit on how often a resident can pause or resume.

## Implementation Approach

Pause is state on `profiles`, plus one pure predicate evaluated at read time. Putting that predicate into `profile_is_matchable` covers new rankings and the map with one change. A filter on the snapshot read in the three crisis RPCs covers active crises. One computed column keeps the coordinator's counts consistent with what they can see. Write paths are two small RPCs, and a trigger guards the date range against direct PostgREST writes. The app layer follows the existing "Usuń konto" plain-POST pattern.

## Critical Implementation Details

- **Timing & lifecycle:** "Today" and "until D inclusive" are both on the Europe/Warsaw calendar. The predicate is `paused_at is not null and (paused_until is null or paused_until >= (p_at at time zone 'Europe/Warsaw')::date)`. Compute the date bound the same way in the trigger, and in the form's `min`/`max` (server-rendered, not browser-local), so a resident at 23:30 UTC on the last day of the month doesn't see a different "today" from the database.
- **State sequencing:** `profile_is_matchable` changes meaning, so the `/profil` banner needs the old "complete" rule separately. `get_my_profile` returns `complete` (location plus a skill) and the pause fields. The page shows the pause banner when paused, and otherwise the complete/incomplete banner driven by `complete`.

## Phase 1: Database

### Overview

The schema, the predicate, the eligibility change, the write RPCs, the read-time filters, the visible count, regenerated types and a pgTAP suite.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/20261006120000_pause_availability.sql`

**Intent**: Add pause state and make every read path respect it. Every guarantee lives in the database, as in earlier migrations, and the header comment lists them.

**Contract**:
- `profiles.paused_at timestamptz null` and `profiles.paused_until date null`. Constraint: `paused_until is null or paused_at is not null`.
- `public.pause_active(p_paused_at timestamptz, p_paused_until date, p_at timestamptz) returns boolean`: immutable, pure, with the inclusive Warsaw-date rule above. Grant execute to `anon` and `authenticated`, like `availability_covers`.
- Trigger `profiles_check_pause` (before insert or update). When `paused_until` is set and differs from `old`, it must lie between Warsaw today and Warsaw today + 365 days, or the trigger raises `invalid_pause_until`. When `paused_at` is null, `paused_until` must be null; the constraint already enforces this.
- `profile_is_matchable(p_user_id)`, via `create or replace` with the same signature: the existing rule `and not public.pause_active(p.paused_at, p.paused_until, now())`.
- `public.profile_is_complete(p_user_id) returns boolean`: the old matchable rule, security invoker. Used by `get_my_profile`.
- `public.pause_my_availability(p_until date) returns void`: security invoker. Raises `not_authenticated` and `profile_required` (no profiles row; pausing an empty profile means nothing). It sets `paused_at = now()` and `paused_until = p_until` (null means indefinite). Re-pausing overwrites the previous pause.
- `public.resume_my_availability() returns void`: security invoker. Sets both columns to null. Idempotent.
- `get_my_profile()` adds `complete` (from `profile_is_complete`), `paused` (`pause_active(…, now())`) and `paused_until` (the date, or null when the pause is indefinite or inactive). Keep `matchable` with its new meaning.
- `get_crisis_matches`, `reveal_crisis_contacts` and `get_team_candidates`: `create or replace` with unchanged signatures. Each excludes snapshot rows whose profile has an active pause. In `reveal_crisis_contacts` the filter sits inside the `revealed` CTE. In `get_team_candidates` it sits in `qualifying`, so that role bounds count only visible people.
- `public.visible_match_count(public.crises) returns integer`: stable, security definer, owned by `postgres`. It returns 0 unless `is_coordinator()`. For `status = 'active'` it counts the snapshot rows whose resident is not paused. For an ended crisis it returns `match_count`.
- Grants: revoke from `public` and `anon`, then grant to `authenticated` for the new RPCs and the computed column.

#### 2. Generated types

**File**: `src/db/database.types.ts`

**Intent**: Regenerate after the migration, so that the new RPCs, the columns and `visible_match_count` are typed.

**Contract**: Use `npx supabase gen types typescript --local`, or whatever command the earlier changes used. Do not hand-edit the output.

#### 3. pgTAP suite

**File**: `supabase/tests/pause_availability_test.sql`

**Intent**: Prove each guarantee. Use the fixture style of `unregister_and_erase_test.sql`: begin, isolate, roll back.

**Contract**: The suite must cover at least:
- `pause_active` boundaries:
  - until D, evaluated at D 23:59 Warsaw, is true;
  - at D+1 00:00 Warsaw it is false;
  - null until is true;
  - a null `paused_at` is false;
  - the DST change-over day evaluates on Warsaw time.
- The trigger rejects yesterday and today + 366 with `invalid_pause_until`. It accepts today and today + 365, including through a direct `update` as the owner.
- `pause_my_availability`:
  - without a profile it raises `profile_required`;
  - an anonymous caller is denied.
- `resume_my_availability` clears both columns.
- A paused resident is excluded from `activate_crisis` candidates and from `get_skills_density`. A cell of 5 drops below the threshold when one person pauses.
- A pause during an active crisis:
  - absent from `get_crisis_matches`;
  - absent from `get_team_candidates` and from its role bounds;
  - absent from `reveal_crisis_contacts`, both in the rows and in `contact_reveal_subjects` and `revealed_count`.
- Resume restores the same `position`.
- `visible_match_count`:
  - for an active crisis, it equals `match_count` minus paused residents minus erased ones;
  - for an ended crisis it equals `match_count`;
  - for a non-coordinator it is 0.
- `get_my_profile` returns `complete = true` and `matchable = false` while a complete profile is paused.

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly: `npx supabase db reset`
- DB suites pass: `npm run test:db`. This includes the new `pause_availability_test.sql` and the existing suites without changes.
- Types regenerated, and the type check passes: `npx astro check`
- Lint passes: `npm run lint`

#### Manual Verification:

- In Studio, a seeded resident paused with `pause_my_availability(null)` disappears from a fresh `activate_crisis` list and from the `/mapa` cell counts in the local seed.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Application

### Overview

The resident UI to pause and resume, and coordinator pages that count only visible people.

### Changes Required:

#### 1. Pause date helper

**File**: `src/lib/pause.ts`, with test `src/lib/pause.test.ts`

**Intent**: Pure helpers shared by the page and the validation. Give them relative imports only, so that `node:test` can run them.

**Contract**:
- `warsawToday(now: Date): string` returns `YYYY-MM-DD` on the Europe/Warsaw calendar.
- `pauseDateBounds(now)` returns `{ min, max }` (today, today + 365).
- `formatPauseUntil(date: string): string` returns `DD.MM.YYYY`.

Tests cover the UTC-vs-Warsaw midnight edge, a leap-year +365, and formatting.

#### 2. Profile service and DTO

**Files**: `src/lib/services/profile.ts`, `src/types.ts`

**Intent**: Carry the new `get_my_profile` fields, and add the pause and resume calls.

**Contract**:
- `MyProfileDTO` gains `complete: boolean`, `paused: boolean` and `pausedUntil: string | null`. `matchable` stays.
- `myProfileSchema` parses `complete`, `paused` and `paused_until`.
- `pauseMyAvailability(supabase, until: string | null)` and `resumeMyAvailability(supabase)` return `{ ok: true } | { ok: false; message }`. The Polish messages for `invalid_pause_until` and `profile_required` are:
  - "Wybierz datę od dziś do roku naprzód."
  - "Najpierw uzupełnij profil."

  Never log the date.

#### 3. Endpoints

**Files**: `src/pages/api/profile/pause.ts`, `src/pages/api/profile/resume.ts`

**Intent**: Plain form POST handlers in the shape of `src/pages/api/auth/unregister.ts`. They redirect to `/profil?wstrzymano=1` or `/profil?wznowiono=1` on success, and to `/profil?error=…` on failure. `/profil` is already a protected route, so no middleware change is needed.

**Contract**:
- `POST` only.
- The `pause` form fields are `mode` (`date` | `indefinite`) and `until` (`YYYY-MM-DD`, required when `mode=date`). Validate the format server-side with zod. The database enforces the range.

#### 4. Profile page

**Files**: `src/components/profile/PauseAvailability.astro` (new), `src/pages/profil.astro`

**Intent**: The UI chosen in planning: a separate section with its own form, and a banner with "Wznów" while paused.

**Contract**:
- While `paused`, the page shows a banner at the top with the end date ("…wstrzymana do DD.MM.YYYY włącznie" or "…bezterminowo"), a one-line explanation ("Nie pojawisz się w nowych kryzysach ani na mapie, a w trwających kryzysach koordynator Cię nie widzi."), and a `POST /api/profile/resume` button.
- While not paused, the existing completeness banner shows, driven by `complete` instead of `matchable`.
- The section has two radio options (until a date, or indefinitely) and a `type="date"` field with the server-computed `min` and `max` from `pauseDateBounds`.
- Show the section only when `complete`. When the profile is not complete, show one line explaining that pausing applies to a complete profile.
- Add success messages for `wstrzymano` and `wznowiono`, in the same style as `zapisano`.
- The copy is Polish, the page works without JS, and touch targets are at least `h-12`, as in `DeleteAccount.astro`.

#### 5. Coordinator counts

**Files**: `src/lib/services/crisis.ts`, `src/types.ts`, and the pages that use `matchCount`: `src/pages/koordynator/index.astro`, `src/pages/koordynator/kryzys/[id].astro`, `[id]/kontakty.astro`, `[id]/zespoly.astro`, and `src/components/crisis/EndCrisisDialog.astro`.

**Intent**: Every count the coordinator sees for an active crisis matches the list they can actually see.

**Contract**:
- `CRISIS_COLUMNS` adds `visible_match_count`.
- `CrisisDTO.matchCount` is populated from `visible_match_count`, which already returns `match_count` for an ended crisis. All call sites stay unchanged.
- Update the doc comment on `matchCount`.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test:unit`
- Lint passes: `npm run lint`
- Type check passes: `npx astro check`
- Build succeeds: `npm run build`
- DB suites still pass: `npm run test:db`
- Smoke flow still passes locally: `npm run smoke`

#### Manual Verification:

- On `/profil` (phone width), pause until a date, and the banner shows that date. Resume, and the banner disappears. Pause indefinitely, and the banner says "bezterminowo".
- A date outside the range, sent by editing the field in devtools, comes back as the Polish error alert.
- With a seeded active crisis: pause a listed resident, and they vanish from the list, the contacts reveal and the teams. The "N dopasowanych" figure drops by one, and "ukrytych"/"bez telefonu" do not grow. Resume, and they are back at the same "Osoba #N".
- `/mapa` shows the expected band change for a borderline cell after a pause.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- `src/lib/pause.test.ts`: Warsaw "today" around UTC midnight, the +365 bound across Feb 29, and `DD.MM.YYYY` formatting.

### Integration Tests:

- `supabase/tests/pause_availability_test.sql`: every guarantee in Phase 1, item 3. Of these, the predicate boundaries, the reveal log equalling the shown set, and position restored on resume are the load-bearing ones.

### Manual Testing Steps:

1. Sign in as a seeded resident and open `/profil`. Pause until today, and check that the banner reads today's date with "włącznie".
2. As a coordinator, activate a crisis around that resident and confirm they are absent. Resume as the resident and refresh the crisis, and they appear at a stable position.
3. Pause indefinitely, then reveal contacts. The resident's number is not shown and the reveal's subject count excludes them.

## Performance Considerations

`pause_active` is immutable and cheap. It adds one predicate per row to queries that already join `profiles`. `visible_match_count` runs one count per crisis row, and the coordinator lists show only a handful of active crises. `crisis_matches_user_id_idx` and the primary key already cover the join. No new index is needed.

## Migration Notes

The new columns are nullable with no default, so every existing profile is unpaused. The `create or replace` RPCs keep their signatures and grants. Rollback is a forward migration. A Worker rollback alone is safe, because the old app ignores the new fields, but the database behaviour stays.

## References

- Roadmap: `context/foundation/roadmap.md` S-13; GitHub issue #14
- PRD: FR-019, FR-007 Socrates note
- Eligibility rule: `supabase/migrations/20260927120000_resident_profile_schema.sql:168`
- Snapshot readers: `20261003120000_resident_phone_and_availability.sql:177`, `20261004130000_reveal_contacts_single_snapshot.sql:13`, `20261004140000_crisis_team_templates.sql:62`
- Form pattern: `src/components/profile/DeleteAccount.astro`, `src/pages/api/auth/unregister.ts`
- Time predicate precedent: `availability_covers` in `20261003120000_resident_phone_and_availability.sql:64`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Database

#### Automated

- [x] 1.1 Migration applies cleanly: `npx supabase db reset` — 8d1c208
- [x] 1.2 DB suites pass: `npm run test:db` — 8d1c208
- [x] 1.3 Types regenerated, and the type check passes: `npx astro check` — 8d1c208
- [x] 1.4 Lint passes: `npm run lint` — 8d1c208

#### Manual

- [x] 1.5 Paused seeded resident disappears from a fresh crisis list and from `/mapa` counts — 8d1c208

### Phase 2: Application

#### Automated

- [x] 2.1 Unit tests pass: `npm run test:unit` — 55f0da0
- [x] 2.2 Lint passes: `npm run lint` — 55f0da0
- [x] 2.3 Type check passes: `npx astro check` — 55f0da0
- [x] 2.4 Build succeeds: `npm run build` — 55f0da0
- [x] 2.5 DB suites still pass: `npm run test:db` — 55f0da0
- [x] 2.6 Smoke flow still passes locally: `npm run smoke` — 55f0da0

#### Manual

- [x] 2.7 Pause and resume flow on `/profil` at phone width (date, indefinite, banner) — 55f0da0
- [x] 2.8 Out-of-range date returns the Polish error alert — 55f0da0
- [x] 2.9 Active crisis: paused resident vanishes from list, reveal and teams; counts stay consistent; resume restores "Osoba #N" — 55f0da0
- [x] 2.10 `/mapa` band changes for a borderline cell after a pause — 55f0da0
