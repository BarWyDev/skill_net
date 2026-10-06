# Pause and Resume Availability — Plan Brief

> Full plan: `context/changes/pause-availability/plan.md`

## What & Why

Roadmap S-13 (FR-019): a resident can pause their availability without deleting the account, and resume it later. The PRD accepted pausing as the alternative to deletion that keeps the directory full. A pause must take effect at once, everywhere a coordinator or the public could see the resident.

## Starting Point

One rule, `profile_is_matchable`, decides eligibility for both new crisis rankings and the public density map. Active crises read a frozen snapshot (`crisis_matches`) through three RPCs, and the coordinator's counts come from a frozen `match_count`. `/profil` already has a plain-POST "Usuń konto" form, which serves as the pattern.

## Desired End State

On `/profil` a resident pauses their availability until a date (today up to a year ahead) or indefinitely. A banner then shows "wstrzymana do DD.MM.YYYY włącznie" with a "Wznów" button. While paused, they are absent from new rankings, from the map, and from active crisis lists, contact reveals and teams. After a resume or expiry they return at their original "Osoba #N". Coordinator counts always match the visible list.

## Key Decisions Made

| Decision                      | Choice                                                         | Why (1 sentence)                                                             |
| ----------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Scope for new crises and map  | Paused residents leave both the ranking and the map            | One rule in one place, the same mechanism as unregistering.                  |
| Pausing during an active crisis | Filtered out of list, reveal and teams at read time          | A pause must work at once, and break-glass must not reveal a withdrawn number. |
| Resume during a crisis        | Back at the same position                                      | The snapshot row is never deleted, so a pause is fully reversible.           |
| Coordinator visibility        | No counter, only the current list                              | Reveals nothing about who withdrew.                                          |
| Expiry                        | Optional end date, inclusive, on the Europe/Warsaw calendar, evaluated on read | Answers the PRD's "forgotten pauses" concern with no cron.   |
| Date range                    | Today up to today + 365 days, checked by a DB trigger          | Catches typos, and also holds against direct PostgREST writes.               |
| UI                            | A separate plain-POST section plus a banner with "Wznów"       | Works without JS and matches "Usuń konto"; the profile stays editable.       |
| Counts                        | `visible_match_count` computed column on `crises`              | Keeps "N dopasowanych", "ukrytych" and "bez telefonu" honest; also fixes the S-14 drift. |

## Scope

**In scope:**
- `paused_at` and `paused_until` on `profiles`, and the `pause_active` predicate.
- Changed eligibility rule, plus pause and resume RPCs.
- Filters in 3 crisis RPCs, plus `visible_match_count`.
- The `/profil` section, the banner and two endpoints.
- A pgTAP suite and a unit test.

**Out of scope:**
- A paused-people counter for coordinators.
- Pause history or audit.
- Expiry notifications or a cron job.
- S-07 alert exclusion. S-07 inherits it through `profile_is_matchable`.
- Any change to the sign-in redirect.

## Architecture / Approach

Pause is state on `profiles` plus one pure, time-parameterised predicate (the same pattern as `availability_covers`). Adding it to `profile_is_matchable` covers new rankings and the map. A filter on snapshot reads covers active crises. `get_my_profile` gains `complete` (the old rule) so that the profile banner stays truthful. The app follows the existing form-POST, service, RPC chain.

## Phases at a Glance

| Phase          | What it delivers                                                 | Key risk                                                                 |
| -------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 1. Database    | Migration, predicate, filters, computed count, types, pgTAP      | The Warsaw-date boundary and the reveal "logged = shown" invariant       |
| 2. Application | Pause/resume UI on `/profil`, endpoints, date helper, coordinator counts | A server/browser "today" mismatch on the date field              |

**Prerequisites:** S-01 is done, and local Supabase runs in Docker.
**Estimated effort:** ~2 sessions across 2 phases.

## Open Risks & Assumptions

- Gaps in "Osoba #N" stay unexplained to coordinators, as accepted. Revisit if pilot coordinators find them confusing.
- `matchable` now also means "not paused". Its only other consumer is the sign-in redirect, which then also sends paused users to `/profil`; that is intentional.
- S-07 must use `profile_is_matchable` for its alert audience. Note this when planning S-07.

## Success Criteria (Summary)

- A resident can pause (until a date or indefinitely) and resume from their phone, without JS.
- A paused resident never appears to a coordinator or on the public map, and reappears unchanged after a resume or expiry.
- All existing and new DB suites, the unit tests, lint, the type check, the build and smoke pass.
