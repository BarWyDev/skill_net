# Data Visibility Controls Implementation Plan

## Overview

Roadmap S-12 (FR-006): a resident chooses which of their data is visible, and in which mode. The owner accepted the visibility matrix on 2026-10-19 (`visibility-matrix-proposal.md`, decisions D1–D8). It defines four switches, all on by default:

| Switch | Mode     | Scope         | Effect when off                                                                                           |
| ------ | -------- | ------------- | --------------------------------------------------------------------------------------------------------- |
| V1     | everyday | profile       | The resident is not counted on the public density map (from the next daily refresh).                      |
| V2     | crisis   | per skill     | The skill takes no part in matching, score, teams or `matched_skills`. With no crisis skill left, the resident leaves the crisis list. Still counted on the map. |
| V3     | crisis   | profile       | The coordinator sees availability as "not declared". The ranking is unchanged.                           |
| V4     | crisis   | profile       | Break-glass skips the resident's number and does not log them. The list still shows "ma telefon".          |

## Current State Analysis

- One eligibility rule, `profile_is_matchable` (`supabase/migrations/20261006140000_signup_consent.sql:130`), drives new crisis rankings, the density map (`refresh_skills_density`, `20261011130000_density_k_anonymity.sql:93`), the `/profil` state and the sign-in redirect (`src/pages/api/auth/signin.ts:35`).
- New crises snapshot `matched_skills` at activation (`activate_crisis`, latest in `20261011120000_meaningful_reasons.sql:142`). Active crises are read through `get_crisis_matches` and `get_team_candidates` (`20261010120000_crisis_activation_audit.sql:211,263`), `reveal_crisis_contacts` (`20261011120000_meaningful_reasons.sql:57`) and the computed column `visible_match_count` (`20261006120000_pause_availability.sql:396`). All four already filter paused residents at read time. S-13 set this pattern, and this plan copies it.
- `get_team_candidates` reads `profile_skills` live and joins role skills that may lie outside the crisis matrix, so it can surface people the crisis list does not show.
- `save_my_profile` (latest in `20261003120000_resident_phone_and_availability.sql:85`) deletes and re-inserts `profile_skills` on every save, so a per-skill flag survives only if it travels inside `p_skills`.
- `/koordynator/kryzys/[id]/kontakty` computes "Bez numeru telefonu" as `matchCount − contacts.length` (`kontakty.astro:80`). After V4 that count would include residents who declined the reveal.
- The profile form is a React island (`ProfileForm.tsx`, `SkillsPicker.tsx`) posting to `src/pages/api/profile.ts`, which is parsed by `src/lib/validation/profile.ts`. Skills travel as repeated `skill` fields (`<slug>` or `<slug>:<level>`).
- `/prywatnosc` says the coordinator can reveal the number in an active crisis and describes no choices. Changing its wording needs a new consent version (`src/lib/consent.ts:7`), and the consent gate then re-asks every resident in the app.

## Desired End State

On `/profil` a resident sees a "Używaj w kryzysie" checkbox under every checked skill. A "Widoczność danych" section holds V1, V3 and V4. Everything saves with the existing "Zapisz" button. The settings take effect immediately in every active crisis: list, teams, counts and break-glass. They also apply to every new crisis and, from the next daily refresh, to the map. A resident who hid every skill from crisis use sees a banner saying a coordinator cannot find them, and after sign-in they land on `/` instead of being sent to `/profil`. On the contacts page the coordinator sees, before and after a reveal, how many matched people declined an emergency reveal, so the counts add up. `/prywatnosc` describes the four choices under a new consent version.

### Key Discoveries:

- The map and crisis eligibility must split. If V2 stayed inside `profile_is_matchable`, a resident hiding every skill from crisis use would also drop off the map, contradicting D5.
- Teams must be a subset of the visible list. Otherwise a resident hidden from the list by V2 could reappear through a role skill such as a driver's licence.
- The existing snapshot `position` comes from activation time. D6 accepts that order may be slightly stale after a mid-crisis V2 change. Only the displayed skills and row presence change at read time.
- `activate_crisis` is the place to drop V2-hidden skills for new crises: they must not enter `matched_skills` or the score.

## What We're NOT Doing

- No visibility for other residents, no names or pseudonyms, no ad-hoc search (FR-016) and no live map (FR-013). None of these exists.
- No switch for email, location, level or pause. They are fixed rules (matrix §3). Level is shown and scored together with its skill.
- No immediate map update on V1. The daily snapshot is the F-03 defence against differencing, and a toggle must not trigger a refresh.
- No re-scoring or re-ordering of an active crisis after a V2 change (D6).
- No audit log of switch changes (D7).
- No S-07 or S-08 work. This plan only states the contract S-07 must follow.
- No telling the coordinator which resident declined a reveal: only a count (D3).

## Implementation Approach

Follow the S-13 pause pattern. State lives on `profiles` and `profile_skills`, with pure predicates in SQL, read-time filters on every snapshot reader, and new crises filtered at activation. Ship one expand-only migration plus one application phase. Push the migration to production before merging the code (lesson "Push migrations to production right after merge"; the new consent version also has to exist before the code that uses it).

## Critical Implementation Details

**Timing & lifecycle.** The migration adds a new consent version, and `CURRENT_CONSENT_VERSION` moves to it in phase 2. If the code deploys before `npx supabase db push`, every sign-up fails with `consent_required`. So push the migration first, then merge.

**State sequencing.** `reveal_crisis_contacts` must apply V4 and V2 inside its existing `revealed` CTE, so the logged subjects, `revealed_count` and the returned rows stay one set. That is the S-09 invariant, already reused by S-13.

## Phase 1: Database

### Overview

Store the four switches, split map eligibility from crisis eligibility, and apply the switches in every reader. Expand only.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/20261019120000_data_visibility_controls.sql`

**Intent**: Store V1–V4 with "on" defaults, so existing residents keep today's behaviour (D1).

**Contract**: `profiles.show_on_map`, `profiles.show_availability_in_crisis` and `profiles.allow_contact_reveal`, plus `profile_skills.use_in_crisis`, all `boolean not null default true`. Table grants are unchanged (the owner already has table-level update on both tables), so `narrow_table_grants_test.sql` needs no new rows. Header comment in the style of the S-13 migration, listing every guarantee.

#### 2. Eligibility predicates

**File**: same migration

**Intent**: Separate "counts on the map" from "can be matched in a crisis".

**Contract**:
- New `profile_counts_on_map(p_user_id uuid) returns boolean`. It requires a location, at least one skill (any `use_in_crisis`), no active pause, a consent row and `show_on_map`. Security invoker, like `profile_is_matchable`.
- `profile_is_matchable` changes: the skill condition becomes "at least one skill with `use_in_crisis`". Everything else stays (location, pause, consent). It does not look at `show_on_map`.
- `refresh_skills_density` switches from `profile_is_matchable` to `profile_counts_on_map`. The category filter keeps counting every skill, whatever its V2 setting (D5).
- New helper `crisis_visible_skills(p_user_id uuid, p_matched jsonb) returns jsonb`. It keeps only the elements of the snapshot's `matched_skills` whose slug the resident still has with `use_in_crisis = true`, preserving their order, and returns null when none remain. This is the single definition of "row visible" for every reader. A skill the resident removed from their profile also disappears from an active crisis, which is consistent with "hidden = not used".

#### 3. New crises

**File**: same migration (`activate_crisis`, replaced from `20261011120000_meaningful_reasons.sql`)

**Intent**: V2-hidden skills never enter a new snapshot or score.

**Contract**: the `matched` CTE joins only `profile_skills` rows with `use_in_crisis`. Nothing else changes (signature, reason check, throttle, tiebreak).

#### 4. Active-crisis readers

**File**: same migration

**Intent**: Every switch takes effect at once in active crises (D6), with the same set rules as the pause filter.

**Contract**:
- `get_crisis_matches`: return rows only where the resident is not paused and `crisis_visible_skills(...)` is not null. Return that value as `matched_skills`. `availability_slots` and `available_now` are null when `show_availability_in_crisis` is false. `crisis_list_views.returned_count` counts the filtered rows.
- `get_team_candidates`: a candidate must satisfy the same visibility rule as the list (teams are a subset of the list), and role skills come only from `use_in_crisis` skills. V3 applies as above.
- `reveal_crisis_contacts`: the `revealed` CTE additionally requires `allow_contact_reveal` and a non-null `crisis_visible_skills`. It returns the filtered `matched_skills`, and V3 applies. Logged subjects, `revealed_count` and the returned rows remain one statement and one set.
- `visible_match_count`: counts the same rows `get_crisis_matches` would return, and still returns the frozen `match_count` for an ended crisis.
- New computed column `reveal_declined_count(public.crises) returns integer`: for an active crisis and a coordinator, the number of visible rows whose resident has a phone and `allow_contact_reveal = false`. It returns 0 otherwise. Security definer, owned by postgres, execute for `authenticated` only (the `visible_match_count` pattern, including the unnamed-parameter form from `20261006130000`).

#### 5. Profile RPCs

**File**: same migration

**Intent**: Save and return the switches without breaking the code on `master`.

**Contract**:
- `save_my_profile`: drop the 7-argument version and create one with three trailing parameters `p_show_on_map`, `p_show_availability_in_crisis` and `p_allow_contact_reveal`, each `boolean default null`, where null means "leave unchanged". Each `p_skills` element accepts an optional `"crisis": false`, and a missing key means true. The current code, which sends 7 named arguments and no `crisis` keys, keeps working. Re-apply the revoke/grant lines.
- `get_my_profile`: add `show_on_map`, `show_availability_in_crisis` and `allow_contact_reveal`, plus `crisis` on each skill element. `matchable` now uses the new rule, and `complete` is unchanged.

#### 6. Consent version

**File**: same migration

**Intent**: The `/prywatnosc` wording changes in phase 2 (D8).

**Contract**: insert a new `consent_versions` row dated the day the migration is written (`2026-10-19` if written today). Phase 2 sets `CURRENT_CONSENT_VERSION` to the same value.

#### 7. Types and tests

**Files**: `src/db/database.types.ts` (`npm run db:types`), `supabase/tests/data_visibility_controls_test.sql`

**Intent**: Lock every switch × reader combination in pgTAP.

**Contract**: the suite covers at least:
- defaults are on for existing and new rows;
- V1 off removes the resident from the density refresh but not from `activate_crisis`;
- V2 off on every skill makes the resident non-matchable while they still count on the map;
- V2 off on one skill drops it from a new snapshot and its score;
- in an active crisis, V2 off on all matched skills hides the row from the list, teams, reveal and `visible_match_count`, and turning it back on restores the row at the same `position`;
- V2 off on a crisis skill also excludes the resident from teams even when a role skill is still on;
- V3 off nulls availability in all three readers;
- V4 off excludes the number from reveal, writes no subject row, keeps `has_phone`, and counts in `reveal_declined_count`;
- `save_my_profile` with null switch parameters leaves them unchanged, and with no `crisis` keys stores true;
- the 7-argument named call from the current code still succeeds.

Existing suites (ranking, teams, break-glass, pause, density, consent, grants) must pass unchanged or with their expectations updated only where this plan changes behaviour on purpose. Name each such update in the commit.

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly: `npx supabase db reset`
- All pgTAP suites pass, including the new one: `npm run test:db`
- Types regenerate with no unexpected diff: `npm run db:types`
- Lint and type check pass: `npm run lint` and `npx astro check`

#### Manual Verification:

- In Studio, on seed data, activate a crisis, turn V2 off on one resident's matched skills, and confirm they vanish from the coordinator list and teams, then reappear at the same "Osoba #N"
- Before merging the phase 2 code to `master`, `npx supabase db push` to production (expand-only, so the code on `master` keeps working), then `npx supabase migration list --linked` shows it applied

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Application

### Overview

Expose the switches on `/profil`, keep the coordinator's counts honest, update the sign-in redirect, and publish the new notice.

### Changes Required:

#### 1. Profile form

**Files**: `src/components/profile/SkillsPicker.tsx`, `src/components/profile/ProfileForm.tsx`, `src/types.ts`

**Intent**: Put V2 under each skill and V1, V3 and V4 in a "Widoczność danych" section of the same form, all saved by "Zapisz" (planning decision).

**Contract**: `ProfileSkillDTO` gains `crisis: boolean`. `MyProfileDTO` gains `showOnMap`, `showAvailabilityInCrisis` and `allowContactReveal`. Under a checked skill, a "Używaj w kryzysie" checkbox appears, default checked, on its own row like the level radios. The section labels follow the matrix wording, each with one line explaining its effect (V1 also says it applies from the next day). The form always submits explicit values: repeated `skill_crisis_off=<slug>` for hidden skills, and `show_on_map`, `show_availability` and `allow_contact_reveal` as `1`/`0`. That way an unchecked box is never confused with "not sent". Mobile layout at 375 px with no horizontal scroll, matching the rest of `/profil`.

#### 2. Parsing and service

**Files**: `src/lib/validation/profile.ts`, `src/lib/services/profile.ts`, `src/pages/api/profile.ts`

**Intent**: Validate the new fields with zod and pass them to the RPC.

**Contract**: a `skill_crisis_off` slug must be one of the submitted skills, otherwise the form fails with a Polish message. A missing switch field maps to null, meaning unchanged, so smoke and old clients keep working. `myProfileSchema` and the DTO mapping gain the new keys. Never log the values.

#### 3. Profile status and sign-in redirect

**Files**: `src/pages/profil.astro`, `src/pages/api/auth/signin.ts`, `src/lib/services/profile.ts`

**Intent**: Explain a profile no coordinator can find, and stop nudging a deliberate choice at every sign-in (planning decision).

**Contract**: when `complete && !paused && !matchable`, `/profil` shows an attention line: "Żadna z Twoich umiejętności nie jest używana w kryzysach, więc koordynator Cię nie znajdzie." Sign-in redirects to `/profil` when the profile is incomplete or paused. Otherwise it goes to `/`, and a failed check also goes to `/`, as today. `isProfileMatchable` is replaced by a check built on `get_my_profile` (`complete`, `paused`), or removed if nothing else uses it. Check that `scripts/smoke.mjs` assertions on the sign-in redirect still hold, and update them if they assert the old rule.

#### 4. Contacts page counts

**Files**: `src/lib/services/crisis.ts`, `src/types.ts`, `src/pages/koordynator/kryzys/[id]/kontakty.astro`

**Intent**: Show how many matched people declined an emergency reveal, before and after the reveal (planning decision, D3).

**Contract**: `CRISIS_COLUMNS` adds `reveal_declined_count`, and `CrisisDTO` gains `revealDeclinedCount`. Before the reveal, when the count is > 0, the dialog adds one line: "N osób nie zgodziło się na awaryjne odsłonięcie numeru." After the reveal, "Bez numeru telefonu" becomes `matchCount − contacts.length − revealDeclinedCount` (floored at 0), shown next to the declined count. Use the existing `formatPeople` for Polish plurals. Never name or position the people who declined.

#### 5. Privacy notice and consent version

**Files**: `src/pages/prywatnosc.astro`, `src/lib/consent.ts`

**Intent**: Describe the four choices and the fixed rules, under the new consent version (D8).

**Contract**: the "W jakim celu" and phone paragraphs say that the map, crisis use of each skill, availability and the emergency reveal can each be switched off on `/profil`, and that a number is always shared with the coordinator after a "TAK" (future S-08). `CURRENT_CONSENT_VERSION` equals the migration's new row. The draft notice stays.

#### 6. Unit tests

**Files**: `src/lib/*.test.ts` next to any new pure helper

**Intent**: Cover new pure logic that runs under `node:test` (relative imports only), such as the contacts count arithmetic or the form encoding of switches, if extracted into an alias-free module.

**Contract**: one test per helper, including the zero floor and plural forms.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test:unit`
- Lint and type check pass: `npm run lint` and `npx astro check`
- Build passes: `npm run build`
- Smoke passes locally: `npm run smoke`
- DB suites still pass: `npm run test:db`

#### Manual Verification:

- On `/profil` (375 px and desktop), toggle each switch, save, reload, and see the values kept. A hidden skill keeps its level.
- Hide every skill from crisis use: the banner appears, and sign-in lands on `/`.
- As a coordinator in an active crisis, a resident with V4 off is counted in the pre-reveal line and missing from the revealed numbers, and the post-reveal counts add up to the match count.
- A resident with V3 off shows "nie podano" availability on the crisis list.
- `/zgoda` asks existing users once for the new version, and `/prywatnosc` shows the new date and wording.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- Contacts counts: declined and missing-phone arithmetic, floored at 0.
- Form encoding: unchecked switches are sent as `0`, and a hidden skill not in the skill list is rejected (if the parser is alias-free).

### Integration Tests:

- The pgTAP suite `data_visibility_controls_test.sql` covers every switch × reader combination listed in phase 1 §7.

### Manual Testing Steps:

1. Seed two residents in one area and activate a crisis. Hide resident A's only matched skill, confirm A disappears from list, teams and count, then unhide it and confirm A is back at the same position.
2. Turn off V4 for resident B and reveal: B is absent from the numbers and present in the declined count. `get_my_number_reveals` for B shows nothing new.
3. Turn off V1 for a resident and confirm the map changes only after the next Warsaw-day refresh.

## Performance Considerations

`crisis_visible_skills` runs per snapshot row in each read. Lists are capped at 200 rows and `profile_skills` has a primary key on `(user_id, skill_slug)`, so this is one index lookup per row and well within the 3 s target. `activate_crisis` gains only a boolean filter on rows it already joins.

## Migration Notes

Expand only: new columns with defaults, replaced function bodies, one dropped-and-recreated `save_my_profile` that keeps accepting the old named call, a new computed column and a new consent row. Push to production before merging phase 2's code. There is no contract step. S-07 must take its alert audience from `profile_is_matchable` and alert only on skills with `use_in_crisis`; V4 does not affect SMS. Record this contract in S-07's plan.

## References

- Accepted matrix: `context/changes/data-visibility-controls/visibility-matrix-proposal.md`
- Pattern followed: `context/archive/2026-10-06-pause-availability/plan.md`
- Break-glass invariant: `supabase/migrations/20261004120000_break_glass_contact_reveal.sql`
- Density k-anonymity and daily refresh: `supabase/migrations/20261011130000_density_k_anonymity.sql`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Database

#### Automated

- [x] 1.1 Migration applies cleanly: `npx supabase db reset`
- [x] 1.2 All pgTAP suites pass, including the new one: `npm run test:db`
- [x] 1.3 Types regenerate with no unexpected diff: `npm run db:types`
- [x] 1.4 Lint and type check pass: `npm run lint` and `npx astro check`

#### Manual

- [x] 1.5 Hidden-skill round trip in an active crisis checked in Studio
- [ ] 1.6 Migration pushed to production and listed as applied

### Phase 2: Application

#### Automated

- [ ] 2.1 Unit tests pass: `npm run test:unit`
- [ ] 2.2 Lint and type check pass: `npm run lint` and `npx astro check`
- [ ] 2.3 Build passes: `npm run build`
- [ ] 2.4 Smoke passes locally: `npm run smoke`
- [ ] 2.5 DB suites still pass: `npm run test:db`

#### Manual

- [ ] 2.6 Switches save and reload on `/profil` (375 px and desktop)
- [ ] 2.7 All-hidden banner and sign-in landing on `/`
- [ ] 2.8 Contacts page declined count before and after reveal adds up
- [ ] 2.9 V3 off shows "nie podano" availability to the coordinator
- [ ] 2.10 New consent version asked once; `/prywatnosc` updated
