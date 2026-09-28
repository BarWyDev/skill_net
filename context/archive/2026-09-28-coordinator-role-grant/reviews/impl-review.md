<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Coordinator Role Grant

- **Plan**: context/changes/coordinator-role-grant/plan.md
- **Scope**: Phases 1–2 of 2 (full plan)
- **Date**: 2026-09-28
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Evidence

- **Diff** `e0e3b34^..22a834f`: 18 files. Every file named in the plan is present, and the only unplanned objects are listed in F4.
- **Automated checks:**
  - `npm run test:db`: 70/70 PASS;
  - `npx astro check`: 0 errors, 0 warnings;
  - `npm run lint`: clean;
  - `npm run build`: OK.
- **CI on #39:** `ci`, `smoke` and Workers Builds all pass.
- **Route gate on production** (anonymous GET requests):
  - `/koordynator`, `/koordynator/`, `/%6Boordynator`, `/%6boordynator/` and `/koordynator%2F` all return 302 to `/auth/signin`;
  - `/KOORDYNATOR` and `/Koordynator` return 404;
  - Astro decodes the path before the middleware sees it, so there is no encoding bypass.
- **Hosted RPC as anonymous:** `is_coordinator` and `grant_coordinator` both return 42501 / 401. The functions exist and refuse anonymous callers.
- **Manual 1.7:** confirmed by the hosted probe above.
- **Manual 2.7–2.10:** confirmed by the user, and also scripted during implementation (grant → 200, revoke → 403, broken RPC → 403).
- **Manual 2.11:** confirmed by the user after merge.

## Findings

### F1 — Fail-closed role lookup leaves no trace

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/middleware.ts:24
- **Detail**: The plan allowed the catch to log the error code. The implementation dropped the log because of the `no-console` lint rule. If `is_coordinator()` fails in production, every coordinator silently gets "Brak dostępu", and `wrangler tail --status error` shows nothing because the response is a normal 403. Causes include a migration missing on a new environment, a privilege regression, or a PostgREST outage. For a crisis tool, "the coordinator can't get in and nobody knows why" is the worst moment to be debugging blind. The error message is `isCoordinator: <code>` and holds no personal data.
- **Fix**: Log the code in the catch (`console.error(error.message)`, with a scoped `eslint-disable-next-line no-console` and a comment that the message holds only the PostgREST code).
- **Decision**: PENDING

### F2 — service_role cannot actually run the grant functions

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260928120000_coordinator_role.sql:60 (`role_change_target`)
- **Detail**: The plan's Phase 1 contract says "only `postgres` and `service_role` keep access". On local Supabase, `service_role` has `execute` on `grant_coordinator` but no `select` on `auth.users`. A call as `service_role` (for example a future script using the secret key) would fail with permission denied inside `role_change_target`. The only supported path today is the SQL editor as `postgres`, and that works, so nothing is broken now. The documentation is simply inaccurate.
- **Fix**: State in the README runbook that grant and revoke run only as `postgres` (SQL editor), and don't widen `service_role`.
- **Decision**: PENDING

### F3 — `headers.set` on an immutable Response would 500 a future coordinator route

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/middleware.ts:43
- **Detail**: The middleware sets `Cache-Control` on whatever `next()` returns under `/koordynator`. `Response.redirect()` creates a response with immutable headers (checked in Node: `TypeError: immutable`). An S-03/S-04 endpoint under `/koordynator/*` that returns `Response.redirect(...)` would therefore crash with a 500. `context.redirect()` and `Response.json()` are mutable, and the project's endpoints use `context.redirect`, so today's code is unaffected.
- **Fix**: When setting the header, copy the response into a new one: `new Response(response.body, response)`.
- **Decision**: PENDING

### F4 — Implementation deviations not recorded in the plan

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: supabase/migrations/20260928120000_coordinator_role.sql:60; supabase/tests/coordinator_role_test.sql:197; src/middleware.ts:24
- **Detail**: The implementation differs from the plan in four small ways, all reported to the user during implementation but not recorded in `plan.md`:
  - an extra helper, `role_change_target()` (a DB function, so it shows up in the generated types), with a new `ambiguous_email` error;
  - two extra privilege tests (31 instead of 29), added after a mutation check showed the plan's tests passed even with the grant hole open;
  - the error log dropped from the middleware catch (see F1);
  - `revoke all` from anon on `user_roles` instead of the planned write-only revoke.

  All of them are benign or stronger than planned. S-03 will read this plan, and it won't learn about the helper or the stricter privileges.
- **Fix**: Add a short `## Implementation Notes` addendum to plan.md listing the four deviations.
- **Decision**: PENDING
