# Coordinator Area Translations Implementation Plan

## Overview

Roadmap S-20 (FR-021). A coordinator can use `/koordynator` and crisis mode (activation, exercises, ranked list, coverage, teams, break-glass contacts, ending a crisis) in English or Ukrainian. Crisis types, team templates, role names, exercise names and skill names appear in that language. This is the last area of the interface that is still Polish only.

## Current State Analysis

S-18 built the language machinery; S-19 translated the resident area and switched production's `ENABLED_LOCALES` to `pl,en,uk` (reaching production with the next promotion). The coordinator area is still Polish literals:

- Pages: `src/pages/koordynator/index.astro`, `koordynator/kryzys/[id].astro`, `[id]/zespoly.astro`, `[id]/kontakty.astro`.
- Components: `src/components/crisis/CrisisActivationForm.tsx` (island; passes `locale="pl"` to `LocationPicker`), `CrisisCoverage.astro`, `CrisisFacts.astro`, `EndCrisisDialog.astro`, `PersonStatus.astro`, `SkillList.astro` (reads the Polish `LEVEL_LABELS` export of `SkillsPicker.tsx`).
- Endpoints: `src/pages/api/koordynator/kryzysy.ts`, `cwiczenia.ts`, `kryzysy/[id]/zakoncz.ts`.
- Server and shared messages: `src/lib/services/crisis.ts` (RPC error maps for activate, end, reveal, teams; `EXERCISE_NO_REVEAL_MESSAGE`), `src/lib/validation/crisis.ts`, `src/lib/reason.ts` (also used in the island), `src/lib/crisis-format.ts` (Polish plurals, `pl-PL` dates and numbers, "okolice"), `src/lib/crisis-coverage.ts` (`joinNames` with "i"), `src/lib/visibility.ts` (`declinedVerb`), `src/lib/availability.ts` (`formatAvailabilitySummary`, `DAY_LABELS`, `SLOT_NAMES`).
- Names from the database are Polish only (`name_pl`): 6 crisis types (`20261001120100_seed_crisis_matrix.sql`), 4 team templates and their roles (`20261004140100_seed_team_templates.sql`), 5 exercise scenarios (only in `supabase/seed.sql`, so local and staging). Skill names on the crisis pages come from `getSkillNames` (the `skills` table) with the slug as fallback.
- The smoke test has no coordinator account (`scripts/smoke.mjs:409`); it asserts only statuses and redirects on coordinator routes.

## Desired End State

With `skillnet_lang=en` or `uk`, every string on the four coordinator pages, every notice after a coordinator POST, the activation form, and every crisis type, template, role, exercise and skill name is in that language. Dates, times, distances and counts follow the language. Text typed by a coordinator (activation and break-glass reasons) and the stored reason of an exercise stay as written. A name missing from a catalogue shows the Polish database name, never a key or an empty label. With Polish, every page reads exactly as today. The ranked list still loads within the 3-second budget: no query is added.

Verify: `npm run test:unit`, `npx astro check`, `npm run lint`, `npm run smoke` locally, then a walk through the coordinator area in each language locally and on staging with a coordinator account.

### Key Discoveries:

- Pattern from S-19: `src/lib/i18n/messages/taxonomy.ts:147` `categoryName` / `skillName(locale, slug, databaseName)` (Polish shows the database name; another language falls back to it). `src/lib/i18n/taxonomy.test.ts` checks the catalogue against the seed migration.
- `src/lib/i18n/format.ts` already has `format`, `plural` (one/few/many/other) and `formatDateTime(locale, iso)` on the Europe/Warsaw clock, the same as `formatActivatedAt` today.
- `src/lib/i18n/catalogues.test.ts` checks every file in `messages/` for equal keys, no empty text and equal placeholders; catalogues hold only strings.
- `src/lib/i18n/messages/profile.ts` already has day labels, slot names and the three level labels in all languages; the coordinator code reuses them instead of the Polish exports.
- `CrisisDTO.typeName` and `CrisisScenarioDTO` are built from joined `crisis_types(name_pl)` with no slug; the selects in `services/crisis.ts` must add the slug so names can be translated.
- "Supabase nie jest skonfigurowany." on the pages reuses the existing `auth.notConfigured` message, as in S-19.

## What We're NOT Doing

- No database migration and no `name_en` / `name_uk` columns. Names come from a catalogue keyed by slug.
- No translation of text typed by people: activation and break-glass reasons stay as typed. An exercise's reason stays Polish, as it is stored in `crises.reason`.
- No change to RPCs, error codes, form field names, redirect targets or HTTP statuses.
- No coordinator account in the smoke test; the coordinator pages are checked by unit tests and by hand.
- No special handling for Ukrainian on the crisis path: it ships with English, as in S-19, and the owner reads or accepts the texts in phase 4.
- No emails (S-21). The config banner stays Polish.

## Implementation Approach

One new catalogue, `src/lib/i18n/messages/crisis.ts`, holds the coordinator copy and the names by slug. Formatting and validation functions that produce text take `locale` as their first or last argument (following the S-19 signatures); endpoints pass `context.locals.locale`; Astro components read `Astro.locals.locale`; the island gets `locale` as a prop. Each Polish string moves into the catalogue verbatim, and existing Polish tests keep passing unchanged except for the new argument. Phases 1 to 3 each translate one part of the area and land as their own PR, stacked; phase 4 removes Polish exports nobody uses any more and updates the docs.

## Critical Implementation Details

- **Polish must not change.** Move strings verbatim. `joinNames` may switch to `Intl.ListFormat(locale, { type: "conjunction" })` only if the Polish output stays `a, b i c`; a test pins it.
- **Fallback chain for names.** Crisis types, templates, roles, scenarios: catalogue by slug, then `name_pl`. Skills on the crisis pages: `skillName(locale, slug, names.get(slug) ?? slug)`, so the catalogue wins, then the Polish database name, and the slug only when both are missing. `getSkillNames` stays, in parallel as today, so the 3-second path gets no new query.
- **Break-glass stays robust.** In `revealCrisisContacts`, nothing after the logged reveal may throw: translation of names must not add a failure path there.

## Phase 1: Catalogue and coordinator panel

### Overview

The crisis catalogue, the locale-aware formatting and validation, and `/koordynator` with the activation form and exercises.

### Changes Required:

#### 1. Crisis catalogue

**File**: `src/lib/i18n/messages/crisis.ts` (new), `src/lib/i18n/crisis.test.ts` (new)

**Intent**: All coordinator copy (panel, crisis page, teams, contacts, end dialog, notices, RPC and validation messages, formatting words) plus names by slug for crisis types, team templates, team roles (keyed `template/role`, since a role slug repeats across templates) and exercise scenarios. Phases 2 and 3 fill in their sections; phase 1 adds the names and the panel's sections.

**Contract**: exports `pl`, `en`, `uk`, `crisis`, and `crisisTypeName`, `teamTemplateName`, `teamRoleName`, `scenarioName`, each `(locale, slug(s), databaseName): string` with the `skillName` rules. The test asserts the slugs equal those in the two seed migrations and in `supabase/seed.sql`.

#### 2. Shared formatting and rules with a language

**File**: `src/lib/crisis-format.ts`, `src/lib/reason.ts`, `src/lib/availability.ts`, `src/lib/crisis-coverage.ts`, and their tests

**Intent**: Every function that returns text takes `locale` and reads the catalogue: `formatActivatedAt` (through `formatDateTime`), `formatDistanceKm` (decimal separator by language), `formatPeople` and `matchedWord` (through `plural`), `formatCrisisTitle`, `formatActiveFor`, `availabilityStatus`, `reasonProblem` and the two reason messages, `formatAvailabilitySummary` (day and slot names from the profile catalogue), `joinNames`. Relative imports only, so `node:test` loads them.

**Contract**: `locale: Locale` added to each; the Polish output is unchanged (existing tests pass with `"pl"`); new cases per language for plurals (1, 2, 5, 22), "< 0.5 km", list joining and an availability summary.

#### 3. Validation and services

**File**: `src/lib/validation/crisis.ts`, `src/lib/services/crisis.ts`, `src/pages/api/koordynator/kryzysy.ts`, `src/pages/api/koordynator/cwiczenia.ts`

**Intent**: Activation and exercise messages follow the request's language; lists carry slugs so pages can translate names.

**Contract**: `parseCrisisForm(form, locale)`, `activateErrorMessage(error, locale)`, `activateCrisis(supabase, input, locale)`, `startScenario(supabase, slug, locale)`. `CrisisDTO` gains `typeSlug`; `CrisisScenarioDTO` gains `typeSlug`; `CrisisTypeDTO` keeps `slug` (in `src/types.ts`). Redirects and flash mechanics unchanged.

#### 4. Panel page and activation form

**File**: `src/pages/koordynator/index.astro`, `src/components/crisis/CrisisActivationForm.tsx`

**Intent**: Catalogue reads for every literal, names translated before rendering or before reaching the island; the island passes its `locale` to `LocationPicker` and to `reasonProblem`.

**Contract**: `CrisisActivationForm` gains `locale: Locale`. Field names and values unchanged.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test:unit`
- Type check passes: `npx astro check`
- Lint passes: `npm run lint`
- Build passes: `npm run build` (to a scratch `--outDir`)
- Local smoke passes: `npm run smoke`

#### Manual Verification:

- `/koordynator` in `en` and `uk` shows no Polish outside typed reasons; activating a crisis with a bad reason, a valid activation and starting an exercise each show copy and notices in that language
- `/koordynator` in `pl` reads as before

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human before proceeding to the next phase.

---

## Phase 2: Crisis page

### Overview

`/koordynator/kryzys/[id]`: the ranked list, coverage, facts, ending a crisis.

### Changes Required:

#### 1. Components

**File**: `src/components/crisis/CrisisFacts.astro`, `CrisisCoverage.astro`, `SkillList.astro`, `PersonStatus.astro`, `EndCrisisDialog.astro`

**Intent**: Catalogue reads through `Astro.locals.locale`; `SkillList` takes level labels from the profile catalogue instead of `LEVEL_LABELS`.

**Contract**: props unchanged.

#### 2. Page, service and endpoint

**File**: `src/pages/koordynator/kryzys/[id].astro`, `src/lib/services/crisis.ts`, `src/pages/api/koordynator/kryzysy/[id]/zakoncz.ts`

**Intent**: Page copy from the catalogue; skill names on the list and in coverage translated with the fallback chain; end-crisis messages follow the language.

**Contract**: `getCrisisMatches(supabase, id, locale)`, `getCrisisCoverage(supabase, id, locale)`, `endCrisis(supabase, id, locale)`. The endpoint's redirect target is unchanged.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test:unit`
- Type check passes: `npx astro check`
- Lint passes: `npm run lint`
- Build passes: `npm run build` (to a scratch `--outDir`)
- Local smoke passes: `npm run smoke`

#### Manual Verification:

- An active crisis in `en` and `uk`: the list, coverage, availability and skill names read in that language; the list appears without a noticeable delay; ending the crisis shows the notice in that language
- The same crisis in `pl` reads as before

**Implementation Note**: Pause for manual confirmation before the next phase.

---

## Phase 3: Teams and contacts

### Overview

`…/zespoly` and the break-glass page `…/kontakty`.

### Changes Required:

#### 1. Teams

**File**: `src/pages/koordynator/kryzys/[id]/zespoly.astro`, `src/lib/validation/crisis.ts`, `src/lib/services/crisis.ts`

**Intent**: Page copy, template and role names, team request and RPC messages in the request's language.

**Contract**: `parseTeamRequest(params, locale)`, `getTeamTemplates(supabase, locale)` (names translated with the fallback chain), `assembleCrisisTeams(supabase, crisisId, template, count, locale)`.

#### 2. Contacts

**File**: `src/pages/koordynator/kryzys/[id]/kontakty.astro`, `src/lib/validation/crisis.ts`, `src/lib/services/crisis.ts`, `src/lib/visibility.ts`

**Intent**: The warning, the reason form, the reveal result and every refusal follow the language; skill names on revealed contacts are translated without a new failure path.

**Contract**: `parseRevealReason(form, locale)`, `revealCrisisContacts(supabase, id, reason, locale)`, the exercise refusal message from the catalogue, `declinedVerb(locale, n)`. HTTP statuses unchanged.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test:unit`
- Type check passes: `npx astro check`
- Lint passes: `npm run lint`
- Build passes: `npm run build` (to a scratch `--outDir`)
- Local smoke passes: `npm run smoke`

#### Manual Verification:

- In `en` and `uk`: assembling teams (complete and partial), a bad team count, a reveal with a too-short reason, a successful reveal, and the exercise refusal each read in that language
- Both pages in `pl` read as before

**Implementation Note**: Pause for manual confirmation before the next phase.

---

## Phase 4: Clean-up and rollout

### Overview

Remove the Polish-only exports nothing uses any more, update the docs, and check the whole area on staging.

### Changes Required:

#### 1. Dead Polish exports

**File**: `src/lib/availability.ts`, `src/lib/phone.ts`, `src/lib/postcode.ts`, `src/components/profile/SkillsPicker.tsx`, `src/lib/i18n/messages/taxonomy.ts`

**Intent**: Remove exports and comments left only for the coordinator code ("translated with S-20", "wait for S-20"), after a grep shows no remaining user. `POSTCODE_ERROR` stays while `src/pages/api/kody-pocztowe/index.ts` uses it.

**Contract**: no behaviour change.

#### 2. Documentation

**File**: `CLAUDE.md`, `README.md`, `context/foundation/roadmap.md`

**Intent**: The convention no longer exempts `/koordynator/**` and `src/components/crisis/**`; every area of the interface is translated except the config banner.

**Contract**: prose only.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test:unit`
- Type check and lint pass: `npx astro check`, `npm run lint`
- Local smoke passes: `npm run smoke`
- CI is green on each PR: `ci`, `smoke`

#### Manual Verification:

- Staging: the coordinator area reads correctly in each language with a coordinator account
- The owner has read the English and Ukrainian texts, or accepts shipping them unread

---

## Testing Strategy

### Unit Tests:

- `catalogues.test.ts` covers `crisis.ts` without changes.
- `crisis.test.ts`: the name catalogues have exactly the seeded slugs; Polish shows the database name; a missing slug falls back to it.
- `crisis-format.test.ts`, `reason.test.ts`, `crisis-coverage.test.ts`: existing Polish cases with `"pl"`, plus plurals, distances, list joining and reason messages in `en` and `uk`.
- A test for `formatAvailabilitySummary` in each language.

### Manual Testing Steps:

1. Locally with `ENABLED_LOCALES=pl,en,uk`, grant the coordinator role to a test account (as in the coordinator-role-grant change), switch to EN, activate a crisis and start an exercise.
2. Open the crisis: list, coverage, teams (complete and partial), reveal with a bad and a good reason; end the crisis.
3. Repeat in UA and check the Cyrillic text fits the list columns and buttons.
4. Switch to PL and compare with staging before the change.

## Performance Considerations

Catalogues are static modules; translation is a lookup per name. No query is added to the ranked-list path, so the 3-second budget is unaffected.

## Migration Notes

No migration. The area reaches production with the next promotion after the phase PRs merge; production already offers the three languages once S-19 is promoted.

## References

- Roadmap S-20: `context/foundation/roadmap.md`
- S-19 plan: `context/changes/resident-area-translations/plan.md`
- Pattern: `src/lib/i18n/messages/taxonomy.ts:147`, `src/lib/i18n/format.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Catalogue and coordinator panel

#### Automated

- [x] 1.1 Unit tests pass: `npm run test:unit` — 128c01e
- [x] 1.2 Type check passes: `npx astro check` — 128c01e
- [x] 1.3 Lint passes: `npm run lint` — 128c01e
- [x] 1.4 Build passes: `npm run build` (to a scratch `--outDir`) — 128c01e
- [x] 1.5 Local smoke passes: `npm run smoke` — 128c01e

#### Manual

- [x] 1.6 `/koordynator` in `en` and `uk` shows no Polish outside typed reasons; activation and exercise notices follow the language — 128c01e
- [x] 1.7 `/koordynator` in `pl` reads as before — 128c01e

### Phase 2: Crisis page

#### Automated

- [x] 2.1 Unit tests pass: `npm run test:unit` — 8b7fd73
- [x] 2.2 Type check passes: `npx astro check` — 8b7fd73
- [x] 2.3 Lint passes: `npm run lint` — 8b7fd73
- [x] 2.4 Build passes: `npm run build` (to a scratch `--outDir`) — 8b7fd73
- [x] 2.5 Local smoke passes: `npm run smoke` — 8b7fd73

#### Manual

- [x] 2.6 An active crisis in `en` and `uk` reads in that language, the list loads without delay, ending shows a translated notice — 8b7fd73
- [x] 2.7 The same crisis in `pl` reads as before — 8b7fd73

### Phase 3: Teams and contacts

#### Automated

- [ ] 3.1 Unit tests pass: `npm run test:unit`
- [ ] 3.2 Type check passes: `npx astro check`
- [ ] 3.3 Lint passes: `npm run lint`
- [ ] 3.4 Build passes: `npm run build` (to a scratch `--outDir`)
- [ ] 3.5 Local smoke passes: `npm run smoke`

#### Manual

- [ ] 3.6 Teams and break-glass in `en` and `uk`: every outcome reads in that language
- [ ] 3.7 Both pages in `pl` read as before

### Phase 4: Clean-up and rollout

#### Automated

- [ ] 4.1 Unit tests pass: `npm run test:unit`
- [ ] 4.2 Type check and lint pass: `npx astro check`, `npm run lint`
- [ ] 4.3 Local smoke passes: `npm run smoke`
- [ ] 4.4 CI is green on each PR: `ci`, `smoke`

#### Manual

- [ ] 4.5 Staging: the coordinator area reads correctly in each language
- [ ] 4.6 The owner has read the English and Ukrainian texts, or accepts shipping them unread
