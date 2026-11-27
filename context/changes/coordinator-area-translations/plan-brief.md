# Coordinator Area Translations — Plan Brief

> Full plan: `context/changes/coordinator-area-translations/plan.md`

## What & Why

Roadmap S-20 (FR-021): a coordinator can run the coordinator area and crisis mode in English or Ukrainian. It is the last Polish-only part of the interface, and the crisis path, so a missing translation must fall back to Polish, never to a key.

## Starting Point

S-18 built the language machinery and S-19 translated the resident area and set production to `pl,en,uk`. The four coordinator pages, six crisis components, three endpoints and the crisis libraries are still Polish literals; crisis types, templates, roles and exercises exist in the database in Polish only.

## Desired End State

With EN or UK chosen, the coordinator panel, activation, exercises, the ranked list, coverage, teams, break-glass contacts and ending a crisis read in that language, including every name. Typed reasons stay as typed. Polish reads exactly as today, and the ranked list keeps its 3-second budget.

## Key Decisions Made

| Decision                     | Choice                                            | Why (1 sentence)                                                          |
| ---------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------- |
| Names of types, teams, roles | Catalogue by slug, fallback to `name_pl`          | No migration, same pattern as skill names in S-19                         |
| Exercise scenarios           | Name from the catalogue, reason stays Polish      | The panel reads fully translated; the stored audit reason is one text     |
| Ukrainian on the crisis path | Ships with English, as in S-19                    | Same decision as the resident area; the Polish original is one click away |
| Phasing                      | 4 stacked PRs                                     | Small, reviewable pieces like S-19                                        |
| Testing                      | Unit tests plus manual walk; no smoke coordinator | Smoke needs no service key and keeps working against staging/production   |
| Skill name fallback          | Catalogue → Polish DB name → slug                 | Meets "never a key" without adding a query                                |

## Scope

**In scope:**

- Catalogue `src/lib/i18n/messages/crisis.ts` with copy and names by slug
- Locale-aware `crisis-format`, `reason`, `availability` summary, `crisis-coverage`, `visibility.declinedVerb`
- `services/crisis.ts`, `validation/crisis.ts` and the three coordinator endpoints
- The four pages and six components; the island gets `locale`
- Removing Polish exports nothing uses any more; docs

**Out of scope:**

- Migrations or new name columns; RPC, status or redirect changes
- Translating typed reasons or the stored exercise reason
- A coordinator account in the smoke test; emails (S-21); the config banner

## Architecture / Approach

One catalogue for the area. Text-producing functions take `locale`; endpoints pass `context.locals.locale`, Astro components read `Astro.locals.locale`, and `CrisisActivationForm` receives it as a prop. Names go through `crisisTypeName` / `teamTemplateName` / `teamRoleName` / `scenarioName` / `skillName`, which fall back to the Polish database name.

## Phases at a Glance

| Phase                   | What it delivers                                      | Key risk                                         |
| ----------------------- | ----------------------------------------------------- | ------------------------------------------------ |
| 1. Catalogue and panel  | Catalogue, locale-aware helpers, `/koordynator`, form | Shared helpers change signature for every caller |
| 2. Crisis page          | Ranked list, coverage, facts, ending a crisis         | The 3-second path; Polish output must not change |
| 3. Teams and contacts   | Teams and break-glass in three languages              | No new failure path after a logged reveal        |
| 4. Clean-up and rollout | Dead exports removed, docs, staging check             | Texts unread by a native Ukrainian speaker       |

**Prerequisites:** S-18 and S-19 merged to `master` (done); a local coordinator account for manual checks.
**Estimated effort:** ~3–4 sessions across 4 phases.

## Open Risks & Assumptions

- The open S-07 and S-08 branches touch the same pages; whichever lands second rebases.
- Exercise scenarios exist only in `seed.sql`; a scenario added later without a catalogue entry shows its Polish name.
- Ukrainian crisis vocabulary was not read by a native speaker.

## Success Criteria (Summary)

- A coordinator with EN or UK runs a crisis from activation to end without meeting Polish outside typed reasons
- Polish pages are unchanged, and the ranked list is as fast as before
