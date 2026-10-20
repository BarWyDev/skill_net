<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Neighbour Courses (FR-020)

- **Plan**: context/changes/neighbour-courses/plan.md
- **Scope**: All 3 phases
- **Date**: 2026-10-20
- **Verdict**: REJECTED
- **Findings**: 1 critical, 2 warnings, 6 observations

The verdict is driven by one critical finding (F1) with a small, well-understood fix. Apart from that, the implementation matches the plan closely.

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | FAIL |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

Automated criteria, rerun on a freshly reset local database:

- unit tests: 86/86 pass;
- pgTAP: 663/663 pass;
- `astro check`: 0 errors;
- lint: clean;
- the scratch build passes;
- smoke passes against localhost:4330.

The manual checks are all confirmed by the user.

## Triage

Triage is complete:

- Fixed: F1 (Fix A), F2, F3 (Fix A), F5, F6, F7 and F9.
- Accepted: F4 (Fix A, recorded) and F8.

After the fixes:

- `npx supabase db reset` applies the migration;
- pgTAP: all suites pass, and neighbour_courses has 74 assertions;
- unit: 86/86;
- `astro check` reports 0 errors, and lint is clean.

## Findings

### F1 — Sign-ups keep receiving the organiser's live square when the course is hidden

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261021120000_neighbour_courses.sql:814
- **Detail**:
  - `get_my_course_signups` returns `cell` from `density_square(o.location)` whenever the organiser has a location. It never checks `course_hidden_reason`.
  - So a resident with an active sign-up still gets the organiser's current square in two cases:
    - after the organiser moves anywhere (`recent_move`), immediately, before the 7-day rule would apply;
    - when the organiser's square drops below k = 5 (`square_hidden`).
  - Signing up to every course in one's block and calling the RPC directly would track organisers into sparse squares. That breaks the k ≥ 5 promise in the new /prywatnosc text.
  - No UI uses this field: `MySignups.astro` never renders `cell`.
- **Fix A ⭐ Recommended**: Drop `cell` from `get_my_course_signups`, `MyCourseSignupDTO`, the zod schema and the generated types, and add a pgTAP case.
  - Strength: The field is unused, so dropping it removes the leak without any UI change.
  - Tradeoff: The return type changes, so the function must be dropped and recreated. That means editing the migration (only if it is not yet in production) or adding a follow-up migration.
  - Confidence: HIGH — verified that `MySignups.astro` does not read `cell`.
  - Blind spot: Not checked whether 20261021120000 is already applied to production (`npx supabase migration list --linked`).
- **Fix B**: Keep `cell`, but return it only when `course_hidden_reason(c) is null`.
  - Strength: Same signature, so a plain `create or replace`; this keeps the option of showing a sign-up's square on a map later.
  - Tradeoff: It keeps an unused privacy-sensitive output that a later edit could loosen again.
  - Confidence: HIGH.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix A. The migration is not on production yet (`migration list --linked`: remote empty), so the edit is in place: `cell` and the organiser join are gone from `get_my_course_signups`, and `MyCourseSignupDTO`, the zod schema and the generated type are updated. New pgTAP assertion `signups_have_no_square` (plan 72).

### F2 — `get_nearby_courses` evaluates the full visibility predicate on every course nationwide

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261021120000_neighbour_courses.sql:690
- **Detail**:
  - The only filter is `where public.course_visible_to(c, v_user_id)`, run on every row of `courses`.
  - The helpers are SECURITY DEFINER with `set search_path`, so Postgres never inlines them. Each row therefore runs:
    - several `st_transform` calls;
    - profile, `profile_skills` and snapshot lookups;
    - `course_resident_eligible(viewer)` again, even though it is the same for every row.
  - Plan line 423 assumed the RPC "filters by the viewer's 3×3 block". Closed and expired courses are never purged, so the cost grows linearly with every course ever created.
  - This is fine at pilot scale.
- **Fix**: In the plpgsql body:
  - compute the viewer's eligibility and square once, and return early if the viewer is not eligible;
  - pre-filter on `is_open`, `opened_at > now() - 90 days` and `organiser_id <> viewer`;
  - limit organisers to the ±1 `sx`/`sy` range before calling `course_hidden_reason`.
  - Strength: Bounds the work to the viewer's area. It reuses the same helpers, so the visibility rule stays in one place: `course_visible_to` remains the final check.
  - Tradeoff: More SQL in a privacy-critical function; the pgTAP visibility suite must still pass unchanged.
  - Confidence: MED — not profiled. The cost is reasoned from function volatility and attributes.
  - Blind spot: Real row counts at pilot scale are unknown; this may be fine to defer.
- **Decision**: FIXED. `get_nearby_courses` now:
  - returns early for an ineligible viewer;
  - computes the viewer's square once;
  - pre-filters on `is_open`, the 90-day window, `organiser_id` and the ±1 `sx`/`sy` range before `course_visible_to`, which still decides.

  The pgTAP visibility suite passes unchanged.

### F3 — Dashed or ISO dates followed by an hour are rejected as phone numbers

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/course-text.ts:29 (mirrors check_course_text in the migration)
- **Detail**:
  - "2026-10-21 10:00" and "21-10-2026 10:00" form a run of 10 digits joined by single dashes or spaces, so the phone rule rejects them with the "contact" message.
  - The date is the most natural thing to type in "Szczegóły spotkania".
  - Dotted dates ("21.10.2026, 10:00") pass, as the plan intended. Dashed dates were not considered.
- **Fix A ⭐ Recommended**: Name the dotted format in the field hints: "Miejsce i termin, np. sobota 21.10, 10:00".
  - Strength: No change to the privacy rule; the SQL and the TS mirror stay identical.
  - Tradeoff: Users who type dashes still get an error, though the error message could also mention dates.
  - Confidence: HIGH.
  - Blind spot: None significant.
- **Fix B**: Narrow the phone rule so a run must not start with a date-like `\d{1,4}-\d{1,2}-\d{1,4}` group, in both SQL and TS, with tests.
  - Strength: Accepts natural input.
  - Tradeoff: More regex in two places, and it opens gaps such as "600-10-02 100" style evasions.
  - Confidence: MED.
  - Blind spot: Unclear which evasions this admits.
- **Decision**: FIXED via Fix A. The meeting hint in `CourseForm.astro` gives a dotted example and says "Datę zapisz z kropkami". `meeting_contact` in `course-text.ts` adds the same advice. The phone rule is unchanged.

### F4 — A course reveals a skill category in squares where the category map hides it (k = 5 vs k = 10)

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261021120000_neighbour_courses.sql:260
- **Detail**:
  - Visibility checks only the all-skills snapshot (`category = ''`, k = 5).
  - A course shows "someone in square X holds skill S of category C". The category map deliberately hides squares with fewer than 10 holders of a category (20261011130000).
  - So a course in such a square tells viewers there are 1–9 holders there.
  - It doesn't identify anyone on its own, but combined with local knowledge it narrows the field. Organisers opt in by publishing a course.
- **Fix A ⭐ Recommended**: Accept it and record the decision in the plan, plus one sentence in /prywatnosc ("kurs pokazuje, że w kwadracie ktoś ma tę umiejętność").
  - Strength: Organisers choose to publish. Requiring k = 10 per category would hide most courses for rare skills.
  - Tradeoff: Weaker than the map's guarantee for categories.
  - Confidence: MED — a product/privacy judgement for the owner.
  - Blind spot: No legal review yet.
- **Fix B**: Also require the course's category square in the snapshot.
  - Strength: Matches the map's category guarantee.
  - Tradeoff: Most courses in rare categories would never be visible.
  - Confidence: MED.
  - Blind spot: Pilot data density is unknown.
- **Decision**: FIXED via Fix A (accepted). Recorded in change.md under "Implementation review decisions", and /prywatnosc says a course shows that someone in the square holds the skill even where the category map hides it.

### F5 — pgTAP gaps against the plan's named tests

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: supabase/tests/neighbour_courses_test.sql:443
- **Detail**: There are three gaps:
  - `recent_move_hides` never asserts that `get_my_courses` returns `hidden_reason = 'recent_move'` for the moved organiser, although the plan names that check.
  - `meeting_details_only_for_active_signups` relies on the column-list test for "absent from get_nearby_courses".
  - `no_client_table_privileges` checks SELECT, INSERT, UPDATE and DELETE but not TRUNCATE, REFERENCES or TRIGGER. The migration's `revoke all` covers them.
- **Fix**: Add the `recent_move` hidden_reason assertion, and extend the privilege check to all table privileges.
- **Decision**: FIXED. Added `recent_move_hides: the organiser is told why`. `no_client_table_privileges` now also checks TRUNCATE, REFERENCES and TRIGGER. The suite has 73 assertions.

### F6 — Privacy notice doesn't mention the location-change timestamp or the 7-day wait

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/pages/prywatnosc.astro
- **Detail**: Phase 1 added `profiles.location_changed_at`, which is new personal data. The notice lists the location but not that the time of its last change is stored and used for the 7-day course rule.
- **Fix**: Add "oraz kiedy ostatnio ją zmieniono (kursy pokazujemy 7 dni po zmianie)" to the location bullet. This belongs to the same consent version, so it should go in before merge.
- **Decision**: FIXED. The location bullet now says when the last change is recorded and that courses in the area work 7 days after a change.

### F7 — No cap on the total number of courses per organiser

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261021120000_neighbour_courses.sql:405
- **Detail**: Only open, unexpired courses count toward the limit of 3, so create → close → create repeats without limit. The rows are visible only to their owner, but they feed F2's growth.
- **Fix**: Defer to a follow-up: cap total courses per organiser (e.g. 20) or purge closed or expired courses after N days.
- **Decision**: FIXED (now, not deferred). `create_course` raises `course_total_limit_reached` at 20 courses, closed and expired included, under the same advisory lock. The change also adds:
  - a Polish message in `COURSE_ERROR_MESSAGES`;
  - a form gate in `MyCourses.astro`;
  - a pgTAP case, `total_course_limit` (the plan now has 74 assertions).

### F8 — Generated types churn from a newer Supabase CLI

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/db/database.types.ts
- **Detail**: CLI 2.120.0 changed the output:
  - it added `ComputedFields` to every table and changed `Args: never` to `Record<PropertyKey, never>`;
  - it now emits internal tables and revoked helpers (e.g. `course_visible_to`, `refresh_skills_density`), which type-check as callable but fail at runtime;
  - `courses.Row` gains a phantom `course_hidden_reason` computed field.

  The error-typed `visible_match_count` entry was already on master.
- **Fix**: Accept as generator output, since there are no hand edits. Optionally note the CLI version in CLAUDE.md.
- **Decision**: ACCEPTED as generator output. Note that today's raw `npm run db:types` output is unformatted and would churn the whole file. So the F1 change (dropping `cell` from `get_my_course_signups`) was applied as a one-line edit matching the regenerated output.

### F9 — Minor contract drift in the database layer

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: supabase/migrations/20261021120000_neighbour_courses.sql:164, :779
- **Detail**: Two small differences from the plan:
  - `density_square` is declared `stable`, not `immutable` as planned.
  - `get_my_course_signups` omits `places_left`, `is_full` and `signed_up`, which the UI doesn't need. Its `available` also covers the organiser's `no_location` and `recent_move`, a superset of the plan's list.

  Both are harmless.
- **Fix**: Record both in change.md's deviation notes; no code change.
- **Decision**: FIXED. Both deviations, plus the F1, F2 and F7 changes, are recorded in change.md under "Implementation review decisions".
