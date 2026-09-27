<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Profile Postcode Minimisation

- **Plan**: context/changes/profile-postcode-minimisation/plan.md
- **Mode**: Deep
- **Date**: 2026-09-27
- **Verdict**: SOUND
- **Findings**: 0 critical, 2 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | WARNING |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | PASS |

## Grounding

9/9 paths ✓, 5/5 symbols ✓, brief↔plan ✓.

The riskiest claims were verified inline, and all hold:

- The `ON CONFLICT` `excluded.*` values reflect the `BEFORE INSERT` trigger.
- zod `z.object` strips unknown keys, so the new code works against the old DB.
- `client:only` islands serialise their props into the HTML, so the smoke body check is meaningful.
- CI smoke runs against a local Supabase with the full postcode seed, so `31-001` exists there.
- The only reader of `MyProfileDTO.postcode` is `ProfileForm`.

## Findings

### F1 — Typed postcode still lands in Workers Logs via the lookup URL

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: End-State Alignment
- **Location**: Desired End State; What We're NOT Doing
- **Detail**: The end state promises "No reader, whether RLS owner, security definer, backup … or admin, can see a typed postcode". The island's preview fetch puts the code in the URL path, `/api/kody-pocztowe/31-001` (`src/components/profile/LocationPicker.tsx:88`). `wrangler.jsonc` has `observability.enabled: true`, so Workers Logs record that URL with the request's time and client metadata. This is a copy of the code outside the DB, readable by anyone with Cloudflare access. The plan scopes the endpoint out, but the end state still overclaims.
- **Fix A ⭐ Recommended**: Narrow the end-state claim to DB readers, the RPC and the page. Add the lookup-URL logging to Open Risks as a follow-up candidate (POST body lookup, or client-side matching).
  - Strength: Keeps S-15 to its roadmap outcome ("stored profile"). The log is short-lived and has no user_id.
  - Tradeoff: A known copy of the code outside the DB remains for the Workers Logs retention window.
  - Confidence: HIGH — the URL path is visible in the code today.
  - Blind spot: It is unverified which request headers Workers Logs keep (cookie redaction, IP).
- **Fix B**: Move the lookup to a POST with a JSON body in this change.
  - Strength: The code never appears in a URL, so the claim holds for logs too.
  - Tradeoff: Scope creep into an endpoint that is currently out of scope. It loses GET caching, which is already private after F2.
  - Confidence: MED — a small change, but it touches the route, the island and the 404/400 behaviour.
  - Blind spot: Any other place the code enters a URL (none found).
- **Decision**: PENDING

### F2 — No post-deploy check that production rows were migrated

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Migration Notes; Progress
- **Detail**: The data update (null the postcode, keep the point through the trigger's keep branch) only does real work on production. CI and local runs apply it to empty tables. The manual `db push` is the one moment it matters, and no step verifies it.
- **Fix**: Add a manual step after `db push`: `select count(*) filter (where postcode is not null) = 0 and count(*) filter (where location_source = 'postcode' and location is null) = 0`. Add it as Progress 2.11.
- **Decision**: PENDING

### F3 — Local smoke run needs a local-Supabase .dev.vars

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — Automated 2.4
- **Detail**: Step 2.4 says the server should be "pointed at local Supabase" but not how. The local `.dev.vars` targets production Supabase, which rejects `example.com` sign-ups. That's why the S-01 impl-review's local smoke run failed 7 steps.
- **Fix**: Spell it out: write `SUPABASE_URL` and `SUPABASE_KEY` from `npx supabase status -o env` (`API_URL`, `ANON_KEY`) into a temporary `.dev.vars`, as CI does. Or accept the CI smoke job as the proof for 2.4.
- **Decision**: PENDING
