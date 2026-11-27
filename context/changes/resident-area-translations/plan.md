# Resident Area Translations Implementation Plan

## Overview

Roadmap S-19 (FR-021). A signed-in resident can use `/profil`, `/kursy`, `/zgoda` and `/prywatnosc` in English or Ukrainian, with skill names, validation messages and dates in that language. The last phase switches production to all three languages.

## Current State Analysis

S-18 built the language machinery and translated the public pages and the auth flow. The resident area is still Polish literals:

- Pages: `src/pages/profil.astro`, `kursy.astro`, `zgoda.astro`, `prywatnosc.astro`.
- Profile components: `DeleteAccount.astro`, `NumberReveals.astro`, `PauseAvailability.astro` and the islands `ProfileForm.tsx`, `SkillsPicker.tsx`, `AvailabilityGrid.tsx`, `LocationPicker.tsx`, `PhoneField.tsx`.
- Course components: `CourseForm.astro` (with an inline script), `MyCourses.astro`, `MySignups.astro`, `NearbyCourses.astro` and the island `CoursesMap.tsx`.
- Server messages: `src/lib/validation/profile.ts`, `validation/courses.ts`, `course-text.ts`, `phone.ts`, `postcode.ts`, `visibility.ts`, `services/profile.ts`, `services/courses.ts`, `services/account.ts`, and the endpoints `api/profile.ts`, `api/profile/{pause,resume}.ts`, `api/kursy/*.ts` (8), `api/zgoda.ts`, `api/auth/unregister.ts`.
- Skill names come from `skills.name_pl` through `getTaxonomy` (`src/lib/services/profile.ts`). The course RPCs `get_nearby_courses` and `get_my_course_signups` return `skill_name` and `category_name` in Polish, with no slug.

## Desired End State

With `skillnet_lang=en` or `uk`, every string on the four pages, every notice after a form POST and every skill and category name is in that language. Dates follow the language. Text typed by residents (course titles, descriptions, meeting details) stays as written. `/zgoda` and `/prywatnosc` carry a note that the text is a translation and the Polish original is binding. With Polish, every page is byte-for-byte what it is today. Production offers `pl,en,uk`.

Verify: `npm run test:unit`, `npx astro check`, `npm run lint`, `npm run smoke` locally, then a walk through the four pages in each language on staging.

### Key Discoveries:

- The pattern to follow: `src/lib/password.ts` and `src/lib/auth-errors.ts` take `locale` and read a catalogue; `src/pages/api/auth/signup.ts:12` reads `context.locals.locale`; `SignUpForm.tsx` takes `locale` as a prop.
- `src/lib/i18n/messages/taxonomy.ts:47` `categoryName(locale, slug, databaseName)` is the model for skill names: Polish shows the database name, another language falls back to it.
- `src/lib/i18n/catalogues.test.ts` already checks every file in `messages/` for equal keys, no empty text and equal placeholders. A catalogue may hold only strings.
- `src/lib/availability.ts` (`formatAvailabilitySummary`, `DAY_LABELS`) and `PHONE_ERROR` / `POSTCODE_ERROR` are also used by the coordinator pages and `validation/crisis.ts`. Those stay Polish until S-20, so the Polish exports stay.
- The smoke test asserts no Polish body text on these pages, only statuses, redirect targets and the phone number (`scripts/smoke.mjs:361-597`). Redirect targets must not change.
- `src/pages/prywatnosc.astro:8` says a wording change needs a new consent version. `CONSENT_LABEL` in `src/lib/consent.ts` is the recorded wording.

## What We're NOT Doing

- No database migration. Skill names come from a catalogue keyed by slug.
- No change to the Polish consent label or the Polish privacy notice, so no new consent version. The language cookie is not added to the notice; that waits for the legal review.
- No translation of text typed by residents.
- No coordinator area or crisis mode (S-20). `formatAvailabilitySummary`, `validation/crisis.ts` and `src/components/crisis/**` are untouched.
- No emails and no language stored with the account (S-21).
- The config banner (`src/lib/config-status.ts`) stays Polish. The "Supabase nie jest skonfigurowany." flash from endpoints reuses the existing `auth.notConfigured` message.

## Implementation Approach

One catalogue per area: `profile.ts`, `courses.ts`, `legal.ts`, plus skill names in `taxonomy.ts`. Server functions that return a message take `locale` (parsers, services, the hidden-reason label); endpoints pass `context.locals.locale`. Islands take `locale` as a prop. Astro components read `Astro.locals.locale` themselves. Phases 1 to 3 each translate one area and land as their own PR to `master`, stacked on the previous branch; phase 4 adds checks, docs and the production switch.

## Critical Implementation Details

- **Polish must not change.** Each Polish string moves into its catalogue verbatim. For the two legal texts a unit test pins a hash of the Polish wording, so an edit fails until someone changes the hash on purpose, together with the consent version.
- **Course skill names without a slug.** `kursy.astro` already loads the taxonomy. Build a Polish-name → slug map from it and translate `skillName` / `categoryName` of nearby courses and sign-ups through it; a name with no match shows as it came.
- **Shared Polish exports stay.** `PHONE_ERROR`, `POSTCODE_ERROR`, `DAY_LABELS`, `SLOT_NAMES` and `formatAvailabilitySummary` keep their Polish values for the coordinator code; the resident code reads the catalogues instead.

## Phase 1: Profile

### Overview

`/profil` and everything it posts to, in three languages, with skill names.

### Changes Required:

#### 1. Skill names

**File**: `src/lib/i18n/messages/taxonomy.ts`, `src/lib/i18n/taxonomy.test.ts`

**Intent**: Add the 34 skill names by slug in `en` and `uk`, and the Polish ones as the shape.

**Contract**: `skillName(locale, slug, databaseName): string`, same rules as `categoryName`. A test asserts the catalogue has exactly the slugs of `supabase/migrations/20260927120100_seed_skills_taxonomy.sql`.

#### 2. Profile catalogue and date format

**File**: `src/lib/i18n/messages/profile.ts` (new), `src/lib/i18n/format.ts`

**Intent**: All copy of the profile page, its components, its notices and its validation and database error messages, including day and slot names for the availability grid.

**Contract**: exports `pl`, `en`, `uk`, `profile`. `formatDate(locale, "YYYY-MM-DD"): string` in `format.ts`: `DD.MM.YYYY` for `pl` and `uk`, `D Month YYYY` for `en`, computed without a time zone shift.

#### 3. Server messages

**File**: `src/lib/validation/profile.ts`, `src/lib/services/profile.ts`, `src/lib/services/account.ts`, `src/pages/api/profile.ts`, `src/pages/api/profile/pause.ts`, `src/pages/api/profile/resume.ts`, `src/pages/api/auth/unregister.ts`

**Intent**: Every message returned to the page follows the request's language.

**Contract**: `parseProfileForm(form, locale)`, `saveErrorMessage(error, locale)`, `saveMyProfile(supabase, input, locale)`, `pauseMyAvailability(supabase, until, locale)`, `resumeMyAvailability(supabase, locale)`; `unregisterMe` already takes `locale` and now uses it for every message. Redirect targets unchanged.

#### 4. Page, components and islands

**File**: `src/pages/profil.astro`, `src/components/profile/*`

**Intent**: Replace literals with catalogue reads; pass `locale` to `ProfileForm` and down to its child islands; translate the taxonomy with `skillName` / `categoryName` before it reaches the form.

**Contract**: `ProfileForm`, `SkillsPicker`, `AvailabilityGrid`, `LocationPicker`, `PhoneField` gain a `locale: Locale` prop. Form field names and values unchanged.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test:unit`
- Type check passes: `npx astro check`
- Lint passes: `npm run lint`
- Build passes: `npm run build` (to a scratch `--outDir`)
- Local smoke passes: `npm run smoke`

#### Manual Verification:

- `/profil` in `en` and `uk` shows no Polish outside the language switch; saving, a validation error, pause and resume each show a notice in that language
- `/profil` in `pl` looks and reads as before

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human before proceeding to the next phase.

---

## Phase 2: Courses

### Overview

`/kursy` and its eight endpoints in three languages.

### Changes Required:

#### 1. Courses catalogue

**File**: `src/lib/i18n/messages/courses.ts` (new)

**Intent**: Copy of the page, the four components, the map island, the success notices, the text-rule messages, the RPC error messages, the hidden-reason labels and the duration units.

**Contract**: exports `pl`, `en`, `uk`, `courses`. Messages with bounds use placeholders (`{min}`, `{max}`).

#### 2. Server messages

**File**: `src/lib/course-text.ts`, `src/lib/validation/courses.ts`, `src/lib/services/courses.ts`, `src/pages/api/kursy/*.ts`

**Intent**: Messages follow the request's language.

**Contract**: `checkCourseText(raw, field, locale)`, `formatCourseDuration(minutes, locale)`, the four `parse*CourseForm(form, locale)`, `courseErrorMessage(error, locale)`, `hiddenReasonLabel(reason, eligibleOn, locale)`, and `locale` as the last argument of the service calls that return a message. `course-text.ts` keeps relative imports only.

#### 3. Page and components

**File**: `src/pages/kursy.astro`, `src/components/courses/*`

**Intent**: Catalogue reads; skill and category names translated, by slug for own courses and by the Polish-name map for nearby courses and sign-ups; the inline script of `CourseForm.astro` gets its messages through `data-` attributes.

**Contract**: `CoursesMap` gains `locale`. Form field names unchanged.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test:unit`
- Type check passes: `npx astro check`
- Lint passes: `npm run lint`
- Build passes: `npm run build` (to a scratch `--outDir`)
- Local smoke passes: `npm run smoke`

#### Manual Verification:

- `/kursy` in `en` and `uk`: creating, editing, closing, renewing and deleting a course, and a rejected text, each show copy and notices in that language; the resident's own title and description stay as typed
- `/kursy` in `pl` reads as before

**Implementation Note**: Pause for manual confirmation before the next phase.

---

## Phase 3: Consent and privacy

### Overview

`/zgoda` and `/prywatnosc` as courtesy translations with the Polish text binding.

### Changes Required:

#### 1. Legal catalogue

**File**: `src/lib/i18n/messages/legal.ts` (new), `src/lib/i18n/legal.test.ts` (new)

**Intent**: The consent gate copy and the whole privacy notice, section by section; a courtesy note for `en` and `uk`.

**Contract**: exports `pl`, `en`, `uk`, `legal`. The test pins a SHA-256 of the Polish privacy strings joined in key order and of `CONSENT_LABEL`.

#### 2. Pages and endpoint

**File**: `src/pages/zgoda.astro`, `src/pages/prywatnosc.astro`, `src/pages/api/zgoda.ts`

**Intent**: `/zgoda` shows the translated consent label from the `auth` catalogue with the Polish original below it marked as binding, as the sign-up form does. `/prywatnosc` renders from the catalogue with the courtesy note on top and a link to the Polish original (`/prywatnosc?lang=pl`). The version date uses `formatDate`.

**Contract**: `CURRENT_CONSENT_VERSION` and `CONSENT_LABEL` unchanged. The checkbox name and the endpoint's redirects unchanged.

### Success Criteria:

#### Automated Verification:

- Unit tests pass, including the pinned hashes: `npm run test:unit`
- Type check passes: `npx astro check`
- Lint passes: `npm run lint`
- Local smoke passes: `npm run smoke`

#### Manual Verification:

- `/prywatnosc` in `en` and `uk` shows the courtesy note and no Polish; in `pl` it is word for word the current notice
- `/zgoda` in `en` and `uk` shows the translation and the Polish original (checked with an account whose consent is not current, on staging)

**Implementation Note**: Pause for manual confirmation before the next phase.

---

## Phase 4: Verification and rollout

### Overview

Smoke checks, documentation, and production offers all three languages.

### Changes Required:

#### 1. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: With the language cookie set to `en`, `/prywatnosc` and the signed-in `/profil` carry an English heading; a profile save with a bad level leaves an English notice. Skipped under `SMOKE_READONLY=1`, like the other language checks, except the anonymous `/prywatnosc` check.

**Contract**: new entries in the existing language section.

#### 2. Documentation

**File**: `CLAUDE.md`, `README.md`, `context/foundation/roadmap.md`

**Intent**: The list of pages not yet translated shrinks to `/koordynator/**`; production's `ENABLED_LOCALES` is described as `pl,en,uk`.

**Contract**: prose only.

#### 3. Production switch

**File**: `wrangler.jsonc`

**Intent**: Production offers Polish, English and Ukrainian.

**Contract**: top-level `vars.ENABLED_LOCALES` becomes `"pl,en,uk"`. It reaches production only with the next promotion PR.

### Success Criteria:

#### Automated Verification:

- Local smoke passes with the new checks: `npm run smoke`
- CI is green on the PR: `ci`, `smoke`

#### Manual Verification:

- Staging: the four pages read correctly in each language
- The owner has read the English and Ukrainian texts, or accepts shipping them unread

---

## Testing Strategy

### Unit Tests:

- `catalogues.test.ts` covers the three new catalogues without changes.
- `skillName`: Polish shows the database name; a missing slug falls back; the catalogue has exactly the seeded slugs.
- `formatDate` in each language, including 1 January and 31 December (no time zone shift).
- Existing `course-text.test.ts` and `pause.test.ts` updated for the new signatures; one case per language for a text-rule message.
- Pinned hashes of the Polish legal texts.

### Manual Testing Steps:

1. Sign in on the local server with `ENABLED_LOCALES=pl,en,uk`, switch to EN, open `/profil`, save with and without errors, pause and resume.
2. The same on `/kursy`: create, edit, close, reopen, renew, delete.
3. Repeat in UA and check the Cyrillic fonts.
4. Switch to PL and compare with staging before the change.

## Performance Considerations

None. Catalogues are static modules; islands import only their own area.

## Migration Notes

No migration. Production gets the three languages when the PR with phase 4 is promoted.

## References

- Roadmap S-19: `context/foundation/roadmap.md`
- S-18 plan: `context/archive/2026-11-26-interface-language-switch/plan.md`
- Pattern: `src/lib/password.ts`, `src/lib/i18n/messages/taxonomy.ts:47`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Profile

#### Automated

- [x] 1.1 Unit tests pass: `npm run test:unit` — 4e831a4
- [x] 1.2 Type check passes: `npx astro check` — 4e831a4
- [x] 1.3 Lint passes: `npm run lint` — 4e831a4
- [x] 1.4 Build passes: `npm run build` (to a scratch `--outDir`) — 4e831a4
- [x] 1.5 Local smoke passes: `npm run smoke` — 4e831a4

#### Manual

- [x] 1.6 `/profil` in `en` and `uk` shows no Polish outside the language switch; notices follow the language — 4e831a4
- [x] 1.7 `/profil` in `pl` looks and reads as before — 4e831a4

### Phase 2: Courses

#### Automated

- [x] 2.1 Unit tests pass: `npm run test:unit` — 1ce213c
- [x] 2.2 Type check passes: `npx astro check` — 1ce213c
- [x] 2.3 Lint passes: `npm run lint` — 1ce213c
- [x] 2.4 Build passes: `npm run build` (to a scratch `--outDir`) — 1ce213c
- [x] 2.5 Local smoke passes: `npm run smoke` — 1ce213c

#### Manual

- [x] 2.6 `/kursy` in `en` and `uk`: every action shows copy and notices in that language; typed text stays as typed — 1ce213c
- [x] 2.7 `/kursy` in `pl` reads as before — 1ce213c

### Phase 3: Consent and privacy

#### Automated

- [x] 3.1 Unit tests pass, including the pinned hashes: `npm run test:unit` — 53a447b
- [x] 3.2 Type check passes: `npx astro check` — 53a447b
- [x] 3.3 Lint passes: `npm run lint` — 53a447b
- [x] 3.4 Local smoke passes: `npm run smoke` — 53a447b

#### Manual

- [x] 3.5 `/prywatnosc` in `en` and `uk` shows the courtesy note and no Polish; `pl` is word for word the current notice — 53a447b
- [x] 3.6 `/zgoda` in `en` and `uk` shows the translation and the Polish original — 53a447b

### Phase 4: Verification and rollout

#### Automated

- [x] 4.1 Local smoke passes with the new checks: `npm run smoke` — 50497c4
- [ ] 4.2 CI is green on the PR: `ci`, `smoke`

#### Manual

- [ ] 4.3 Staging: the four pages read correctly in each language
- [ ] 4.4 The owner has read the English and Ukrainian texts, or accepts shipping them unread
