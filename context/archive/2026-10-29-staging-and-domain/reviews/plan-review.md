<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Staging Supabase Project and Production on skillnet.org.pl

- **Plan**: context/changes/staging-and-domain/plan.md
- **Mode**: Deep
- **Date**: 2026-10-29
- **Verdict**: REVISE → SOUND after triage
- **Findings**: 0 critical, 4 warnings, 2 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

9/9 paths ✓, 4/4 symbols ✓ (httpsRedirect, dev-guard PROD rules, Astro.site, smoke httpsSteps), brief↔plan ✓

## Findings

### F1 — Smoke expects the Worker's 308, the zone may answer 301

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 6 — criterion 6.2
- **Detail**: `scripts/smoke.mjs:498-508` requires exactly 308 with the same path. On a custom zone with "Always Use HTTPS" on, the edge answers 301 before the Worker runs. A zone HSTS setting would replace the Worker's header.
- **Fix**: An owner step in Phase 6 confirms both are off and records it in `infrastructure.md`.
- **Decision**: FIXED

### F2 — Workers Builds token may not be able to attach the domain

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 6 — Worker routes
- **Detail**: The managed build token (`infrastructure.md:140`) may lack the zone and DNS rights to create custom domains, which would leave a failed `master` build.
- **Fix A ⭐ Recommended**: Attach in the dashboard first, then merge `routes` as a record of the state.
- **Fix B**: Dashboard only, no `routes` in the config.
- **Decision**: FIXED (Fix A)

### F3 — The last free active project slot

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 / Migration Notes
- **Detail**: The org holds skill_net (active) plus paused vena, dzielnia and BarWyDev's Project, and free accounts get 2 active projects.
- **Fix**: The owner deletes the three unused projects before creating staging; noted in Migration Notes.
- **Decision**: FIXED (owner chose to delete them)

### F4 — Staging Site URL pointed at a preview that disappears

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — Auth settings
- **Fix**: The Site URL is `http://localhost:4321`; previews stay on the redirect list.
- **Decision**: FIXED

### F5 — Hard-coded migration count

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2
- **Fix**: "every local migration" instead of "30".
- **Decision**: FIXED

### F6 — Limits of the canonical redirect

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 7
- **Detail**: Static assets bypass the Worker; a POST from a stale old-host tab gets 403 from Astro's origin check; read-only smoke on `workers.dev` stops passing.
- **Fix**: The first two are recorded under What We're NOT Doing, and the Phase 7 docs step names the smoke commands to replace.
- **Decision**: FIXED
