# Crisis Activation and Ranked List — Plan Brief

> Full plan: `context/changes/crisis-activation-ranked-list/plan.md`

## What & Why

Roadmap S-03 is the north star: a coordinator activates crisis mode (type, epicentre, radius) and, within 3 s, sees residents matched to that crisis type, ranked by a weighted score. The PRD's primary success criterion ("a simulated crisis on real registrations gives ≥ N matched people") becomes measurable here. It is also the first thing a real coordinator can give feedback on.

## Starting Point

Residents already store skills with levels 1–3 and a location coarsened to a 500 m cell, behind GIST and skill indexes. `profile_is_matchable()` and `is_coordinator()` were built for this slice to reuse. `/koordynator` is a role-gated placeholder. The matrix of 6 crisis types exists only as prose in `docs/shape_not.md`. There are no crisis tables, no phone numbers and no confirmations.

## Desired End State

On `/koordynator`, a coordinator picks a crisis type, sets an epicentre by map pin or postcode, and picks a 1/2/5/10/20 km radius. They land on a crisis page with the total match count and up to 200 rows. Each row shows the place (ties share it), "Osoba #N", the matched skills with tier and level, and the distance rounded to 0.5 km. All coordinators see all active crises. Residents get 403, anonymous visitors go to sign-in, and the database refuses non-coordinators on its own.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Skill-match component | Best matched skill, plus +0.05 per extra skill (cap +0.10) | A professional beats someone who ticked many boxes, and versatility still counts (A `elektryk:3` 0.468 > B 0.45) |
| Skills without a level | Count as level 2 | Equipment neither sinks below a basic course nor jumps over a professional |
| Ties | Shared place (1, 2, 2, 4), with stable per-crisis order by hash | The list doesn't claim a difference that isn't there, and nobody is favoured by id or signup age |
| Concurrency | Many active crises, one record each | Fits PRD OQ9, and S-04 deactivates a specific crisis |
| List persistence | Snapshot written at activation, in the same transaction | An audit of who was shown, a stable recipient set for S-07, and a cascade on unregister |
| Row content | Pseudonym, the "why" (skills, tier, level), distance rounded to 0.5 km, no score | Answers the PRD's "opaque score" objection without identity or coordinates |
| Weights | Provisional per-type table, availability 0.20 reserved | Encodes the spec's rule (flood: distance, mass casualty: skills), and S-07 won't reshuffle the other weights |
| Size | Snapshot keeps all matches, page shows 200 | "≥ N matched" is measurable directly, and the page stays inside 3 s |
| Input | `LocationPicker` (pin or postcode) plus radius presets | The postcode path is local, so it works without map tiles (NFR) |
| Visibility | All coordinators see all crises | Shift handover inside one municipality's pilot |
| Cold start | Local synthetic seed only (about 500 around Kraków) | A reproducible demo and perf check, with no fake people in production |
| Matrix mapping | Narrow reading with explicit exceptions (table in the plan) | Priority doesn't dilute into related skills |

## Scope

**In scope:** 4 tables (`crisis_types`, `crisis_type_skills`, `crises`, `crisis_matches`), the matrix and weights seed, the `activate_crisis` and `get_crisis_matches` security-definer RPCs, RLS and revokes, a pgTAP suite, the local seed and perf script, the README demo runbook, the activation form and active-crises list, the crisis page, the middleware prefix and smoke steps.

**Out of scope:** alerts and confirmation (S-07, S-08), phone and contact reveal (S-06, S-09), deactivation (S-04), re-ranking or late joiners, team templates (S-10), the LLM field, ad-hoc search, matrix editing, coarsening correction at the radius edge, double-booking across crises and alert caps, and production demo data.

## Architecture / Approach

POST `/api/koordynator/kryzysy` (middleware gate, then a zod parse) calls the `activate_crisis` RPC. It is security definer: it checks `is_coordinator()`, resolves the epicentre, then in one transaction inserts the crisis and the ranked snapshot using `st_dwithin` on the GIST index. The response redirects to `/koordynator/kryzys/<id>`, which reads `crises` (RLS: coordinators) and `get_crisis_matches` (display-ready rows, no `user_id`, distance rounded inside the database). Clients have no privileges on `crisis_matches`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Crisis schema, matrix and ranking | Migrations, RPCs, RLS, pgTAP proving the rule and the boundary, types | A missed default `execute` or table grant exposes personal data |
| 2. Demo data and performance check | `seed.sql` (about 500 residents), perf script on 20k, README runbook | The query plan doesn't use the GIST index, so the 3 s budget is at risk |
| 3. Activation and ranked list UI | Form, panel, crisis page, endpoint, middleware prefix, smoke | Merging before the migrations are in production breaks the live panel |

**Prerequisites:** S-01, S-02 and S-15 done. Local Supabase (Docker). The operator pushes the Phase 1 migrations to production before Phase 3 merges.
**Estimated effort:** about 3 sessions across 3 phases.

## Open Risks & Assumptions

- The weights and the matrix mapping are guesses until the pilot, so they are tuned by migration only.
- The radius is measured from coarsened points (±354 m at the edge). This is accepted.
- Nothing matches `rezerwista`, `zolnierz-wot` or `osoba-silna-fizycznie` in v1. S-10 will need the last one.
- N (PRD OQ2) is still unset, so the primary criterion can be demonstrated but not yet passed or failed.
- Distance plus a known epicentre narrows a resident to a ring. That is acceptable, because only coordinators see it and only during a crisis (the PRD guardrail).

## Success Criteria (Summary)

- A coordinator activates a crisis and sees a ranked, explainable list in ≤ 3 s, even without map tiles.
- pgTAP proves the ranking rule (tiers, the bonus cap, no-level skills, ties, the radius) and that residents and anonymous users can't activate or read anything.
- The demo runs reproducibly on local seed data in front of a coordinator.
