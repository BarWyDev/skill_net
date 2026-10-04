# Crisis Team Templates — Plan Brief

> Full plan: `context/changes/crisis-team-templates/plan.md`

## What & Why

Roadmap S-10 (FR-014). A coordinator on an active crisis should be able to say "złóż mi 3 zespoły ewakuacyjne" and get teams assembled from the crisis's ranked list, instead of building them by hand from `Osoba #N` rows. The templates come from the seed spec (`docs/shape_not.md:103-112`).

## Starting Point

S-03 writes a ranked snapshot per crisis. Its `matched_skills` holds only the crisis matrix's skills, so roles such as "osoba silna fizycznie" are invisible in it. Other residents' skills are owner-only under RLS. The coordinator sees pseudonymous `Osoba #<position>` rows with availability and phone badges. There are no templates in the code or the database, and there is no unit-test runner.

## Desired End State

From an active crisis, the coordinator opens "Złóż zespoły", picks one of 4 templates and a count (1–10), and sees:
- the complete teams first, with the most complete teams possible and better-ranked people preferred;
- at most one partial team after them, with each missing role marked "brak".

Each member appears in only one slot, with the same badges as the main list. Nothing is stored. Re-requesting recomputes from the snapshot and the residents' current skills.

## Key Decisions Made

| Decision           | Choice                                                                  | Why (1 sentence)                                                                                    |
| ------------------ | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Candidate pool     | Snapshot members only, with roles filled from all their current skills  | Teams stay a subset of the list the coordinator already sees, with the same `Osoba #N`.             |
| Role assignment    | Maximise filled slots (a matching), not greedy in role order            | A doctor who also drives isn't wasted as the medic when someone else could be the medic.             |
| Several teams      | Maximise complete teams globally, then the lowest sum of positions      | Never shows a partial team that a different split would have completed.                              |
| Unfillable request | Complete teams first, then at most one partial team marked "niepełny"   | The coordinator sees exactly which role is missing and can fill it by phone.                         |
| Template scope     | All 4 seeded templates on any crisis                                    | The seed spec ties templates to scenarios, not to crisis types.                                      |
| Role → skills      | Same as the crisis matrix: first aid counts as a medic, a licence as a driver | One meaning of "medyk" across the product, and pilot teams can still fill.                      |
| Availability       | Ignored when choosing, shown as a badge                                 | Consistent with S-06; confirmed availability (S-07) plugs in later.                                  |
| Persistence        | Computed on demand from a GET URL, nothing stored                       | No new table linking residents to an incident, and nothing for `end_crisis` or S-14 to clean up.     |
| Solver location    | Pure TS module, tested with `node --test`; the RPC only supplies eligibility | The matching algorithm stays readable and unit-tested, with no new dependency.                  |

## Scope

**In scope:**
- 3 template reference tables and a seed of 4 templates
- the security-definer `get_team_candidates` RPC, with a pgTAP suite
- the `assembleTeams` solver with unit tests, `npm run test:unit` and a CI step
- DTOs and the service, the `/koordynator/kryzys/<id>/zespoly` page, the entry link and smoke checks

**Out of scope:**
- saved or editable rosters, and custom or per-crisis-type templates
- people outside the snapshot
- choosing by availability, minimum skill levels, and an "own vehicle" skill
- team compactness, mixed templates, and contacting teams

## Architecture / Approach

The GET page validates `szablon` and `liczba`, then `assembleCrisisTeams`:

1. It calls `get_team_candidates`. The RPC checks the coordinator, an active crisis, the template and the count, then returns the snapshot members who qualify for at least one role, using their current `profile_skills`. Each role keeps its first `teams × slots` members by position, with no `user_id`.
2. It runs `assembleTeams`, a min-cost max-flow with cost = position:
   - it finds the largest k whose k teams can all be completed;
   - it takes the cheapest assignment at that k and deals people to teams by rank;
   - it builds at most one partial team from the people left over.
3. The page renders the result server-side.

## Phases at a Glance

| Phase       | What it delivers                                             | Key risk                                                                                 |
| ----------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| 1. Database | Template tables and seed, `get_team_candidates`, pgTAP, types | A grant slip exposes other residents' skills; a wrong per-role bound drops valid candidates. |
| 2. Solver   | `assembleTeams`, `node:test` cases, `test:unit` in CI        | Algorithm bugs: building teams one at a time, non-determinism; CI Node version for TS stripping. |
| 3. App      | Service, DTOs, `zespoly` page, entry link, smoke checks      | UI that makes a partial team look ready to deploy.                                       |

**Prerequisites:** S-03 and S-04 merged (done); local Supabase via Docker; the Phase 1 migrations pushed to production before the Phase 3 PR merges.
**Estimated effort:** ~2–3 sessions across 3 phases.

## Open Risks & Assumptions

- **The pool is limited to the crisis matrix.** In a power outage, medics aren't in the snapshot, so the medic slot of an evacuation team stays "brak". This follows from the snapshot-only decision. The page says so, but coordinators may expect otherwise.
- **"Kierowca z pojazdem" means "has a licence".** A driver may turn up without a car.
- **Teams can change between reloads** when residents edit their skills, because nothing is stored.
- **The bound** (each role keeps its first `teams × S` candidates by position) is exact only while the RPC and the solver agree on S and on cost = position. The tests pin both.
- **`node --test` is a second test command** ahead of Module 3's testing strategy, and CI needs Node ≥ 22.18 to strip TypeScript.

## Success Criteria (Summary)

- A coordinator gets N template teams in one request on an active crisis, with complete teams first and any gap shown by role.
- No person appears twice. A multi-skilled person is placed so that the number of complete teams is as high as possible.
- No identity or skill data reaches a non-coordinator, and nothing about team assembly is stored.
