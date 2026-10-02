# Crisis Activation and Ranked List Implementation Plan

## Overview

Roadmap S-03 (north star), PRD US-01, FR-009, FR-010. A coordinator activates crisis mode by choosing the incident type, the epicentre and a radius. Within 3 seconds they see the residents who match that crisis type, ranked by a weighted score built from distance, skill match and skill level, plus an availability component that stays at zero until S-07. This is the first moment the product can be put in front of a real coordinator.

One security-definer Postgres function does the whole activation in one transaction. It writes the crisis record and a snapshot of the ranking, so the list is one database round trip. The list does not depend on any external service.

## Current State Analysis

- **Resident data (S-01, S-15).** `profiles.location` is a `geography(Point)` coarsened to the centre of a 500 m cell in EPSG:2180, at most about 354 m from the input. It is GIST-indexed (`profiles_location_idx`). `profile_skills(user_id, skill_slug, level)` is indexed on `skill_slug`. Equipment and `osoba-silna-fizycznie` have `has_level = false` and a null level. The postcode is never stored.
- **Eligibility contract.** `profile_is_matchable(uuid)` (location plus at least one skill) is security invoker. Its comment says S-03's ranking RPC must be security definer to evaluate it for other residents (`supabase/migrations/20260927120000_resident_profile_schema.sql:172-191`).
- **Role gate (S-02).** `is_coordinator()` is security invoker. Inside a security-definer caller, `auth.uid()` still reads the caller's JWT, so it answers for the caller (`supabase/migrations/20260928120000_coordinator_role.sql:46-61`). The middleware sets `locals.isCoordinator` and gates every path starting with `/koordynator`, answering with `no-store` (`src/middleware.ts:5-7,46-49`). `/koordynator` is a placeholder page (`src/pages/koordynator/index.astro`).
- **Reference-data pattern.** The taxonomy is seeded by its own migration and is readable by `anon` and `authenticated` through per-role select policies.
- **Location input.** `LocationPicker` (Leaflet pin or postcode lookup against the local `postcodes` table) posts hidden `location_source`, `lat`, `lng` and `postcode` fields (`src/components/profile/LocationPicker.tsx:59-66,141,200-202`). Map tiles are external, but the postcode path is fully local.
- **Matrix seed spec.** `docs/shape_not.md:70-77` defines 6 crisis types with priority and supporting skills in prose, which this plan maps to slugs. The spec's formula uses `1/distance_km`, which is undefined at d = 0. Coarsening makes d = 0 common: everyone in the epicentre's cell.
- **Tests.** pgTAP suites live in `supabase/tests/*.sql` and run with `npm run test:db`. `scripts/smoke.mjs` has no service key, so the positive coordinator path is covered by pgTAP (the S-02 precedent). `supabase/config.toml` enables `./seed.sql`, but the file does not exist yet.
- **Absent.** Profiles have no name and no phone (phone comes in S-06). There is no confirmation flow (S-07) and no crisis tables.

## Desired End State

- A coordinator opens `/koordynator`. They pick one of 6 crisis types, set the epicentre by map pin or postcode, and pick a radius preset (1, 2, 5, 10 or 20 km, default 5). After submitting, they land on `/koordynator/kryzys/<id>`.
- The crisis page shows the type, the radius, when the crisis was activated and the total number of matched residents. It lists up to the first 200 matched residents in rank order. Each row shows:
  - the place (tied scores share a place: 1, 2, 2, 4);
  - a per-crisis pseudonym, "Osoba #N";
  - the matched skills, with their level and a priority or supporting marker;
  - the distance, rounded to 0.5 km, with "< 0,5 km" for zero.
  No raw score, no identity, no coordinates.
- The `/koordynator` panel also lists every active crisis, visible to all coordinators.
- Residents get 403 on every crisis path and on the activation endpoint. Anonymous visitors are redirected to sign-in. The RPCs refuse non-coordinators at the database level.
- Locally, `npx supabase db reset` seeds about 500 synthetic residents around Kraków, so the demo and the 3 s check are reproducible.

Verify with `npm run test:db` (ranking rules, ties, access), `npm run smoke` (anonymous and resident paths) and the manual demo walk-through in the README runbook.

### Key Discoveries:

- `is_coordinator()` composes with security definer exactly as S-02 designed (`20260928120000_coordinator_role.sql:46-48`), so no new role mechanism is needed.
- The middleware gate is prefix-based, so `/koordynator/kryzys/[id]` inherits it for free. An endpoint under `/api/` does not, so the new prefix `/api/koordynator` must be added to both lists (`src/middleware.ts:5-7`).
- Supabase grants `execute` on new functions to `anon` and `authenticated` by default. Every new function needs explicit revokes, the same S-02 pitfall (`20260928120000_coordinator_role.sql:156-166`).
- Lessons register: never send `Cache-Control: public` from a route that runs the auth middleware. The coordinator prefixes already answer `private, no-store`.

## What We're NOT Doing

- SMS or push alerts, YES/NO confirmation and live list updates (S-07, S-08). The availability component exists with its weight reserved but is always 0.
- Phone numbers and contact reveal (S-06, S-09). Rows carry no contact data.
- Deactivating a crisis (S-04). The `status` and `ended_at` columns exist, but nothing writes `ended`.
- Re-ranking an existing crisis or adding residents who register after activation. The snapshot is fixed at activation.
- Team templates (S-10), the LLM description field (spec "approach C"), ad-hoc search (FR-016) and editing the matrix or weights in the product (FR-018).
- Correcting for coarsening at the radius edge. The radius is inclusive and measured from the coarsened point, so a resident up to about 354 m outside the true radius can be included, and one just inside can be excluded.
- Reserving a person matched to two simultaneous crises, capping the number of people alerted, and per-municipality scoping (PRD OQ9).
- Excluding the coordinator's own profile. A coordinator who is also a resident is ranked like anyone else.
- Synthetic or demo data in production. The seed is local only.
- Showing the numeric score or its breakdown in the UI.

## Implementation Approach

Keep every guarantee in Postgres, as S-01 and S-02 did.

- **Matrix and weights.** These are reference tables seeded by migration: `crisis_types` holds the weights and `crisis_type_skills` holds the tiers.
- **Activation.** `activate_crisis` is a security-definer RPC owned by `postgres`, with `search_path = ''`. It checks `is_coordinator()`, resolves the epicentre, then inserts the `crises` row and every `crisis_matches` row in one statement chain. It returns the new crisis id.
- **Reading the list.** `get_crisis_matches` is a security-definer RPC that returns display-ready rows. They have no `user_id`, no raw distance and no score, so neither precise distances nor stable resident identifiers ever leave the database.
- **Client access.** Clients get no privileges on `crisis_matches`. Coordinators can read `crises` through RLS, which the panel's list of active crises needs.
- **App layer.** It follows the profile pattern: form POST, a zod parser, a service, then a redirect with a Polish `?error=` message.

### Ranking rule (the contract the pgTAP suite asserts)

For crisis type `T` with weights `wd, ws, wl, wa` (they sum to 1), epicentre `E` and radius `R` metres, a resident is a candidate when `profile_is_matchable(user_id)` holds, `st_dwithin(location, E, R)` holds (inclusive), and they have at least one skill in `crisis_type_skills` for `T`. For each candidate:

- `d = st_distance(location, E)`, with `distance_score = 1 - d / R`.
- Each matched skill gets `tier_value`: 1.0 for priority, 0.5 for supporting. Its `level_value` is `level / 3`. A skill without a level counts as `2 / 3`.
- The **best** matched skill is the one with the highest `(tier_value, level_value)`.
- `extra` is the number of matched skills other than the best. `skill_score = (best.tier_value + least(0.10, 0.05 * extra)) / 1.10`.
- `level_score = best.level_value`.
- `availability_score = 0` (until S-07).
- `score = wd*distance_score + ws*skill_score + wl*level_score + wa*availability_score`, stored as `numeric` and rounded to 6 places.
- `rank = rank() over (order by score desc)` is competition ranking, so ties share a place (1, 2, 2, 4).
- `position = row_number() over (order by score desc, md5(crisis_id::text || user_id::text))`. Ties get a stable order within one crisis that favours no one by id or registration time. "Osoba #N" uses `position`.

Design invariant, checked against the weights below: one level step on the best skill outweighs the maximum multi-skill bonus (`ws * 0.10 / 1.10 < wl / 3` for every type). The worked example becomes a test. In a power outage at equal distance, A (`elektryk:3`) scores 0.468, ahead of B (`elektryk:1`, `agregat-pradotworczy`, `kierowca-kat-b`) at 0.45.

### Weights (provisional, product-owner owned; tune after the pilot)

| Crisis type (`slug`)                    | wd   | ws   | wl   | wa   |
| --------------------------------------- | ---- | ---- | ---- | ---- |
| Powódź (`powodz`)                       | 0.45 | 0.25 | 0.10 | 0.20 |
| Awaria prądu (`awaria-pradu`)           | 0.30 | 0.35 | 0.15 | 0.20 |
| Wypadek masowy (`wypadek-masowy`)       | 0.20 | 0.40 | 0.20 | 0.20 |
| Pożar (`pozar`)                         | 0.40 | 0.25 | 0.15 | 0.20 |
| Upały / mróz (`upaly-mroz`)             | 0.30 | 0.30 | 0.20 | 0.20 |
| Cyberatak / blackout (`cyberatak-blackout`) | 0.20 | 0.40 | 0.20 | 0.20 |

### Matrix mapping (narrow reading, explicit exceptions)

The rules for reading `docs/shape_not.md:70-77`:

- "Medyk" means `ratownik-medyczny`, `lekarz`, `pielegniarka` and `pierwsza-pomoc`.
- "Kierowca" means `kierowca-kat-b` and `kierowca-kat-c`.
- In a flood, "kierowca (łódź/samochód terenowy)" means `sternik`, `lodz` and `samochod-terenowy`.
- "Tłumacz" means all 4 language skills.
- A skill named in both columns is a priority skill.

| Type                 | Priority                                                                                  | Supporting                                                                                                  |
| -------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `powodz`             | ratownik-wodny, sternik, lodz, samochod-terenowy, pompa, agregat-pradotworczy             | elektryk, ratownik-medyczny, lekarz, pielegniarka, pierwsza-pomoc, logistyk, pila-lancuchowa                |
| `awaria-pradu`       | elektryk, agregat-pradotworczy                                                            | kierowca-kat-b, kierowca-kat-c, logistyk, ups-magazyn-energii                                               |
| `wypadek-masowy`     | ratownik-medyczny, lekarz, pielegniarka, pierwsza-pomoc                                   | kierowca-kat-b, kierowca-kat-c, psycholog, tlumacz-angielski, tlumacz-ukrainski, tlumacz-niemiecki, tlumacz-migowy |
| `pozar`              | strazak-osp, kierowca-kat-b, kierowca-kat-c                                               | ratownik-medyczny, lekarz, pielegniarka, pierwsza-pomoc, pila-lancuchowa, narzedzia-reczne                  |
| `upaly-mroz`         | ratownik-medyczny, lekarz, pielegniarka, pierwsza-pomoc, opiekun-osob-starszych           | kierowca-kat-b, kierowca-kat-c, lokal-ogrzewany-klimatyzowany                                               |
| `cyberatak-blackout` | informatyk, elektryk, radioamator                                                         | logistyk, agregat-pradotworczy, kierowca-kat-b, kierowca-kat-c                                              |

No crisis type matches `rezerwista`, `zolnierz-wot` or `osoba-silna-fizycznie`. That is intentional for v1, because the spec's matrix doesn't name them. S-10's evacuation template will need `osoba-silna-fizycznie`.

## Critical Implementation Details

- **Ordering of rollout.** The Phase 1 migration must be pushed to the production database before Phase 3 merges to `master`. Workers Builds deploys every `master` push, and the panel would otherwise call RPCs that don't exist. S-02 used the same order.
- **Performance constraints.** The ≤ 3 s budget covers the POST, the redirect and the page load, which is 4 RPC subrequests including the middleware's. The ranking must use `st_dwithin` on the indexed `profiles.location` as the driving filter, with skills joined after it, never a scan over all `profile_skills`. Phase 2 measures this on 20k profiles.

## Phase 1: Crisis schema, matrix and ranking

### Overview

This phase adds the database layer: reference tables for the matrix and weights, the crisis and snapshot tables, the activation and read RPCs, RLS and privileges, a pgTAP suite proving the ranking rule and the access boundary, and regenerated types.

### Changes Required:

#### 1. Crisis schema migration

**File**: `supabase/migrations/20261001120000_crisis_matching.sql`

**Intent**: Create the crisis data model and the single ranking implementation, with every access guarantee in Postgres. Open with a header comment in the style of the S-01 and S-02 migrations, listing the guarantees: coordinator-only activation and read, a snapshot at activation, no `user_id` or raw distance leaving the database, and a cascade on resident deletion.

**Contract**:

- `crisis_types(slug text pk, name_pl text, sort smallint, w_distance numeric, w_skill numeric, w_level numeric, w_availability numeric)`, with a check that the 4 weights sum to 1 and each is between 0 and 1.
- `crisis_type_skills(crisis_type_slug fk, skill_slug fk → skills, tier text check in ('priority','supporting'), pk (crisis_type_slug, skill_slug))`.
- `crises(id uuid pk default gen_random_uuid(), crisis_type_slug fk, epicentre geography(Point,4326) not null, radius_m integer check in (1000,2000,5000,10000,20000), status text check in ('active','ended') default 'active', activated_by uuid not null, activated_at timestamptz default now(), ended_at timestamptz null, match_count integer not null default 0)`.
  - `activated_by` has no FK to `auth.users`, mirroring `coordinator_role_events`: the record outlives the account, and S-14 decides retention.
  - Add an index on `status`.
- `crisis_matches(crisis_id fk → crises on delete cascade, user_id fk → profiles(user_id) on delete cascade, rank integer, position integer, score numeric, distance_m integer, matched_skills jsonb, pk (crisis_id, user_id), unique (crisis_id, position))`.
  - `matched_skills` is `[{slug, tier, level}]`, ordered best first.
- `activate_crisis(p_crisis_type text, p_location_source text, p_postcode text, p_lat double precision, p_lng double precision, p_radius_km integer) returns uuid`.
  - It is `security definer`, `set search_path = ''` and owned by `postgres`.
  - It raises these errors:
    - `not_coordinator` unless `public.is_coordinator()`;
    - `unknown_crisis_type`;
    - `invalid_radius` (not a preset);
    - `unknown_postcode`;
    - `outside_poland` for a pin outside the same bounding box the profile trigger uses;
    - `location_required`.
  - A postcode resolves to the **raw** centroid from `postcodes`, because the epicentre is not personal data and is not coarsened.
  - It inserts the crisis, inserts the matches using the ranking rule above, sets `match_count`, and returns the id.
- `get_crisis_matches(p_crisis_id uuid, p_limit integer default 200) returns table(rank integer, position integer, distance_km_rounded numeric, matched_skills jsonb)`.
  - It is security definer and raises `not_coordinator` and `unknown_crisis`.
  - It orders by `position`, and computes `distance_km_rounded = round(distance_m / 500.0) * 0.5`.
- **RLS on all 4 tables.**
  - `crisis_types` and `crisis_type_skills`: separate select policies for `anon` and `authenticated` (reference data).
  - `crises`: one select policy `to authenticated using ((select public.is_coordinator()))`.
  - `crisis_matches`: no policies.
- **Privileges.**
  - Revoke insert, update, delete, truncate, references and trigger on all 4 tables from `anon` and `authenticated`. Also revoke all on `crises` from `anon`, and all on `crisis_matches` from `anon` and `authenticated`.
  - Revoke execute on both functions from `public` and `anon`, and grant execute to `authenticated`.

#### 2. Matrix seed migration

**File**: `supabase/migrations/20261001120100_seed_crisis_matrix.sql`

**Intent**: Seed the 6 crisis types with Polish names, sort order and the weights table, plus the tier mapping table, exactly as written in this plan. Its header comment says the weights are provisional, owned by the product owner, and changed only by migration (FR-018 is nice-to-have).

**Contract**: These are 6 rows in `crisis_types` and the rows in `crisis_type_skills` per the mapping table. Every `skill_slug` must exist in `skills`, and the FK enforces that.

#### 3. pgTAP suite

**File**: `supabase/tests/crisis_ranking_test.sql`

**Intent**: Prove the ranking rule and the access boundary on hand-placed fixtures, following the fixture and JWT-claim pattern in `coordinator_role_test.sql`. Everything is rolled back.

**Contract**: These named assertions, at minimum:

- `resident_cannot_activate`: `not_coordinator`.
- `anon_cannot_execute`: permission denied for both RPCs.
- `resident_cannot_read_crisis`: `get_crisis_matches` raises, and `select` on `crises` returns 0 rows.
- `client_cannot_read_matches_table`: a direct select on `crisis_matches` is denied for `authenticated`.
- `client_cannot_write_crises`.
- `coordinator_activates_and_reads`.
- `priority_beats_supporting`: equal distance and level.
- `best_plus_bonus`: the A/B power-outage example, A ranks above B.
- `no_level_counts_as_two`: `agregat` sits between `elektryk:1` and `elektryk:3` at equal distance.
- `ties_share_rank`: two identical profiles in one cell get the same `rank` and consecutive `position`, and the next resident's rank skips one place.
- `radius_inclusive_and_excludes_outside`.
- `unmatched_skills_excluded`: a resident in the radius with only non-matrix skills is excluded.
- `no_location_excluded`.
- `match_count_matches_rows`.
- `matches_hide_user_id`: the RPC result has no `user_id` column.
- `distance_rounded_to_half_km`.
- `resident_delete_cascades_from_snapshot`.
- `unknown_type_radius_postcode_raise`.
- `matrix_weights_sum_to_one`.
- `bonus_never_beats_level_step`: checked for every crisis type from the weights.

#### 4. Generated types

**File**: `src/db/database.types.ts`

**Intent**: Regenerate them with `npm run db:types` after `npx supabase db reset`.

**Contract**: New tables and both RPCs appear under `public`.

### Success Criteria:

#### Automated Verification:

- Migrations apply cleanly: `npx supabase db reset`
- pgTAP suites pass (new and existing): `npm run test:db`
- Types regenerate with no diff after a second run: `npm run db:types && git diff --exit-code src/db/database.types.ts`
- Type check passes: `npx astro check`
- Lint passes: `npm run lint`

#### Manual Verification:

- In Studio, `crisis_type_skills` matches the mapping table in this plan row for row.
- The migrations are pushed to the production database (operator) before Phase 3 merges.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Demo data and performance check

### Overview

This phase adds reproducible local synthetic residents for the demo and the 3 s check, and documents the demo walk-through.

### Changes Required:

#### 1. Local seed

**File**: `supabase/seed.sql`

**Intent**: Create about 500 synthetic residents around Kraków (the centre of 31-001), using `setseed` so every reset gives the same data. Each resident gets a pin within about 15 km and 1–4 skills drawn from the taxonomy, with valid levels (null for skills without a level). The header comment says the file is local only: `supabase db reset` loads it and production never does. Synthetic `auth.users` rows get `@seed.skillnet.test` emails and no password, so nobody can sign in as them.

**Contract**: It inserts into `auth.users`, `profiles` (as `pin`, so the coarsening trigger runs) and `profile_skills`, with the level trigger satisfied. It is idempotent under `db reset` and creates no coordinator.

#### 2. Performance check script

**File**: `scripts/perf-crisis.sql`

**Intent**: A manual check, run with `psql` against the local database. Inside a transaction that is rolled back, it generates 20,000 extra synthetic profiles. It then runs `activate_crisis` as a fake coordinator JWT for a 20 km power outage under `explain (analyze, buffers)` and reports the timing.

**Contract**: It leaves nothing behind (`rollback`). It prints the execution time, and the plan must show the GIST index used for the radius filter.

#### 3. Demo runbook

**File**: `README.md`

**Intent**: Add a "Demo trybu kryzysowego (lokalnie)" section with these steps: `npx supabase db reset`, sign up locally, run `grant_coordinator` in Studio, open `/koordynator`, activate a power outage at 31-001 with 5 km, and run the perf script.

**Contract**: A new README section, in Polish like the existing operator runbook.

### Success Criteria:

#### Automated Verification:

- The reset seeds the data: `npx supabase db reset` (no errors), with roughly 500 matchable profiles reported by a `select count(*)` included in the runbook
- pgTAP still passes with the seed loaded: `npm run test:db`

#### Manual Verification:

- `scripts/perf-crisis.sql` shows `activate_crisis` under 1 s on 20k profiles at a 20 km radius, with the GIST index in the plan.
- A coordinator activation at 31-001 with 5 km returns a plausible, non-empty ranking in Studio.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Activation and ranked list UI

### Overview

This phase is the coordinator-facing flow: the activation form and the list of active crises on `/koordynator`, the activation endpoint, the crisis page with the ranked list, the middleware wiring and smoke coverage.

### Changes Required:

#### 1. Types

**File**: `src/types.ts`

**Intent**: Add the DTOs shared by the service, the pages and the island.

**Contract**:

- `CrisisTypeDTO { slug, name }`
- `RadiusKm = 1 | 2 | 5 | 10 | 20`
- `ActivateCrisisInput { crisisType, locationSource, postcode, lat, lng, radiusKm }`
- `CrisisDTO { id, typeName, radiusKm, activatedAt, matchCount, status }`
- `CrisisMatchDTO { rank, position, distanceKm, skills: { slug, name, tier: "priority" | "supporting", level: SkillLevel | null }[] }`

#### 2. Validation

**File**: `src/lib/validation/crisis.ts`

**Intent**: A zod parser for the activation form, mirroring `src/lib/validation/profile.ts`. It accepts only the radius presets, requires a postcode or a lat/lng pair according to the source, and returns a Polish message on failure.

**Contract**: `parseCrisisForm(form: FormData): { success: true; data: ActivateCrisisInput } | { success: false; message: string }`.

#### 3. Crisis service

**File**: `src/lib/services/crisis.ts`

**Intent**: A thin wrapper over the RPCs and the `crises` read, following `src/lib/services/profile.ts`: errors throw with the code only, and DB error messages map to Polish. It never logs input values, because the epicentre can reveal an address in context.

**Contract**:

- `getCrisisTypes(supabase)`
- `activateCrisis(supabase, input) → { ok: true; id } | { ok: false; message }`, which maps `not_coordinator`, `unknown_postcode`, `outside_poland`, `invalid_radius`, `unknown_crisis_type` and `location_required` to Polish messages.
- `listActiveCrises(supabase)`
- `getCrisis(supabase, id)`, which returns null when the crisis is not visible or does not exist.
- `getCrisisMatches(supabase, id)`, which joins skill names from the taxonomy for display.

#### 4. Activation endpoint

**File**: `src/pages/api/koordynator/kryzysy.ts`

**Intent**: Handle the form POST.

**Contract**: `POST` only.

- Anonymous → `/auth/signin` (the middleware does this).
- Non-coordinator → 403 (the middleware does this, and the RPC is the second line).
- Invalid input or an RPC error → 302 `/koordynator?error=<msg>`.
- Success → 302 `/koordynator/kryzys/<id>`.

#### 5. Middleware

**File**: `src/middleware.ts`

**Intent**: Gate the new endpoint prefix.

**Contract**: Add `"/api/koordynator"` to both `PROTECTED_ROUTES` and `COORDINATOR_ROUTES`. No other behaviour change.

#### 6. Activation form island

**File**: `src/components/crisis/CrisisActivationForm.tsx`

**Intent**: A React form that posts to `/api/koordynator/kryzysy`. It has a crisis-type select, the existing `LocationPicker` for the epicentre, and radius preset buttons (default 5 km). The submit button is disabled while the location is incomplete. The copy is Polish and the layout is mobile-first.

**Contract**: The props are `{ crisisTypes: CrisisTypeDTO[] }`. It posts the fields `crisis_type`, `location_source`, `postcode`, `lat`, `lng` and `radius_km`. It reuses `LocationPicker` unchanged. If its postcode lookup returns a coarsened point for display, that is fine: the server resolves the raw centroid from the postcode.

#### 7. Coordinator panel

**File**: `src/pages/koordynator/index.astro`

**Intent**: Replace the placeholder with the activation form, an `?error=` alert (the profile page pattern), and the list of active crises, each linking to its page with the type, radius, time and match count.

**Contract**: The page renders the island with `client:load`. On a load failure it shows a Polish error and no stack.

#### 8. Crisis page

**File**: `src/pages/koordynator/kryzys/[id].astro`

**Intent**: Show the crisis header and the ranked list. Each row has the place, "Osoba #N", skill chips with a priority or supporting marker and the level, and the distance (`< 0,5 km` for zero). Above the list, a short Polish note says the list is a snapshot from activation and that contacts become available after confirmation (later versions). If there are more than 200 matches, it says how many are not shown.

**Contract**: It is static Astro, with no island. An invalid UUID or an unknown or invisible crisis gives a 404 page. The prefix gate already provides `Cache-Control: private, no-store`.

#### 9. Smoke steps

**File**: `scripts/smoke.mjs`

**Intent**: Cover the anonymous and resident boundaries of the new routes.

**Contract**:

- Readonly: `koordynator crisis page redirects anonymous user` (`GET /koordynator/kryzys/00000000-0000-0000-0000-000000000000` → 302 `/auth/signin`). `crisis activation redirects anonymous user` (`POST /api/koordynator/kryzysy` → 302 `/auth/signin`).
- Write: `crisis activation denies resident` (POST with a valid body → 403, `no-store`). `crisis page denies resident` (→ 403 "Brak dostępu").

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Type check passes: `npx astro check`
- Build passes: `npm run build`
- Smoke passes against the local dev server: `npm run smoke`
- pgTAP still passes: `npm run test:db`

#### Manual Verification:

- As a locally granted coordinator with the seed loaded, a power outage at 31-001 with 5 km lands on the crisis page with a ranked list. From clicking "Aktywuj" to the rendered list takes ≤ 3 s.
- Activation works by postcode with the map tiles blocked (offline tiles), which shows the list doesn't depend on external services.
- Rows show tied places correctly, "Osoba #N", tier markers, levels and rounded distances. No coordinates, emails or UUIDs of residents appear in the HTML source.
- A second coordinator account sees the same crisis in the active list and can open it.
- On a phone-width viewport (375 px), the form and the list are usable with no horizontal scroll.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- No unit runner exists (Module 3 introduces one). The ranking rule is tested where it lives, in pgTAP.

### Integration Tests:

- pgTAP (`supabase/tests/crisis_ranking_test.sql`) covers the ranking rule, ties, the radius, eligibility, snapshot integrity, the cascade, and every access boundary for `anon`, residents and coordinators.
- Smoke covers the HTTP gates for anonymous users and residents on the new page and endpoint.

### Manual Testing Steps:

1. `npx supabase db reset`, sign up locally, then `select public.grant_coordinator('<email>', 'demo');` in Studio.
2. Open `/koordynator` and activate "Awaria prądu" at 31-001 with 5 km. Check the list renders in ≤ 3 s and that electricians and generator owners lead.
3. Activate "Powódź" at the same point with 5 km and compare: closer residents with supporting skills should rise relative to the power outage.
4. Block `tile.openstreetmap.org` in the browser and activate by postcode. It still works.
5. Sign in as a resident and open the crisis URL. Expect 403.
6. Run `scripts/perf-crisis.sql` and record the timing in the review.

## Performance Considerations

The activation is a single SQL statement chain. The candidate set comes from `st_dwithin` on the GIST-indexed `profiles.location`, then a join to `profile_skills` and `crisis_type_skills` on indexed keys, with window functions for `rank` and `position`. At 20k profiles and 20 km, this should run well under 1 s. The page then needs one `crises` read and one `get_crisis_matches` call, limited to 200 rows. Workers Free allows 50 subrequests, and the flow uses about 4 per request.

## Migration Notes

- These are additive migrations with no change to existing tables. Rollback means dropping the 4 new tables and 2 functions, and no resident data is affected.
- The production push order is the Phase 1 migrations first (operator), then the Phase 3 merge. `seed.sql` is never pushed to production, because `supabase db push` does not run seeds.

## References

- Roadmap: `context/foundation/roadmap.md` (S-03)
- PRD: `context/foundation/prd.md` (US-01, FR-009, FR-010, Business Logic)
- Matrix and scoring spec: `docs/shape_not.md:62-99`
- Eligibility contract: `supabase/migrations/20260927120000_resident_profile_schema.sql:172-191`
- Role gate: `supabase/migrations/20260928120000_coordinator_role.sql:46-61`, `src/middleware.ts`
- Patterns: `src/lib/services/profile.ts`, `src/lib/validation/profile.ts`, `src/pages/api/profile.ts`, `supabase/tests/coordinator_role_test.sql`
- Prior plan: `context/archive/2026-09-28-coordinator-role-grant/plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Crisis schema, matrix and ranking

#### Automated

- [x] 1.1 Migrations apply cleanly: `npx supabase db reset` — 3673f80
- [x] 1.2 pgTAP suites pass (new and existing): `npm run test:db` — 3673f80
- [x] 1.3 Types regenerate with no diff after a second run — 3673f80
- [x] 1.4 Type check passes: `npx astro check` — 3673f80
- [x] 1.5 Lint passes: `npm run lint` — 3673f80

#### Manual

- [x] 1.6 `crisis_type_skills` matches the plan's mapping table — 3673f80
- [x] 1.7 Migrations pushed to the production database before Phase 3 merges (verified 2026-10-02 via `supabase migration list --linked`)

### Phase 2: Demo data and performance check

#### Automated

- [x] 2.1 The reset seeds about 500 matchable profiles: `npx supabase db reset` — 3b9ac3d
- [x] 2.2 pgTAP still passes with the seed loaded: `npm run test:db` — 3b9ac3d

#### Manual

- [x] 2.3 Perf script: `activate_crisis` under 1 s on 20k profiles at 20 km, GIST index used — 3b9ac3d
- [x] 2.4 Coordinator activation at 31-001 with 5 km returns a plausible ranking — 3b9ac3d

### Phase 3: Activation and ranked list UI

#### Automated

- [x] 3.1 Lint passes: `npm run lint` — 855417d
- [x] 3.2 Type check passes: `npx astro check` — 855417d
- [x] 3.3 Build passes: `npm run build` — 855417d
- [x] 3.4 Smoke passes against the local dev server: `npm run smoke` — 855417d
- [x] 3.5 pgTAP still passes: `npm run test:db` — 855417d

#### Manual

- [x] 3.6 From activation to the rendered list ≤ 3 s with the seed loaded — 855417d
- [x] 3.7 Activation by postcode works with map tiles blocked — 855417d
- [x] 3.8 Rows show tied places, pseudonyms, tiers, levels and rounded distances, with no identifying data in the HTML — 855417d
- [x] 3.9 A second coordinator sees and opens the same crisis — 855417d
- [x] 3.10 Form and list usable at 375 px with no horizontal scroll — 855417d
