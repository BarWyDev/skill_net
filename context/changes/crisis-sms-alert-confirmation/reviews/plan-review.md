<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Crisis SMS Alert with YES/NO Confirmation

- **Plan**: `context/changes/crisis-sms-alert-confirmation/plan.md`
- **Mode**: Deep
- **Date**: 2026-10-29
- **Verdict**: REVISE → SOUND after triage (all 9 findings fixed in the plan)
- **Findings**: 3 critical, 4 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | FAIL |
| Lean Execution | PASS |
| Architectural Fitness | WARNING |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding

9/9 paths ✓, 4/5 symbols ✓ (vault ✗ → F2), brief↔plan ✓

## Findings

### F1 — "Open alert" definition breaks last-answer-wins

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: End-State Alignment
- **Location**: Phase 3 (`queue_crisis_alerts`), Phase 4 (`record_sms_reply`)
- **Detail**: The plan defined an open alert as `answer is null and status in (...)`. That definition caused two failures:
  - A second reply (TAK → NIE) found no open alert, returned `ended` and triggered "akcja zakończona" during an active crisis.
  - A person who had already answered TAK in crisis A could be alerted for crisis B.
- **Fix**: An alert is open while its crisis is active and its status is queued, sent or delivered, whatever its answer is. Add tests for TAK → NIE and for a TAK in crisis A blocking crisis B.
- **Decision**: FIXED

### F2 — Plan assumed Supabase Vault, which the project does not use

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architectural Fitness
- **Location**: Phase 2 helper, Phase 5 checklist
- **Detail**: No migration references `vault`, and `[db.vault]` is commented out in `supabase/config.toml:50`. The plan did not say how to enable it locally or in CI, or how tests would set the secret.
- **Fix A ⭐ Recommended**: Store the SHA-256 of the worker token in `private.worker_tokens` with no client grants. Tests insert their own row.
- **Fix B**: Enable `supabase_vault` and create secrets in tests.
- **Decision**: FIXED (Fix A)

### F3 — Default EXECUTE for PUBLIC and grants lost on drop/recreate

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phases 2–4 migrations
- **Detail**: `narrow_table_grants` changed default privileges for tables only (:53). This causes two problems:
  - New functions are executable by PUBLIC and anon until a migration revokes that explicitly.
  - Dropping and recreating `get_crisis_matches` and `get_team_candidates` resets them to the defaults (`20261003120000…:170,252-254`).
- **Fix**: Add an explicit revoke and grant after every new or recreated function, `has_function_privilege` tests, and regeneration of `src/db/database.types.ts`.
- **Decision**: FIXED

### F4 — `/api/profile/telefon/*` not covered by middleware protection

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 routes
- **Detail**: `PROTECTED_ROUTES` includes `/profil`, not `/api/profile` (`src/middleware.ts:16-25`).
- **Fix**: The routes check `locals.user` themselves, as `api/profile/pause.ts` does.
- **Decision**: FIXED

### F5 — The same number can be verified by several accounts

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 2, Phase 4 reply routing
- **Detail**: `profile_contacts.phone` is not unique. Two accounts on one phone get two alerts, and replies matched by number become ambiguous.
- **Fix**: Add a partial unique index on `phone where phone_verified_at is not null`, with a `phone_taken` error.
- **Decision**: FIXED

### F6 — Owner prerequisites for the Phase 1 merge sat in Phase 5

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 vs Phase 5
- **Detail**: Workers Builds deploys every merge, and a queue binding needs both Workers Paid and existing queues.
- **Fix**: Add a pre-merge gate to Phase 1 (manual item 1.6).
- **Decision**: FIXED

### F7 — No place name source for the SMS

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 `alertText`, Phase 3 `claim_crisis_alert`
- **Detail**: `crises` has only `epicentre_postcode`, which is null for pin activations.
- **Fix**: Use the postcode when present; otherwise drop the brackets.
- **Decision**: FIXED

### F8 — Cost paths outside the daily cap

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phases 2 and 4
- **Detail**: The daily cap counted only alerts. Codes and auto-replies had no global limit.
- **Fix**: One shared daily SMS budget in `private.sms_daily_usage`, and at most 1 auto-reply per number per hour, tracked by a hash of the number.
- **Decision**: FIXED

### F9 — SMSAPI callback method and Astro CSRF

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 4 webhooks
- **Detail**: Astro's default `checkOrigin` allows a POST that has no Origin or Sec-Fetch-Site header. SMSAPI's callback method (GET or POST) is unverified.
- **Fix**: The routes export GET and POST. The manual curl tests run without Origin, using both methods.
- **Decision**: FIXED
