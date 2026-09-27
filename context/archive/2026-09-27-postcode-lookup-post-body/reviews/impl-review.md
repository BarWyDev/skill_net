<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Postcode Lookup via POST Body

- **Plan**: context/changes/postcode-lookup-post-body/plan.md
- **Scope**: Phases 1–2 of 2 (full plan)
- **Date**: 2026-09-27
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS (1 observation: plan wording) |
| Scope Discipline | PASS |
| Safety & Quality | PASS (1 observation) |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS (1 observation) |

## Evidence

- Diff `f849104..82e2232`: `src/pages/api/kody-pocztowe/index.ts` (new), `[kod].ts` (deleted), `src/components/profile/LocationPicker.tsx`, `scripts/smoke.mjs`, plus the change folder. Every source file is in the plan; nothing unplanned.
- Route contract matches the plan: the media type is checked with parameters allowed; `request.json()` sits in a `try` that drops the error; body is object-checked; a non-string `postcode` returns 400; `normalisePostcode` is reused; validation runs before `createClient`; the header is one `NO_STORE` constant on 400/503/404/200; no `console.*`.
- Island: only the `fetch` call changed; the stale-request guard and the 404/`!ok`/200 handling are untouched.
- Smoke: `json` / `rawBody` + `contentType` options, `bodyIncludes` matcher with failure output and header comment, 3 steps in `readonlySteps`.
- `lessons.md` rule (no `Cache-Control: public` behind the auth middleware): satisfied; `grep -rn "public, max-age" src` is empty.
- Re-run on merged code: lint 0, `astro check` 0 errors, build 0, both greps empty, production readonly smoke 6/6, PR #36 `ci` and `smoke` pass.

## Findings

### F1 — RPC failure escapes the route as an unhandled 500

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/kody-pocztowe/index.ts:41
- **Detail**: `lookupPostcode` throws `lookupPostcode: <error.code>` on an RPC error, and the route doesn't catch it, so Astro answers with its generic 500 page, without `Cache-Control: no-store`. It's not a leak: the message carries only the Supabase error code, the URL has no postcode, and the island maps any non-2xx to "Nie udało się sprawdzić kodu…". The plan's end state lists 200/400/404/503 only, so this isn't drift. Behaviour is unchanged from the old GET route.
- **Fix**: Catch the throw in the route and return `{ error: "Nie udało się sprawdzić kodu." }` with status 502 and `NO_STORE`.
  - Strength: Every response from the route then has the same JSON shape and header.
  - Tradeoff: The exception no longer reaches Workers Logs as an error, so an RPC outage becomes invisible unless something else records it; `wrangler tail --status error` stops showing it.
  - Confidence: MED — a POST 500 is not cached by browsers or shared proxies anyway, so the header gain is mostly cosmetic.
  - Blind spot: Haven't checked whether Astro's 500 page itself runs through the middleware's cookie refresh.
- **Decision**: PENDING

### F2 — A wrong Content-Type can get Astro's 403 instead of the route's 400

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/postcode-lookup-post-body/plan.md (Desired End State; Phase 1 contract)
- **Detail**: The plan says a wrong Content-Type gets the route's generic 400. For the form content types (`text/plain`, urlencoded, multipart), Astro's `security.checkOrigin` runs first and answers 403 "Cross-site POST form submissions are forbidden" whenever `Origin` is missing or foreign; observed with `curl` during Phase 1. Same-origin browser requests still reach the route and get 400. The code is fine; the plan's claim is slightly too broad.
- **Fix**: Skip, or add one sentence to the plan noting that the 400 applies to same-origin requests.
- **Decision**: PENDING

### F3 — 2.6 was verified with a direct POST, not by typing on production /profil

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/postcode-lookup-post-body/plan.md (Progress 2.6)
- **Detail**: The criterion is "typing a postcode on production `/profil`" while `wrangler tail` runs. The recorded evidence is `wrangler tail` during a `curl` POST of `{"postcode":"31-001"}`: it logged `POST https://skillnet.barwy.workers.dev/api/kody-pocztowe`, no logs, no exceptions, no postcode in the output. The island sends the identical request, which the local browser test confirmed (1.7), so the log URL is the same. The user's earlier production checks ran before the deploy landed and did not test this change.
- **Fix**: Accept as is, or type one code on production `/profil` with `npx wrangler tail skillnet --format json` running.
- **Decision**: PENDING
