# Data Visibility Controls — Plan Brief

> Full plan: `context/changes/data-visibility-controls/plan.md`
> Accepted matrix: `context/changes/data-visibility-controls/visibility-matrix-proposal.md`

## What & Why

Roadmap S-12 (FR-006): a resident chooses which of their data is visible, and in which mode. In everyday mode nobody sees an individual resident; the only exposure is the aggregated map. So FR-006 comes down to four switches: map contribution (V1), crisis use of each skill (V2), availability shown to the coordinator (V3) and consent to a break-glass number reveal (V4).

## Starting Point

One rule, `profile_is_matchable`, governs both crisis ranking and the density map. Active crises read a frozen snapshot through three RPCs and one computed count, all of which already filter paused residents at read time (S-13). `/profil` has one React form saved by `save_my_profile`. The contacts page derives "bez telefonu" by subtraction.

## Desired End State

On `/profil` each skill has a "Używaj w kryzysie" checkbox, and a "Widoczność danych" section holds V1, V3 and V4, all saved by "Zapisz". The switches apply immediately in active crises (list, teams, counts, break-glass), in every new crisis and, from the next day, on the map. The coordinator sees how many people declined a reveal, and the notice and consent version describe the new choices.

## Key Decisions Made

| Decision                         | Choice                                                           | Why (1 sentence)                                                                 | Source |
| -------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------ |
| Switches and defaults            | V1–V4, all on                                                    | Signup consent covers these purposes, and the product's job is matching.          | Matrix D1, D2 |
| Hidden skill                     | Excluded from matching, score, teams; still counted on the map   | "Hidden = not used" stops ranking from leaking it; the map has its own switch.   | Matrix D4, D5 |
| Mid-crisis change                | Effective at read time; position stays from activation           | The same mechanism as pause; no re-scoring.                                       | Matrix D6 |
| Declined reveal                  | Count only, before and after the reveal                          | The coordinator knows what to expect, and the counts add up, without naming anyone. | Matrix D3 + Plan |
| Audit / consent                  | No log of switch changes; new consent version                    | Settings are not data access; the notice wording changes.                         | Matrix D7, D8 |
| Eligibility split                | New `profile_counts_on_map`; `matchable` needs a crisis skill    | Otherwise hiding every skill from crises would also remove the person from the map. | Plan |
| Teams                            | Always a subset of the visible list                              | Role skills outside the matrix must not bring back a hidden person.               | Plan |
| UI placement                     | Inside the existing profile form, one "Zapisz"                   | The per-skill flag must travel through `save_my_profile` anyway.                  | Plan |
| Sign-in redirect                 | `/profil` only if incomplete or paused                           | A deliberate "hide all" choice is not nagged at every sign-in.                    | Plan |

## Scope

**In scope:**
- Four boolean columns and their defaults.
- Map/crisis eligibility split.
- Filters in `activate_crisis`, `get_crisis_matches`, `get_team_candidates`, `reveal_crisis_contacts` and `visible_match_count`.
- New `reveal_declined_count`.
- `save_my_profile` and `get_my_profile`.
- A new consent version.
- `/profil` UI, the sign-in redirect, the contacts page and `/prywatnosc`.
- A pgTAP suite and unit tests.

**Out of scope:**
- Visibility to other residents and names.
- Switches for email, location, level or pause.
- An immediate map update.
- Re-ranking active crises.
- An audit log of switch changes.
- S-07 and S-08 work beyond stating their contract.

## Architecture / Approach

This follows the S-13 pause pattern: state on `profiles` and `profile_skills`, pure SQL predicates, and filters at read time. One helper, `crisis_visible_skills`, defines "row visible in a crisis" for every reader, so the list, teams, counts and break-glass can never disagree. Break-glass keeps its "logged = returned" single-statement invariant. The app follows the existing form → zod → service → RPC chain.

## Phases at a Glance

| Phase          | What it delivers                                                        | Key risk                                                              |
| -------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 1. Database    | Migration, predicates, five readers, computed count, profile RPCs, consent row, types, pgTAP | Readers drifting apart; breaking the reveal "logged = shown" invariant |
| 2. Application | `/profil` switches and banner, sign-in redirect, contacts counts, notice and consent version | Deploying code before the migration push (`consent_required`)          |

**Prerequisites:** S-06 and S-13 done (both are), local Supabase in Docker, and a production `db push` before merging phase 2.
**Estimated effort:** ~2 sessions across 2 phases.

## Open Risks & Assumptions

- The new consent version re-asks every existing resident on `/zgoda` once (accepted as D8).
- After a mid-crisis V2 change, order can look odd: a high position with only a supporting skill visible. This was accepted in D6. Revisit if pilot coordinators find it confusing.
- S-07 must alert only through `profile_is_matchable` and on `use_in_crisis` skills. Carry this into S-07's plan.
- The legal review of `/prywatnosc` before the pilot may change the defaults (D1).

## Success Criteria (Summary)

- A resident can switch off map contribution, crisis use per skill, availability display and the emergency reveal from `/profil` on a phone, and each switch takes effect where the matrix says.
- No coordinator view (list, teams, counts, reveal) shows anything a resident hid, and the counts on the contacts page add up.
- All DB suites, unit tests, lint, type check, build and smoke pass.
