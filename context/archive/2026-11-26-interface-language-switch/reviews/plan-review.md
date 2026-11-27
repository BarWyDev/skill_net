<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Interface Language Switch

- **Plan**: context/changes/interface-language-switch/plan.md
- **Mode**: Deep
- **Date**: 2026-11-26
- **Verdict**: REVISE, SOUND after the fixes below
- **Findings**: 1 critical, 3 warnings, 3 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | WARNING |
| Architectural Fitness | PASS    |
| Blind Spots           | FAIL    |
| Plan Completeness     | WARNING |

## Grounding

6/6 paths ✓, 8/8 symbols ✓, brief↔plan ✓, Progress↔Phase ✓

## Findings

### F1 — The ?lang= redirect can send a visitor to another site

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Critical Implementation Details; Phase 1, change 4
- **Detail**: The plan said "303 to the same path and remaining query". A request to `//evil.example?lang=en` has the path `//evil.example`, and a relative `Location` of that value is read by browsers as another host. The same class was fixed in `return-path.ts` (security audit F-01).
- **Fix**: Redirect to the absolute URL built from the request's own URL object with only `lang` removed; add a unit test and a smoke check for a path that starts with `//`.
- **Decision**: FIXED

### F2 — Two importers of the changed functions are not in the plan

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 3, change 1
- **Detail**: `src/pages/zgoda.astro` imports `CONSENT_LABEL` and `CONSENT_LINK_TEXT`, and `src/lib/services/account.ts` calls `authErrorMessage`. Both serve S-19 pages the plan does not touch.
- **Fix**: Keep the Polish exports of `consent.ts` and add translations beside them; `account.ts` gains a `locale` argument that `/profil` passes as `"pl"` for now.
- **Decision**: FIXED

### F3 — The new "code" field in /api/kody-pocztowe is not needed

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Lean Execution
- **Location**: Phase 2, change 2
- **Detail**: Both islands that call the endpoint already map the HTTP status to their own message (`DensityMap.tsx:119`, `LocationPicker.tsx:134`).
- **Fix**: Drop the API change; translate only the island's own messages.
- **Decision**: FIXED

### F4 — Accept-Language: q=0 and equal weights are undecided

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Critical Implementation Details — Language resolution order
- **Detail**: "Walk by descending quality" did not say what happens with `pl;q=0, en` or with two languages at the same weight.
- **Fix**: `q=0` entries are dropped; equal weights keep the header's order; both cases join the test table.
- **Decision**: FIXED

### F5 — previews.vars is confirmed; the hedge can go

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1, change 3; brief, Open Risks
- **Detail**: The installed Wrangler's config schema lists `vars` under `PreviewsConfig`.
- **Fix**: State it as fact; remove the fallback and the risk.
- **Decision**: FIXED

### F6 — The share image carries Polish text

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: What We're NOT Doing
- **Detail**: `og-image.png` is one generated picture with Polish words.
- **Fix**: List per-language share images as out of scope.
- **Decision**: FIXED

### F7 — Step 4.7 cannot be ticked until a later promotion

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 4, Manual Verification
- **Detail**: The step waited on a promotion outside this change, so the change could not be archived on time.
- **Fix**: Replaced by an automated check that the merged `wrangler.jsonc` has production at `"pl"`; the production check stays in the promotion routine.
- **Decision**: FIXED
