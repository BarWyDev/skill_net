<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Resident Skills Profile

- **Plan**: context/changes/resident-skills-profile/plan.md
- **Scope**: Phases 1–4 of 4 (full plan, commits 740d731..2ee2699)
- **Date**: 2026-09-27
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 7 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | WARNING |

## Success criteria evidence (re-run 2026-09-27)

- `npx supabase db reset`: PASS, all 3 migrations apply.
- `npm run test:db`: PASS, 30 of 30 pgTAP tests.
- `select count(*) from postcodes`: 20,561, inside the 20k–25k range.
- `npm run db:types`: no drift against the committed `src/db/database.types.ts`.
- `npm run lint`, `npx astro check` (0 errors) and `npm run build`: PASS.
- `SMOKE_READONLY=1 npm run smoke`: PASS, 3 of 3.
- `npm run smoke`, full write run: FAIL locally, 7 steps. This is environmental: `.dev.vars` points the dev server at the production Supabase, which rejects `example.com` sign-ups, so no account was created. The same 14 steps PASS in CI run 36317799062 against a local Supabase (the smoke job includes "Run database tests").
- Postcode endpoint: `99-999` → 404 and `abc` → 400. `31-001` and `00-910` → 200 with coordinates. The plan's example `00-950` → 404, because that postcode isn't in the PRG data (see F4).

## Findings

### F1 — Stored postcode undoes coarsening for small postcodes

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260927120000_resident_profile_schema.sql:41 (column), :209 (written by `save_my_profile`), :237 (returned by `get_my_profile`), :292-295 (`postcodes` readable by anon)
- **Detail**:
  - The plan promises that no stored location is more precise than a 500 m cell centre, and the migration header repeats that promise. With `location_source = 'postcode'`, the raw postcode is stored as well.
  - `public.postcodes` is readable by anon and exposes each postcode's raw centroid and `address_count`. 981 of the 20,561 postcodes have exactly 1 address and 3,217 have 5 or fewer. For those residents, the stored postcode points to their building.
  - Today only the owner can read it, through RLS. S-03's ranking RPC is planned as `security definer`, so it will be the first reader that can see other residents' postcodes. This is a plan-level gap: the plan specified the column.
- **Fix A ⭐ Recommended**: Stop persisting the postcode. Keep `location_source` and the coarsened point, and have the UI show "Ustawiono z kodu pocztowego".
  - Strength: The DB invariant then really holds for every reader, and S-03 can't leak what isn't stored.
  - Tradeoff: A new change with a migration (drop or null the column, trigger, `get_my_profile`), UI, pgTAP, types and plan updates. Reloading `/profil` no longer shows the typed code.
  - Confidence: HIGH — the only consumer of the stored postcode is the owner's own form.
  - Blind spot: Whether S-11 (density map) wanted postcode-level aggregation. It can use the coarsened point instead.
- **Fix B**: Keep the column. Record in S-03's contract that `profiles.postcode` is personal data never returned to coordinators, and correct the migration header claim.
  - Strength: No code change now; cheap.
  - Tradeoff: Relies on every future reader (S-03, S-08, S-11, exports, backups) remembering the rule.
  - Confidence: MED — a written rule is only as strong as the next plan review.
  - Blind spot: Backups and admin access already see it.
- **Decision**: FIX A CHOSEN, queued in `follow-ups/review-fixes.md` as a separate change before S-03 (not yet implemented)

### F2 — Postcode endpoint is publicly cacheable while it may carry session cookies

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/kody-pocztowe/[kod].ts:7
- **Detail**: The middleware runs `supabase.auth.getUser()` on every request, including this route. When a token refresh happens, `setAll` writes `sb-*-auth-token` cookies onto this response. `setAll` in `src/lib/supabase.ts` ignores the no-store headers that @supabase/ssr passes as its second argument, which predates this change. The response then has `Cache-Control: public, max-age=86400` together with a session `Set-Cookie`, which a shared proxy may store.
- **Fix**: Change the header to `private, max-age=86400`. The data is anon-readable anyway, so shared caching gains nothing.
- **Decision**: ACCEPTED-AS-RULE: Public cache headers on routes that pass through the auth middleware (code not changed)

### F3 — Outlier postcode centroids, up to about 250 km off

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: scripts/build-postcode-centroids.mjs (mean per postcode); supabase/migrations/20260927130000_seed_postcode_centroids.sql
- **Detail**:
  - 85 postcodes sit more than 100 km from the centre of their two-digit prefix group, and 49 of those rest on 3 or fewer PRG address points.
  - Examples: `00-017`, a central-Warsaw code with 1 point, resolves to 53.31°N 17.73°E; `00-010`, with 4 points, resolves to 52.56°N 19.98°E.
  - An arithmetic mean is pulled by a single misattributed point. A resident who types such a code gets a location that is wrong for S-03 ranking, and the Phase 2 spot-check (3 codes) couldn't catch it.
- **Fix A ⭐ Recommended**: Make the build script robust: use a per-postcode median, or drop points far from the median, and flag low-count outliers. Then regenerate the centroids into a new idempotent migration.
  - Strength: Fixes the cause for all codes; reproducible.
  - Tradeoff: The raw PRG/OpenAddresses input has to be downloaded again (`data/` is gitignored), and the new migration is about 800 KB.
  - Confidence: HIGH — median is the standard fix for single-point contamination.
  - Blind spot: Profiles already saved from a bad code keep their old point until they are re-saved or backfilled.
- **Fix B**: Add a small migration that deletes (or nulls) the roughly 50 low-count outliers, so those residents fall back to the pin path with the Polish "Nie znamy tego kodu" message.
  - Strength: Quick, and needs no raw data.
  - Tradeoff: It hides the symptom. Higher-count outliers (36 codes with more than 3 points) stay.
  - Confidence: MED — depends on the threshold chosen.
  - Blind spot: Genuine codes that happen to be far from their prefix centre.
- **Decision**: SKIPPED

### F4 — Success-criteria evidence not reproducible as written

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: plan.md Phase 3 manual 3.6 and automated 3.4
- **Detail**:
  - Manual 3.6 is checked as "`00-950` returns coarsened coordinates", but `00-950` isn't in the generated data and returns 404; it exists only as a pgTAP fixture. Either another code was tested or the item was ticked without that exact check.
  - Automated 3.4 ("smoke against local dev with local Supabase") can't be reproduced with the current `.dev.vars`, which points at production. CI is the only place where it runs green.
- **Fix**: Use a real code (for example `31-001`) in future plan examples, and document a local-Supabase env switch for `npm run smoke`, for example a `.dev.vars.local` copy swapped in the way CI does it.
- **Decision**: SKIPPED

### F5 — Plan contract text is out of date with the implementation

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/profile/LocationPicker.tsx:25-30; scripts/build-postcode-centroids.mjs:44-54; src/lib/services/profile.ts:89
- **Detail**: Minor drift, with the intent kept:
  - The map uses a draggable `Marker` with `L.divIcon` instead of the contract's `CircleMarker`. A CircleMarker can't be dragged, and Critical Implementation Details allows a divIcon.
  - The build script defaults to the raw PRG `X`/`Y`/`kodPocztowy` columns in EPSG:2180, with a `--srs` option, and averages in 2180.
  - `isProfileMatchable(supabase, userId)` returns `boolean | null`.
  - The deviations are documented in the script header and README, but not in the plan.
- **Fix**: Add a short "Implementation notes" addendum to plan.md before it is archived.
- **Decision**: SKIPPED

### F6 — Postcode endpoint lets Supabase errors escape as a generic 500

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/kody-pocztowe/[kod].ts:20
- **Detail**: `lookupPostcode` throws on an RPC error and the route has no try/catch, so it returns Astro's generic 500 instead of the JSON `{error}` every other branch returns. The island treats any non-ok status as "failed", so the user impact is small.
- **Fix**: Wrap the call in try/catch and return 503 with a Polish JSON error.
- **Decision**: SKIPPED

### F7 — `?error=` renders attacker-chosen text in the app's alert box

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/profil.astro:10, :44-47
- **Detail**: Astro escapes the value, so this isn't XSS. But a link like `/profil?error=Twoje konto zablokowane, zadzwoń…` shows arbitrary text in a trusted-looking alert box. The pattern is inherited from `/auth/signin`.
- **Fix**: Redirect with short error codes and map them to Polish text on the server. Best done once for auth and profile together.
- **Decision**: SKIPPED

### F8 — Map tiles load directly from tile.openstreetmap.org

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/profile/LocationPicker.tsx:151-154
- **Detail**: Zoom-14 tiles around the resident's home send their IP address and rough area to a third party. The OSM tile usage policy also disallows heavy production use, which a crisis spike could trigger.
- **Fix**: Before the pilot, move to a tile provider with production terms and mention it in the privacy copy.
- **Decision**: SKIPPED

### F9 — pgTAP gaps on grants and user_id reassignment

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/tests/resident_profile_test.sql
- **Detail**: The code is correct, but three guarantees aren't pinned by tests:
  - `update profiles set user_id = <other>` is rejected by the UPDATE policy's WITH CHECK.
  - `anon` cannot execute `save_my_profile` or `get_my_profile` (the revokes are at schema:324-326).
  - The direct-write coarsening case runs as `postgres`, not as `authenticated` through RLS.
- **Fix**: Add 2–3 assertions to the suite.
- **Decision**: SKIPPED

### F10 — Profile form bypasses the shared Button/ServerError components

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/profile/ProfileForm.tsx:88-98
- **Detail**: It builds its own alert `<p>` and a raw `<button>` without a pending or disabled state, while the auth forms use the shadcn `Button` (through `SubmitButton`) and `ServerError`. A double submit is harmless, because `save_my_profile` replaces the whole profile.
- **Fix**: Use `Button` from `@/components/ui/button` and disable it while submitting.
- **Decision**: SKIPPED
