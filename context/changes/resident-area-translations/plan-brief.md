# Resident Area Translations — Plan Brief

> Full plan: `context/changes/resident-area-translations/plan.md`

## What & Why

FR-021 asks for English and Ukrainian so that residents who do not read Polish can register and be found in a crisis. S-18 translated the public pages and sign-up. This change (roadmap S-19) translates what a resident uses after signing in: the profile, the courses, the consent gate and the privacy notice, with skill names.

## Starting Point

The language machinery exists: the middleware resolves `Astro.locals.locale`, catalogues live in `src/lib/i18n/messages/`, and category names are already translated by slug. The four resident pages, 13 components and the server messages behind 14 endpoints are still Polish literals. Production offers Polish only.

## Desired End State

A resident who picks EN or UA sees the profile, the courses, the consent gate and the privacy notice in that language, including skill names, notices after saving and dates. What residents typed themselves stays as typed. The two legal texts say they are translations and that the Polish original is binding. Polish pages are unchanged. Production offers all three languages.

## Key Decisions Made

| Decision                      | Choice                                                    | Why (1 sentence)                                                              | Source  |
| ----------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------- | ------- |
| Skill names                   | Catalogue keyed by slug, Polish database name as fallback | No migration, and the same pattern as categories in S-18.                     | Plan    |
| Language cookie in the notice | Not added now                                             | The Polish wording stays, so nobody is asked to consent again.                | Plan    |
| Production languages          | `pl,en,uk` in the last PR                                 | The owner chose to ship the roadmap's outcome in full.                        | Plan    |
| Delivery                      | Four phases, one PR each                                  | Small reviews; each area is checked on staging on its own.                    | Plan    |
| Legal texts                   | Courtesy translation; Polish binding                      | One consent version.                                                          | Roadmap |
| Course skill names            | Translated through the taxonomy loaded by the page        | The course RPCs return Polish names without slugs; this avoids changing them. | Plan    |
| Residents' own text           | Left as written                                           | It is their content, not interface copy.                                      | Roadmap |

## Scope

**In scope:**

- `/profil`, `/kursy`, `/zgoda`, `/prywatnosc` and their components and islands
- Validation and database error messages for these pages
- Skill names in English and Ukrainian
- Dates in the chosen language
- Smoke checks, docs, production `ENABLED_LOCALES`

**Out of scope:**

- Coordinator area and crisis mode (S-20)
- Emails and the language stored on the account (S-21)
- Any migration, any change to the Polish legal wording or the consent version

## Architecture / Approach

Three new catalogues (`profile`, `courses`, `legal`) and skill names in `taxonomy`. Server functions that return a message take `locale`; endpoints pass `context.locals.locale`; islands take `locale` as a prop. Polish strings move verbatim, and a unit test pins a hash of the Polish legal texts so they cannot drift without a new consent version.

## Phases at a Glance

| Phase                       | What it delivers                                      | Key risk                                         |
| --------------------------- | ----------------------------------------------------- | ------------------------------------------------ |
| 1. Profile                  | `/profil`, its notices, skill names, date format      | A Polish string changes while moving             |
| 2. Courses                  | `/kursy` and its eight endpoints                      | Course skill names arrive without slugs          |
| 3. Consent and privacy      | `/zgoda`, `/prywatnosc` with the courtesy note        | The Polish legal wording must stay word for word |
| 4. Verification and rollout | Smoke checks, docs, production offers three languages | Ukrainian ships without a native reader          |

**Prerequisites:** S-18 on `master` (done).
**Estimated effort:** about 4 sessions, one per phase.

## Open Risks & Assumptions

- The Ukrainian text is written by the implementer; the owner chose to enable it on production without waiting for a native reader (Open Roadmap Question 13).
- The data-protection officer has not confirmed the courtesy-translation approach.
- Until S-20, a coordinator who picks English sees a Polish coordinator area under an English header.
- S-07 and S-08 branches touch `/profil`-adjacent files (phone, alerts); whichever lands second rebases.

## Success Criteria (Summary)

- A resident can complete their profile and run or join a course in English or Ukrainian without meeting Polish interface text.
- With Polish selected, nothing changes, and the smoke test passes.
- The consent version is unchanged.
