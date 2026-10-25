<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Email delivery (S-16)

- **Plan**: context/changes/email-delivery/plan.md
- **Mode**: Deep
- **Date**: 2026-10-21
- **Verdict**: REVISE → SOUND after triage
- **Findings**: 0 critical, 3 warnings, 3 observations

## Verdicts

| Dimension             | Verdict              |
| --------------------- | -------------------- |
| End-State Alignment   | PASS                 |
| Lean Execution        | PASS                 |
| Architectural Fitness | PASS (1 observation) |
| Blind Spots           | WARNING → PASS       |
| Plan Completeness     | WARNING → PASS       |

## Grounding

7/7 paths ✓, 6/6 symbols ✓ (`verifyOtp`, template sections in `config.toml`, `withSecurityHeaders`, Astro `security.checkOrigin` defaults to true, smoke sends `Origin`, `/auth` is exempt from the consent gate), brief↔plan ✓.

## Findings

### F1 — Supabase per-IP limits count the Worker, not the resident

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 3 / Phase 4
- **Detail**: Sign-up, resend and `verifyOtp` run server-side, and `createClient` (`src/lib/supabase.ts:10`) forwards no client IP. Supabase's 30-per-5-minute limits on sign-up/resend and `/verify` then apply to Cloudflare egress addresses shared by many residents, which can surface as rate-limit errors on announcement day. How many egress IPs a Worker uses is unverified.
- **Fix**: Raise `rate_limit_verify` and the sign-up/sign-in per-IP limit to 300 per 5 minutes in Phase 3 (find the field by changing it once in the Dashboard), keep per-visitor protection in `AUTH_IP_LIMITER`, and add a five-sign-ups-in-a-row check to Phase 4.
- **Decision**: FIXED

### F2 — "No changes on second dry run" can't pass because of smtp_pass

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 §5, Phase 3 (3.1)
- **Detail**: `GET config/auth` returns `smtp_pass` as a string that can't reveal the real key, so a diff would always flag it and the script would resend it on every run.
- **Fix**: Send `smtp_pass` only with `--set-smtp-pass` and never diff it. Criterion 3.1 runs without that flag.
- **Decision**: FIXED

### F3 — Rollback relies on a script feature that wasn't specified

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Migration Notes, Phase 2 §5
- **Detail**: Migration Notes said "rerun the script with the values from the snapshot", but the script's contract never read a snapshot.
- **Fix**: Add `--restore <snapshot.json>`, which PATCHes only the managed keys, with a dry run and a test for the key filter.
- **Decision**: FIXED

### F4 — Page-level Referrer-Policy would be overwritten by the middleware

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Critical Implementation Details, Phase 2 §2
- **Detail**: `withSecurityHeaders` (`src/middleware.ts:39`) sets `strict-origin-when-cross-origin` on every response after the page renders, and that policy already keeps the token out of cross-origin referrers.
- **Fix**: Drop the `no-referrer` requirement.
- **Decision**: FIXED

### F5 — rate_limit_email_sent 100/h on Resend Free (100/day)

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 §5, Phase 3
- **Detail**: A bot burst within the app throttle could use up the daily Resend quota in one hour and block real confirmations until the next day.
- **Fix**: Default to 30/h on Free, and 300/h after the Pro switch.
- **Decision**: FIXED

### F6 — content_path resolves from the repo root

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 §5
- **Detail**: `config.toml:234` uses `./supabase/templates/…`, which is relative to the project root.
- **Fix**: State it in the `readTemplateSections` contract.
- **Decision**: FIXED
