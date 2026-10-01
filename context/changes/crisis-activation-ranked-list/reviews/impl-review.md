<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Crisis Activation and Ranked List

- **Plan**: context/changes/crisis-activation-ranked-list/plan.md
- **Scope**: All phases (1–3 of 3)
- **Date**: 2026-10-01
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 5 warnings, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

Success criteria evidence (re-run at review time): `npx supabase db reset` passes and seeds 500 matchable profiles. `npm run test:db` passes all 115 tests. `npm run db:types` gives no diff. `npm run lint`, `npx astro check` (0 errors) and `npm run build` pass. `npm run smoke` passed 27/27 against local Supabase earlier in the session. It was not re-run here because `.env` and `.dev.vars` point at production. Manual check 1.7 (production migration push) is pending and deferred by the operator. It must happen before the merge to `master`.

Plan drift: nothing is MISSING. All 20 named pgTAP assertions exist, and the matrix (52 rows) and the weights match the plan exactly. Every disclosed deviation was confirmed as an equivalent or justified change (see F6).

## Findings

### F1 — Opting out does not withdraw a resident from active crisis lists

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261001120000_crisis_matching.sql:57
- **Detail**: `crisis_matches` rows are removed only when the `profiles` row is deleted, by the cascade. If a resident clears their skills or location through `save_my_profile`, the function deletes and reinserts `profile_skills` but keeps the profile row. That resident then stays in every active crisis list with their old skills until the crisis is deleted. The migration header promises removal only on deletion, so the code matches its comment. But the snapshot keeps showing someone who has since withdrawn. The plan's fixed snapshot decision does not address withdrawal.
- **Fix A ⭐ Recommended**: Record it as a conscious decision now, and handle it in S-07, when confirmation (YES/NO) gives withdrawal a real product meaning.
  - Strength: The snapshot is fixed by design (plan, "What We're NOT Doing"), and nothing contacts residents until S-07, so the stale row harms no one today.
  - Tradeoff: The coordinator can see a stale row for someone who opted out in the meantime.
  - Confidence: HIGH — the rows carry no identity or contact data, so the exposure is limited to the skill set and a 0.5 km distance.
  - Blind spot: The PRD's position on withdrawing consent during an active crisis is not verified.
- **Fix B**: In `save_my_profile`, delete the caller's `crisis_matches` rows for active crises once they are no longer matchable.
  - Strength: The snapshot honours withdrawal immediately.
  - Tradeoff: It touches S-01's RPC, and it needs `save_my_profile` to become security definer or to gain a delete privilege, which widens the attack surface.
  - Confidence: MED — it also interacts with F3 (the stored count).
  - Blind spot: How S-07's confirmation flow will want to treat withdrawn residents.
- **Decision**: PENDING

### F2 — A coordinator can probe resident locations with unthrottled activations

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261001120000_crisis_matching.sql:87
- **Detail**: `activate_crisis` has no rate limit or snapshot cap. A coordinator can run many 1 km activations with arbitrary pins and compare the returned skill sets and 0.5 km distances to find which 500 m cell holds a resident with a distinctive skill combination. The precision is capped by the stored 500 m coarsening, and every probe is recorded in `crises.activated_by`. Repeated 20 km activations also grow `crisis_matches` without bound (about 5.6k rows each on the perf data).
- **Fix A ⭐ Recommended**: Accept as a pilot risk and record it in the deployment risk register, to revisit before the role is granted beyond the pilot's operator-vetted coordinators.
  - Strength: The coordinator role is operator-granted and audited (S-02), and every activation is attributable.
  - Tradeoff: Abuse is detected after the fact, not prevented.
  - Confidence: HIGH — it matches the plan's trust model and "Human-only" role grants.
  - Blind spot: Nobody monitors activation frequency yet.
- **Fix B**: Throttle inside `activate_crisis`, for example by raising `rate_limited` when the caller has made more than N activations in 10 minutes, with a pgTAP case.
  - Strength: It is enforced in Postgres, like every other guarantee in this slice.
  - Tradeoff: It could block a legitimate burst during a real multi-front crisis, and N is a product call.
  - Confidence: MED — the threshold is not validated with a coordinator.
  - Blind spot: Real-world activation patterns.
- **Decision**: PENDING

### F3 — `match_count` goes stale after a resident is deleted

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/koordynator/kryzys/[id].astro:34
- **Detail**: `crises.match_count` is written once at activation. After a cascade delete, the page's "N osób dopasowanych" overstates the real list. "Niewyświetlonych: X" (`matchCount - matches.length`) can then be non-zero even when every row is shown. Positions also get gaps (for example, "Osoba #4" disappears), which is fine.
- **Fix**: Label the count as "w chwili aktywacji", and compute hidden rows only when `matches.length === MATCHES_PAGE_SIZE`.
- **Decision**: PENDING

### F4 — `get_crisis_matches` does not clamp `p_limit`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261001120000_crisis_matching.sql:235
- **Detail**: A negative `p_limit` raises the raw Postgres error "LIMIT must not be negative". `null` means no limit, and a huge value returns the whole snapshot. The app always passes 200, but a coordinator can call `/rest/v1/rpc/get_crisis_matches` directly.
- **Fix**: Use `limit least(greatest(coalesce(p_limit, 200), 1), 1000)` and add a pgTAP case. The migration isn't in production yet (1.7 is deferred), so it can still be edited in place.
- **Decision**: PENDING

### F5 — The epicentre picker shows resident copy and a coarsened marker

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/profile/LocationPicker.tsx:196
- **Detail**: `LocationPicker` was reused unchanged, as the plan says. So the crisis form shows the resident footnote "Lokalizacja jest zaokrąglana do ok. 500 m — nikt nie zobaczy Twojego dokładnego adresu.", which is false for an epicentre (it is stored raw). After a postcode lookup, the marker sits on the coarsened centroid (`lookup_postcode`), up to about 354 m from the raw centroid that `activate_crisis` actually uses. That is noticeable at a 1 km radius.
- **Fix**: Add an optional `note` prop to `LocationPicker`, with the current footnote as the default. Have the crisis form pass "Epicentrum z kodu pocztowego to środek tego kodu; znacznik pokazuje przybliżone położenie."
- **Decision**: PENDING

### F6 — Disclosed deviations are not recorded in the plan

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/crisis-activation-ranked-list/plan.md
- **Detail**: All of these are equivalent or justified, but they appear only in the chat:
  - the ranking insert was restructured (a materialized CTE, one aggregation per resident, `profile_is_matchable` in `HAVING`; 22.9 s → 153 ms);
  - the perf script uses `auto_explain` as `supabase_admin` instead of `explain (analyze, buffers)`, which can't show a plpgsql function's inner plan;
  - the form uses `client:only` instead of `client:load` (Leaflet needs `window`);
  - the submit button locks after one submit;
  - `crisis-format.ts` is a new file;
  - the crisis test deletes all profiles to isolate itself from the seed;
  - the README body is in English.
- **Fix**: Append an "Implementation notes" addendum to the plan listing these.
- **Decision**: PENDING

### F7 — Coordinators can read every column of `crises` through PostgREST

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261001120000_crisis_matching.sql:263
- **Detail**: Through the crises select policy, any coordinator can read `activated_by` (other coordinators' user ids) and the raw `epicentre` via `/rest/v1/crises?select=*`. The app selects only safe columns. This is consistent with "every coordinator sees every crisis", but it is wider than what the UI needs.
- **Fix**: Accept it for the pilot, or revoke the table-level `select` and grant `select` on only the needed columns to `authenticated`.
- **Decision**: PENDING

### F8 — `profile_is_matchable` in `HAVING` is redundant work

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261001120000_crisis_matching.sql:178
- **Detail**: Every candidate already has a location (`st_dwithin`) and a matched skill (inner join), so the check is always true. It costs one non-inlinable function call per resident, which still fits comfortably inside 153 ms. Keeping it preserves S-01's single eligibility contract if that rule ever tightens.
- **Fix**: Keep it, as a deliberate contract call.
- **Decision**: PENDING

### F9 — The radius boundary at exactly d = R is not asserted

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: supabase/tests/crisis_ranking_test.sql:304
- **Detail**: Coarsening makes an exact-boundary fixture impractical, so the test checks 999 m (included) and 1001 m (excluded). Inclusivity at exactly R relies on `st_dwithin`'s documented `<=` behaviour.
- **Fix**: Accept as risk. No change.
- **Decision**: PENDING
