# Neighbour Courses — Plan Brief

> Full plan: `context/changes/neighbour-courses/plan.md`

## What & Why

Roadmap S-17 (FR-020) lets a resident offer a free course tied to one of their skills. Signed-in neighbours can find it and sign up in the app. The course gives residents an everyday reason to open SkillNet and keep their skills current (PRD insight 2). The PRD accepted the cost that a course reveals that someone with skill X lives nearby. In exchange, it narrowed the feature to no organiser identity, the place shown only as the map's 2 km square, and signed-in viewers only.

## Starting Point

The public map already turns residents into 2 km squares. It shows a square only when at least 5 eligible residents live there (k-anonymity: a square stays hidden until k people share it), plus noise and a 14-day account age rule. There is no channel to residents, and a chat was ruled out. `save_my_profile` deletes and re-inserts skills on every save. Pause and the map switch are checked when data is read, and unregistering hard-deletes by cascade.

## Desired End State

A protected `/kursy` page has three sections:

- **W okolicy:** open courses in the viewer's 3×3 block of squares, on a small map and in a list. A row shows the skill, title, description, duration and free places, never who.
- **Moje zapisy:** the viewer's sign-ups, with the organiser's free-text meeting details.
- **Moje kursy:** create, edit, close or reopen, renew and delete, with the sign-up count and why a course is hidden.

## Key Decisions Made

| Decision                | Choice                                                                                    | Why (1 sentence)                                                                                       |
| ----------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| "In the area"           | The viewer's square plus its 8 neighbours                                                 | Removes the edge effect (a course 300 m away in the next square) without allowing nationwide browsing. |
| Sparse squares          | Shown only if the square is in the map's all-skills snapshot (k = 5)                      | One anonymity rule across the product, and the snapshot already exists.                                |
| Pause / map switch      | Pause hides courses; the map switch does not                                              | D5: each switch does one thing, and pause means "not available".                                       |
| Who can take part       | Location, confirmed email, account ≥ 14 days, consent, for both creating and sign-up      | The map's anti-sybil rule (sybil: opening fake accounts to probe squares).                             |
| Location moves          | Courses only after the location has been unchanged for 7 days, for viewers and organisers | Stops anyone from moving the pin to browse other areas square by square (plan review F1).              |
| Meeting place and time  | A free-text field visible only to active sign-ups                                         | No new vendor and no chat; works before S-16.                                                          |
| Course end              | The organiser closes it; it also drops off after 90 days unless renewed                   | The list does not fill with abandoned courses, and no background job is needed.                        |
| Capacity                | Optional, 1–50; the course row is locked at sign-up                                       | Prevents over-booking, including the race for the last place.                                          |
| What the organiser sees | Only the count of active sign-ups                                                         | Mirrors the organiser's own anonymity.                                                                 |
| Abuse                   | 3 open courses per organiser, 10 sign-ups per hour, text rejects phone and email          | Stops spam and accidental contact leaks; moderation stays manual in Studio.                            |
| List row                | Skill and category, no level, no creation date                                            | Fewer traits attached to a square.                                                                     |
| Placement               | One page, `/kursy`, with a header link                                                    | Everything in one place, built from the same form patterns as `/profil`.                               |
| Data access             | RPC-only; no client privileges on the new tables                                          | A course row holds the organiser id, which no other client may ever read.                              |
| Skill link              | A foreign key to `skills`, plus a "still holds the skill" check when data is read         | A foreign key to `profile_skills` would wipe courses on every profile save.                            |
| Consent                 | New version `2026-10-21`, plus the notice update                                          | Follows S-12's precedent: the notice changes what we process.                                          |

## Scope

**In scope:**

- The tables, the visibility predicate and the RPCs, with a pgTAP suite.
- `/kursy` with its three sections, the map island and the header link.
- A TS mirror of the text rules, the privacy notice, the consent bump and smoke checks.

**Out of scope:**

- E-mail or push to sign-ups, moderation UI and reports, pseudonyms or identities of sign-ups.
- Browsing an arbitrary area, structured dates or recurring courses, paid courses, ratings, levels.
- Coordinator access.

## Architecture / Approach

One expand-only migration adds `courses` and `course_signups`, both with RLS on and no client grants. A single predicate, `course_visible_to`, defines visibility and is used by every RPC. Its conditions:

- the course is open and not expired;
- the organiser is not paused, still holds the skill and has a location;
- the organiser's current square is in today's all-skills snapshot;
- the viewer is eligible, is not the organiser, and is within one square.

The map's lazy daily refresh moves into `ensure_skills_density_fresh`, so the course list never reads a stale snapshot. The Astro page uses plain forms in the `/profil` style, and the only React island is a small Leaflet map with lettered squares.

## Phases at a Glance

| Phase                         | What it delivers                                                      | Key risk                                                             |
| ----------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 1. Database                   | Tables, predicate, RPCs, consent version, pgTAP suite                 | A visibility hole; mitigated by named tests for every rule           |
| 2. Organiser — Moje kursy     | Create, edit, close or reopen, renew, delete, with counts and reasons | Copy for the hidden reasons must not leak why to others              |
| 3. Neighbour — list, sign-ups | Map and list, sign-up and withdraw, meeting details, notice, smoke    | Consent bump order: the migration must reach production before merge |

**Prerequisites:** S-01, S-11 and S-12 are done; a local Supabase runs for `test:db`; seeded residents with backdated accounts exist for manual checks.
**Estimated effort:** about 3 implementation sessions, one per phase.

## Open Risks & Assumptions

- In a small pilot, most squares are below k = 5, so most courses will be hidden. This is accepted and explained to the organiser.
- The meeting details may hold the organiser's home address. That is the organiser's choice, shown only to active sign-ups and rate-limited.
- The consent bump sends every existing resident through `/zgoda` once. The notice text still awaits the legal review flagged in S-05.
- Squares follow the organiser's current location. After a move, the course is hidden for 7 days, and so is a moving viewer's list.
- Squares near k = 5 can appear and disappear from day to day because of the daily snapshot noise. The copy tells the organiser so.

## Success Criteria (Summary)

- A neighbour in an adjacent square finds a course, signs up and reads the meeting details, without ever learning who the organiser is.
- Every hiding rule holds in pgTAP and on screen: sparse square, pause, expiry, skill removal, distance, own course.
- Unregistering removes a resident's courses and sign-ups, and saving the profile never does.
