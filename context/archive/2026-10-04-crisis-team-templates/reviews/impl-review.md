<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Crisis Team Templates

- **Plan**: context/changes/crisis-team-templates/plan.md
- **Scope**: Full plan (Phases 1–3 of 3)
- **Date**: 2026-10-04
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Evidence

- **Diff** `d6bac82..HEAD`: every file the plan names was changed. Two changed files are not in the plan: `eslint.config.js` and `.claude/launch.json` (see F1).
- **Automated checks**, re-run during this review:
  - `npm run lint` passes.
  - `npx astro check` reports 0 errors.
  - `npm run test:unit` passes 10 of 10.
  - `npm run test:db` passes 244 tests.
  - `npm run smoke` was not re-run here, because it needs the env files pointed at local Supabase. It passed against the local preview at `2bd2439`, and the code hasn't changed since.
- **Manual checks**: 1.4, 2.4 and 3.6–3.11 are confirmed by the user in the session. Before that, 3.6, 3.7, 3.9 and 3.11 were also checked in the browser against a local flood crisis.
- **Solver CPU**: the worst cases at the RPC's 90-row cap take 0.05–0.25 ms (warm), well inside the Workers Free 10 ms budget.
- **The per-role cap loses nothing.** This holds even though `role_skills` only lists roles where the member made the cut (see F2).
  - A complete assignment uses at most `requested × S` = `p_teams × S` people in total, so a role can never need more than its top `p_teams × S` people.
  - Suppose someone outside a role's top `p_teams × S` fills that role. Then at least one person inside the top `p_teams × S` is unused, and swapping them in keeps every slot filled at no higher cost.
  - The partial team obeys the same limit, because `k* × S + S ≤ requested × S`.
- **Concurrency**: `get_team_candidates` is `stable`, so its status check and its candidate query read the same snapshot. If `end_crisis` runs at the same moment, the result is either the full list or nothing, never half a list.

## Findings

### F1 — Two config changes not in the plan

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: eslint.config.js:74, .claude/launch.json
- **Detail**:
  - `eslint.config.js` adds a `testsConfig` block that turns off `@typescript-eslint/no-floating-promises` for `**/*.test.ts`. It's needed because `node:test`'s `test()` returns a promise the runner tracks itself. The plan only asked to "check that ESLint accepts the test file".
  - `.claude/launch.json` adds an `astro-preview` config on port 4322. It was needed because another session held 4321, but it's a committed, shared config.
  - Both are harmless, but neither is recorded in the plan or in `change.md`.
- **Fix**: Add a short note to the `change.md` Notes section that records both additions and why they were made.
- **Decision**: FIXED — noted both additions in change.md Notes

### F2 — role_skills lists only the roles where the member made the cut

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: supabase/migrations/20261004140000_crisis_team_templates.sql:59
- **Detail**:
  - The plan's contract says `role_skills` "includes only the roles the member qualifies for".
  - The implementation is narrower. A member who qualifies for roles A and B, but is outside role B's top `p_teams × S`, gets only A.
  - This gives the same teams (see Evidence), and it makes the pgTAP cap test unambiguous. It is documented in the function's comment and was mentioned in the session, but the plan text still says the broader thing.
- **Fix**: Add the narrower rule to the `change.md` Notes, so the plan's contract and the code don't disagree silently.
- **Decision**: FIXED — recorded the narrower contract in change.md Notes

### F3 — Local env files point at production Supabase

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: .env, .dev.vars (gitignored, not part of the diff)
- **Detail**:
  - Both files set `SUPABASE_URL` to the production project (`grbhvhfwwjmzmrbzpxzu.supabase.co`).
  - So a local preview plus `npm run smoke` without `SMOKE_READONLY=1` tries to create accounts in production. During Phase 3 the signup step was blocked only by the production email rate limit.
  - CLAUDE.md says to set `SMOKE_READONLY=1` against production. With these files, though, a "local" run is a production run without any sign of it.
  - This is not caused by this change, but this change's verification ran straight into it.
- **Fix A ⭐ Recommended**: Point `.env` and `.dev.vars` at the local Supabase, the way CI does, and keep the production values only in `wrangler secret`.
  - Strength: Local runs, the smoke test and manual checks all hit local data by default, as CI already assumes.
  - Tradeoff: You lose the quick "run local code against production data" setup, if you rely on it.
  - Confidence: HIGH. CI's smoke job builds exactly this setup (`supabase status -o env` → `.env` / `.dev.vars`).
  - Blind spot: Whether you deliberately run local code against production for some workflow.
- **Fix B**: Keep the files, but add a CLAUDE.md warning that the local env targets production, so full smoke runs need a temporary swap.
  - Strength: No change to your local setup.
  - Tradeoff: Relies on people, and agents, reading and following the warning.
  - Confidence: MED. The SMOKE_READONLY rule already exists and was not enough of a guard here.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix A — `.env` and `.dev.vars` now point at the local Supabase; the production values are backed up in the gitignored `.env.production`

### F4 — Merging before the migrations are pushed breaks the crisis page's new link

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/koordynator/kryzys/[id]/zespoly.astro:38
- **Detail**:
  - Workers Builds deploys on merge to `master`, but migrations are pushed by hand.
  - If the PR merges before `20261004140000` and `20261004140100` reach production, the "Złóż zespoły" link appears on every active crisis.
  - The page it leads to then fails inside `getTeamTemplates`, and shows the misleading "Nie udało się wczytać kryzysu."
  - The plan's Migration Notes already require pushing the migrations before the merge. This finding is a reminder at PR time, not a code defect.
- **Fix**: Push both migrations to production (`npx supabase db push`) before merging the PR, and say so in the PR description.
- **Decision**: FIXED — queued as a pre-merge step in `follow-ups/review-fixes.md`, to go in the PR description
