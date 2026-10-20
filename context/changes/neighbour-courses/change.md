---
change_id: neighbour-courses
title: Neighbour courses (FR-020)
status: impl_reviewed
created: 2026-10-20
updated: 2026-10-20
archived_at: null
---

## Notes

Roadmap S-17 (FR-020, nice-to-have pulled into M-1 on 2026-10-20). Plan: `plan.md`; brief: `plan-brief.md`.

Phase 1 deviations from the plan (2026-10-20):

- `profiles.location_changed_at` is not backfilled. Null means "set before tracking began" and counts as settled, which gives existing residents the same result as a backfill to `created_at`, without a mass `UPDATE` of `profiles` that would fire three triggers and bump every `updated_at`.
- The trigger owns the column only for client roles (`anon`, `authenticated`, which includes the security-invoker `save_my_profile`). Writes as postgres (migrations, tests, Studio) may set it, which the pgTAP fixtures rely on.
- Five more internal helpers than planned, all with execute revoked from clients and covered by `helpers_not_executable_by_clients`: `course_hidden_reason` (the hidden-reason order, shared by the list and `get_my_courses`), `course_eligible_on` (the date for the "wait until" copy), `density_block_geojson`, `course_active_signups`, `course_open_count`.
- `get_course_area()` also returns `eligible_on date`, for Phase 2's "you become eligible on" copy.

Implementation review decisions (2026-10-20):

- A course is visible when its square is in the all-skills snapshot (k = 5), not the category snapshot (k = 10). A course therefore reveals that someone in the square holds its skill even where the category map hides the square. Accepted: organisers opt in by publishing, and requiring k = 10 would hide most courses for rare skills. `/prywatnosc` says so.
- `get_my_course_signups` returns no square (`cell`): it would follow the organiser's current location past the 7-day rule and below k = 5. It also omits `places_left`, `is_full` and `signed_up`, which "Moje zapisy" doesn't need. Its `available` is `course_hidden_reason is null`, so it also covers the organiser's `no_location` and `recent_move`.
- `get_nearby_courses` pre-filters on open, unexpired courses in the viewer's 3×3 block before `course_visible_to`, which still decides.
- `create_course` also caps an organiser at 20 courses in total (`course_total_limit_reached`), closed and expired included.
- `density_square` is declared `stable` rather than `immutable` (it calls `st_transform`); harmless.
