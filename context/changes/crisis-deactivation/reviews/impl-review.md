<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Crisis Deactivation

- **Plan**: context/changes/crisis-deactivation/plan.md
- **Scope**: Full plan (Phases 1–2 of 2)
- **Date**: 2026-10-02
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

Evidence notes:
- Every planned file exists and matches its contract; no unplanned source files in the diff (`2e56e17..HEAD`). `roadmap.md` changed only for the S-04 status flip.
- CSRF: the new form POST relies on Astro's default `security.checkOrigin` (not overridden in `astro.config.mjs`), the same as the activation endpoint.
- Lesson "Public cache headers": the endpoint sets no Cache-Control; the middleware sends `private, no-store` (smoke asserts it for the resident path).
- Re-run on review: lint clean, `astro check` 0/0, build complete, pgTAP 132/132. Smoke (29/29) was run at commit `adfcda2` against a local stack; no source changed since.

## Findings

### F1 — Idempotency test cannot detect a rewrite of ended_at

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: supabase/tests/crisis_deactivation_test.sql:154
- **Detail**: The plan asks the test to prove that a second `end_crisis` call leaves `ended_at` unchanged. Both calls run in one transaction, where `now()` is constant. A buggy second call that re-ran the update would write the same `ended_at`, so the assertion passes either way. `ended_by` is unchanged here only because the same coordinator calls twice.
- **Fix**: Before the second call, set (as postgres) the ended crisis's `ended_at` to a fixed past timestamp. Make the second call as the *other* coordinator (C1), then assert that both `ended_at` and `ended_by` still hold the stored values.
- **Decision**: PENDING

### F2 — Without JS, ending skips the confirmation and is unverified

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/crisis/EndCrisisDialog.astro:15
- **Detail**: The plan accepts that without JS the button submits the form directly, so the destructive end happens in one click. That path (a `form=` button outside a closed `<dialog>` that holds the form) was not exercised. Only the JS path was tested in the browser.
- **Fix**: Check once with JS disabled that the button submits and ends the crisis; otherwise accept as planned.
- **Decision**: PENDING

### F3 — Check constraint is stricter than the plan's contract

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: supabase/migrations/20261002120000_crisis_deactivation.sql:23
- **Detail**: The plan specified `status = 'active' ⇔ ended_at is null and ended_by is null`. The implementation also requires `ended_at is not null` when the status is `ended`, which rejects an ended row whose `ended_by` is set but `ended_at` is null. This is stricter and safe, it is already on production, and it was reported at implementation time, but the plan does not record it.
- **Fix**: Accept; optionally note it in change.md Notes.
- **Decision**: PENDING

### F4 — Panel messages render inside the activation section

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/koordynator/index.astro:47
- **Detail**: "Kryzys zakończony…" and "Ten kryzys został już zakończony." appear under the "Aktywuj tryb kryzysowy" heading, which is the slot the existing `?error=` uses for activation errors. Readable, but the context is slightly off.
- **Fix**: Move the `ended` / `error` messages above the first section.
- **Decision**: PENDING

### F5 — formatActivatedAt also formats the end time

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/koordynator/kryzys/[id].astro:73, src/pages/koordynator/index.astro:139
- **Detail**: The helper's name now misdescribes half of its call sites.
- **Fix**: Rename to `formatDateTime` in `src/lib/crisis-format.ts` and its callers.
- **Decision**: PENDING
