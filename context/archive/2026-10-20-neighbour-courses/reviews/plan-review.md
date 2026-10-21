<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Neighbour Courses

- **Plan**: `context/changes/neighbour-courses/plan.md`
- **Mode**: Deep
- **Date**: 2026-10-20
- **Verdict**: REVISE, then SOUND after the fixes
- **Findings**: 0 critical, 5 warnings, 2 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

- Paths: 9/9 ✓
- Symbols: 6/6 ✓
- The brief matches the plan ✓
- Progress matches the phases: 3/3 phases, 22/22 criteria ✓

Verified separately:

- **Consent bump.** It touches only `src/lib/consent.ts:7` and the migration. Tests and the seed use the still-published `2026-10-06`, and the gate compares against the TS constant (`src/middleware.ts:92-93`).
- **`get_skills_density`.** `create or replace` keeps its owner and grants. Its pinning tests (`public_skills_density_test.sql`, `skills_density_snapshot_test.sql`) stay valid.

## Findings

### F1 — Moving the pin lets anyone scan courses across Poland

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Blind Spots
- **Location**: Phase 1 — `course_visible_to`; the "In the area" decision
- **Detail**: The 3×3 block is computed from the viewer's current location, which `/profil` lets the viewer change at will. Changing the pin, opening `/kursy` and repeating browses any area. That undoes the decision to show only the viewer's own block.
- **Fix A ⭐ Recommended**: Show courses only once the location has been unchanged for 7 days, for viewers and organisers. A new server-owned column, `profiles.location_changed_at`, is set by the server-timestamps trigger.
  - Strength: A scan costs 7 days per block. It follows the same pattern as the 14-day account rule.
  - Tradeoff: A column and a trigger change; someone who moves waits a week.
  - Confidence: HIGH — the trigger already owns server timestamps (F-07).
  - Blind spot: The backfill sets `location_changed_at` to `created_at`.
- **Fix B**: Accept the risk and document it.
  - Strength: No code.
  - Tradeoff: The "In the area" decision becomes nominal.
  - Confidence: MED.
  - Blind spot: Who would scan, and why.
- **Decision**: FIXED via Fix A

### F2 — The phone rule rejects dates and times

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1 — `check_course_text`; Phase 2 — `course-text.ts`
- **Detail**: The rule stripped separators across the whole text, so "sobota 21.10.2026, 10-12" counted as 12 digits.
- **Fix**: A phone number is a run of at least 9 digits separated by at most one space or dash, with an optional `+48`. Dots and colons end the run. Positive tests cover dates and times. Accepted cost: "600.100.200" with dots passes.
- **Decision**: FIXED

### F3 — Helper functions get default EXECUTE for clients

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — helpers
- **Detail**: Supabase grants execute on new functions to anon and authenticated by default.
  - Called directly, `course_visible_to` would answer "can resident Y see course X".
  - `course_resident_eligible` would leak whether any uuid has a confirmed email.
- **Fix**: Revoke execute from public, anon and authenticated on all five helpers, set the owner to postgres, and add the test `helpers_not_executable_by_clients`.
- **Decision**: FIXED

### F4 — The manual test assumes sign-in to seed accounts

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Testing Strategy — Manual Testing Steps
- **Detail**: The seed accounts have no password (`supabase/seed.sql:6`).
- **Fix**:
  - Create A, B and C through `/auth/signup`.
  - In SQL, backdate `created_at` by 15 days and `location_changed_at` by 8 days.
  - Use pins in squares (283, 121) and (284, 122) next to the dense seed area.
- **Decision**: FIXED

### F5 — The two-step delete pattern does not exist

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — Page and components
- **Detail**: `DeleteAccount.astro` is a single form with a password field and no second step.
- **Fix**: A required checkbox "Usuwam kurs i wszystkie zapisy", enforced by zod.
- **Decision**: FIXED

### F6 — Course visibility near the threshold flickers day to day

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phases 2 and 3 — hidden and unavailable copy
- **Detail**: The daily ±2 noise of the snapshot makes squares with 5–7 residents appear and disappear.
- **Fix**: The `square_hidden` copy adds "Może się to zmieniać z dnia na dzień." The logic is unchanged.
- **Decision**: FIXED

### F7 — The plan contradicts itself on who refreshes the snapshot

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — `course_visible_to`
- **Detail**: The plan said a per-row predicate refreshes the snapshot "once per statement", which a per-row function cannot guarantee.
- **Fix**: The predicate is stable and never refreshes. Every RPC that uses it calls `ensure_skills_density_fresh(null)` first.
- **Decision**: FIXED
