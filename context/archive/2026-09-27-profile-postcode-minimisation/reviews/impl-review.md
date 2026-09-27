<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Profile Postcode Minimisation

- **Plan**: context/changes/profile-postcode-minimisation/plan.md
- **Scope**: Full plan (Phases 1–2 of 2)
- **Date**: 2026-09-27
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Evidence

- Commits: `8dec4cf` (p1), `d5c1cf9` (p2), `12ed485` (epilogue) on `feat/profile-postcode-minimisation`.
- Planned files are all in the diff. `src/db/database.types.ts` is planned but unchanged: regenerating it produced no diff, because the column and RPC signatures are the same. No unplanned source files.
- Re-run on the committed code: `npx supabase db reset` OK; `npm run test:db` 39/39; `npm run lint` clean; `npx astro check` 0 errors; `npm run build` complete.
- `npm run smoke` against local Supabase: 17/17, run during Phase 2 on the final code. A probe confirmed that `/profil` serialises the island props (`"locationSource":[0,"postcode"]`) and does not contain `31-001`.
- Data-migration rehearsal: the local DB was reset to `20260927130000`, a profile was inserted with `postcode = '31-001'`, then `supabase migration up` ran. The point and source were unchanged, the postcode became null, and the F2 check query from the plan review returned `t`.
- Manual 2.5–2.7 were checked in the browser pane (status line, revert to the exact stored lat/lng, skills-only re-save kept the location). The user confirmed all manual rows.

## Findings

### F1 — Typed postcode still reaches Workers Logs through the lookup URL

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/profile/LocationPicker.tsx:97 (`fetch(\`/api/kody-pocztowe/${…}\`)`); plan.md Desired End State
- **Detail**: This is plan-review F1, still PENDING. The DB, RPC and page guarantees are all delivered and tested. But the plan's end state says no reader, "admin" included, can see a typed postcode. Every lookup puts the code in the request path, and `wrangler.jsonc` has `observability.enabled: true`, so Workers Logs keep it with the request metadata for the retention window. The implementation followed the plan's scope ("not touching `/api/kody-pocztowe`"), so this is a gap between the plan's claim and its scope, not drift.
- **Fix A ⭐ Recommended**: Narrow the end-state claim in the plan to DB, RPC and page readers. Queue a follow-up in `follow-ups/review-fixes.md`: a POST-body lookup, or no code in the URL.
  - Strength: Ships S-15's roadmap outcome ("stored profile") as-is. The follow-up is small and well defined.
  - Tradeoff: Codes remain in Workers Logs, without a user_id, until the follow-up lands.
  - Confidence: HIGH — the URL shape is plain in the code.
  - Blind spot: Exactly which request headers (IP, cookie) Workers Logs retain is not verified.
- **Fix B**: Switch the lookup to `POST /api/kody-pocztowe` with a JSON body in this branch.
  - Strength: The claim then holds for logs too, before S-03 ships.
  - Tradeoff: Unplanned scope. It touches the route, the island and the 400/404 contract after review, so it needs another smoke step.
  - Confidence: MED — a small change, but not rehearsed.
  - Blind spot: Other places the code could enter a URL (none found).
- **Decision**: FIXED (Fix A): end-state claim narrowed in plan.md and plan-brief.md; POST-body lookup queued in follow-ups/review-fixes.md

### F2 — `postcode_never_stored_check` is a behavioural test, not `col_has_check`

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: supabase/tests/resident_profile_test.sql (postcode_never_stored_check)
- **Detail**: The plan named `col_has_check('public', 'profiles', 'postcode')`. The test instead disables the trigger and asserts that an update storing a postcode fails with `23514`. That is stronger: it proves the check rejects a stored postcode, not just that a check exists. This is benign drift.
- **Fix**: Accept as is; this report records the deviation.
- **Decision**: SKIPPED

### F3 — Clearing the field after an unsaved map pin discards the pin

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/profile/LocationPicker.tsx:78-84
- **Detail**: This matches the plan ("clearing restores the location loaded with the page"). The sequence to watch is: click the map (unsaved pin), then type in the postcode field, then clear it. The location jumps back to the loaded one, and the fresh pin is lost without a message. Before this change, the same sequence removed the location entirely, so this is strictly better.
- **Fix**: Optional. Revert to the last non-postcode value (the loaded location or a later pin) instead of always the loaded one.
- **Decision**: FIXED: LocationPicker reverts to the last non-postcode value (loaded location or a later pin)

### F4 — Data-migration step has no automated coverage

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: supabase/migrations/20260927150000_profile_postcode_never_stored.sql (`update public.profiles set postcode = null …`)
- **Detail**: CI applies the migration to empty tables, so the step that nulls existing postcodes is proven only by the one-off local rehearsal recorded above. This is plan-review F2, still PENDING.
- **Fix**: After `npx supabase db push` on production, run `select count(*) filter (where postcode is not null) = 0 and count(*) filter (where location_source = 'postcode' and location is null) = 0 from public.profiles;` and expect `t`.
- **Decision**: FIXED: post-push check query added to plan.md Migration Notes
