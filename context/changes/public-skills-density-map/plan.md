# Public Skills-Density Map Implementation Plan

## Overview

Roadmap S-11 (FR-008): an anonymous visitor or a resident can open `/mapa` and see where skills are concentrated, as 2 km cells banded by how many people are in them, with no personal data. This is the everyday reason to open the app, which keeps the directory fresh between crises. Aggregation is the whole slice: in a sparse pilot area, a carelessly drawn cell is one household.

## Current State Analysis

- `profiles.location` stores only the centre of a 500 m cell in EPSG:2180 (`coarsen_point`, `supabase/migrations/20260927120000_resident_profile_schema.sql`). The typed postcode is never stored (`20260927150000_profile_postcode_never_stored.sql`). A 500 m cell is still too fine to publish.
- RLS on `profiles` and `profile_skills` is owner-only. No anonymous read path over resident data exists. The precedent for cross-resident reads is a `security definer` function owned by `postgres` (`activate_crisis`, `get_crisis_matches` in `20261001120000_crisis_matching.sql:97-284`).
- `profile_is_matchable(user_id)` (a location plus at least one skill) is the single eligibility rule, shared with crisis matching. S-13 (pause) will extend that rule later.
- `skill_categories` holds 6 categories (`medyczne`, `techniczne`, `logistyczne`, `jezykowe`, `wojskowe`, `sprzet`) and is readable by `anon`.
- Leaflet and react-leaflet are already dependencies. `src/components/profile/LocationPicker.tsx` shows the OSM tile layer, the Poland default view and a `client:only="react"` mount.
- `POST /api/kody-pocztowe` resolves a postcode to its coarsened centroid. It is anonymous and keeps the code out of the URL.
- The landing page (`src/components/Welcome.astro`) still shows the starter's English "10x Astro Starter" hero.
- `context/foundation/lessons.md` forbids `Cache-Control: public` on any route behind the auth middleware.
- `supabase/seed.sql` holds about 500 synthetic residents around Kraków, which is enough to see real cells locally.

## Desired End State

- `/mapa` is public. It opens on Poland, or on the resident's own coarsened point when a signed-in resident has one. It has a postcode field that recentres the map and a filter: "Wszystkie" plus the 6 categories.
- Each visible cell is a 2 km EPSG:2180 square, coloured by band: 5–9, 10–24 or 25+ distinct matchable residents (who have a skill in the selected category, when a category is selected). A cell with 0–4 people is not drawn, so it looks exactly like an empty cell. A legend explains this.
- No exact count, user id or sub-cell coordinate ever leaves the database through this path.
- The landing page pitches SkillNet in Polish and links to the map, and the Topbar has a "Mapa" link for everyone.
- Verify with `npm run test:db` (the privacy suite), `npm run smoke` (the anonymous map steps) and a visual check against the local seed.

### Key Discoveries:

- 2000 is a multiple of 500, so every stored 500 m cell centre (`500n + 250`) falls inside exactly one 2 km cell. `floor(x / 2000)` is unambiguous, and no point sits on a boundary (`coarsen_point`, `20260927120000_resident_profile_schema.sql:68-90`).
- Owner-`postgres` `security definer` RPCs bypass RLS. The function body is the only privacy boundary, so it must emit nothing but cell geometry and a band (pattern at `20261001120000_crisis_matching.sql:239-284`).
- `client:only="react"` is required for Leaflet, which touches `window` (`src/pages/profil.astro:78`).
- Smoke `readonlySteps` also run against production (`scripts/smoke.mjs:69`), so the anonymous map steps belong there.

## What We're NOT Doing

- No per-skill filter. Rare skills would almost always be suppressed, and more views give more differencing pairs. Categories only.
- No exact counts and no "1–4" bucket. That would be a public gap map.
- No zoom-dependent grids and no gmina choropleth. There is one fixed 2 km grid.
- No viewport or bbox queries. The client fetches the country once per filter, so the visitor's area never reaches a URL or the logs.
- No availability weighting. Inclusion is `profile_is_matchable` only, with or without a phone, as FR-004 says. Pausing comes with S-13 through the same rule.
- No snapshot or materialised view and no scheduled refresh. Counts are live; bands blunt differencing over time.
- No highlighting of the resident's own cell, and no residents or pins on the map.
- No coordinator-specific map view (FR-013 is nice-to-have and out of the MVP).

## Implementation Approach

Every privacy guarantee lives in one SQL function, so the API, the page and any direct PostgREST call get the same guarantees, as in S-01. The Worker only validates the category, calls the RPC and passes the cells through. The page is an Astro shell with a React-Leaflet island that fetches `GET /api/mapa?kategoria=…` when the filter changes.

## Critical Implementation Details

- **Suppression is applied inside the aggregate, before banding.** The function groups by cell, counts `distinct user_id`, drops `count < 5` with a `having` clause, and only then maps the count to a band. A band must never be computed for a suppressed cell, and the count must never be selected into the output.
- **Category counting is distinct per person.** A resident with three medical skills counts once in `medyczne` and once in "Wszystkie". Join `profile_skills` through `skills.category_slug` and count `distinct p.user_id`, never rows.
- **Caching follows the lesson.** `/api/mapa` and `/mapa` both pass through the auth middleware, so they use `Cache-Control: private, max-age=300` and never `public`.

## Phase 1: Aggregation RPC and Privacy Tests

### Overview

This phase adds the only read path from resident data to the public, and the pgTAP suite that pins its guarantees.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/20261005120000_public_skills_density.sql`

**Intent**: Add a `security definer` function that returns banded 2 km cells for all matchable residents, or for those with a skill in one category. Header comment states the guarantees (grid size, k = 5, distinct residents, bands, no counts or ids out).

**Contract**:

- `public.get_skills_density(p_category text default null) returns table (cell jsonb, band smallint)`, `language plpgsql` (or sql), `stable`, `security definer`, `set search_path = ''`, owner `postgres`.
- `cell`: a GeoJSON Polygon (`st_asgeojson` of the 2 km `st_makeenvelope` in SRID 2180, transformed to 4326, cast to jsonb).
- `band`: `1` for 5–9, `2` for 10–24, `3` for 25 or more distinct residents. Cells with fewer than 5 are not returned.
- Eligibility: `public.profile_is_matchable(user_id)`. A category filter requires at least one `profile_skills` row whose skill is in `p_category`.
- `p_category` not null and not in `skill_categories` → `raise exception 'unknown_category'`.
- Output ordered deterministically (for example by cell x, then y) so tests and responses are stable.
- `revoke execute … from public`, then `grant execute … to anon, authenticated`.

#### 2. pgTAP suite

**File**: `supabase/tests/public_skills_density_test.sql`

**Intent**: Pin the privacy guarantees with fixtures placed in known 2 km cells. Follow `unregister_and_erase_test.sql`: fixtures inserted as `postgres` after clearing `profiles`, checks run under `set local role anon`, everything rolled back.

**Contract**: the cases listed under Testing Strategy → Unit Tests.

#### 3. Generated types

**File**: `src/db/database.types.ts`

**Intent**: Regenerate so `get_skills_density` is typed for the service.

**Contract**: `npm run db:types`.

### Success Criteria:

#### Automated Verification:

- The migration applies cleanly: `npx supabase db reset`
- The pgTAP suites pass, including the new one: `npm run test:db`
- The types are regenerated and the type check passes: `npm run db:types && npx astro check`

#### Manual Verification:

- In Studio's SQL editor, running as `anon`, `select * from get_skills_density()` against the seed returns only cells around Kraków with bands from 1 to 3 and no other columns.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Service and Public API

### Overview

This phase exposes the RPC through a typed service and an anonymous JSON endpoint, and adds smoke coverage.

### Changes Required:

#### 1. DTO types

**File**: `src/types.ts`

**Intent**: Add the wire shape shared by the API and the island.

**Contract**: `DensityBand = 1 | 2 | 3`. `DensityCellDTO { cell: GeoJSON Polygon (a minimal local type, or `GeoJSON.Polygon` from `@types/geojson` if already available transitively via `@types/leaflet`); band: DensityBand }`.

#### 2. Service

**File**: `src/lib/services/density-map.ts`

**Intent**: Call `get_skills_density`, validate the rows with zod (bands 1–3 only, Polygon geometry), and map `unknown_category` to a typed result. Never log the response.

**Contract**: `getSkillsDensity(supabase, category: string | null): Promise<DensityCellDTO[] | "unknown_category">`. Throws on other errors with only the error code, as `getTaxonomy` in `src/lib/services/profile.ts` does.

#### 3. API route

**File**: `src/pages/api/mapa.ts`

**Intent**: An anonymous `GET` endpoint. The category is not personal data, so it may travel in the query string.

**Contract**:

- `GET /api/mapa?kategoria=<slug>`. A missing or empty `kategoria` means all skills.
- `kategoria` must match `^[a-z-]{1,40}$`, or the route answers `400` without calling the database.
- `unknown_category` → `400 { error }`. Supabase not configured → `503`. Any other failure → `500` with a generic Polish message.
- On success: `200` with `DensityCellDTO[]` and `Cache-Control: private, max-age=300`. Errors use `no-store`.
- Do not add `/api/mapa` or `/mapa` to `PROTECTED_ROUTES`.

#### 4. Smoke steps

**File**: `scripts/smoke.mjs`

**Intent**: Add anonymous steps to `readonlySteps` so they also run against production.

**Contract**: `/mapa` → 200; `/api/mapa` → 200 with a body that excludes `user_id` and `"count"`; `/api/mapa?kategoria=medyczne` → 200; `/api/mapa?kategoria=nie-ma` → 400.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- The type check passes: `npx astro check`
- Smoke passes against the local dev server: `npm run smoke`

#### Manual Verification:

- `curl -i http://localhost:4321/api/mapa?kategoria=medyczne` returns a JSON array of `{cell, band}` with `Cache-Control: private, max-age=300`, and no `public`.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Map Page and Landing

### Overview

This phase adds the public page, the Leaflet island, and the landing and Topbar entry points. All UI copy is in Polish.

### Changes Required:

#### 1. Map island

**File**: `src/components/map/DensityMap.tsx`

**Intent**: A React-Leaflet map with an OSM tile layer and a GeoJSON layer styled by band (three purple intensities, consistent with the app's palette). It has a filter (segmented buttons or a select: "Wszystkie" plus the categories), a postcode field that calls `POST /api/kody-pocztowe` and recentres the map (no marker is drawn), and a legend. The legend shows the three bands and the sentence "Obszary, w których jest mniej niż 5 osób, nie są pokazywane — wygląda to tak samo jak brak osób." The island fetches `/api/mapa` whenever the filter changes and ignores stale responses (the `latestLookup` pattern from `LocationPicker.tsx`). Loading, error and "no cells in this view" states are shown in a `role="status"` line.

**Contract**: props `{ categories: { slug: string; name: string }[]; start: { lat: number; lng: number } | null }`. With `start`, the map opens at about zoom 12; without it, on the Poland view (`52.07, 19.48`, zoom 6). Reuse the constants from `LocationPicker` by extracting them to a small shared module if that is clean; otherwise duplicate them.

#### 2. Page

**File**: `src/pages/mapa.astro`

**Intent**: A public page in `Layout` with the Topbar, a short Polish explanation of what the map shows and what it never shows, and `<DensityMap client:only="react" …>`. It loads the categories (through `getTaxonomy` or a lighter query). For a signed-in user it reads the user's own coarsened point (`get_my_profile` through the existing profile service) as `start`. When Supabase isn't configured, it shows the banner and a message instead of the map.

**Contract**: the route is `/mapa`, it is not protected, and it sends `Cache-Control: private` (it renders per user through the Topbar and `start`).

#### 3. Landing and Topbar

**Files**: `src/components/Welcome.astro`, `src/components/Topbar.astro`

**Intent**: Replace the starter hero and feature cards with a short Polish SkillNet pitch. The primary button is "Zobacz mapę umiejętności" (`/mapa`), with sign-up and sign-in as secondary. Keep the `<slot />` used for the account-erased notice. Add a "Mapa" link to both Topbar branches.

**Contract**: the smoke step "home renders" still returns 200. The `?konto-usuniete=1` notice still shows.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- The type check passes: `npx astro check`
- The build passes: `npm run build`
- Smoke passes against the local dev server: `npm run smoke`

#### Manual Verification:

- Signed out, `/mapa` opens on Poland. Typing `31-001` recentres on Kraków, where the seed cells are visible in three shades.
- Switching to each category redraws the cells. A rare category shows fewer cells, or the "brak obszarów" status.
- Signed in as a resident with a location, `/mapa` opens centred on that resident's area.
- The landing page shows the Polish pitch and the map button, the Topbar "Mapa" link works when signed in and signed out, and the account-erased notice still appears.
- The Network panel shows `/api/mapa` requests carrying only `kategoria`, and the postcode travels in a POST body.
- The page is usable at phone width (375 px).

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding.

---

## Testing Strategy

### Unit Tests:

The pgTAP suite `supabase/tests/public_skills_density_test.sql` carries the privacy contract:

- `anon` can execute `get_skills_density`, but still cannot `select` from `profiles` or `profile_skills`.
- The output columns are exactly `cell` and `band`. No count, no id.
- **k threshold:** a cell with 4 matchable residents returns no row; a cell with 5 returns `band = 1`.
- **Band edges:** 9 → 1, 10 → 2, 24 → 2, 25 → 3.
- **Distinct residents:** 4 residents plus 1 resident who has 3 medical skills → 5 people in `medyczne`, so the cell is shown. 4 residents with 2 medical skills each → 4 people, so the cell is hidden (8 skill rows must not count).
- **Grid:** 5 residents in two different 500 m cells inside the same 2 km cell are aggregated into one returned cell. Residents in adjacent 2 km cells are not merged.
- **Eligibility:** a profile with no skills, or with no location, is not counted (a cell at 4 + 1 non-matchable stays hidden). A resident without a phone is counted.
- **Category filter:** a cell with 5 people who have only `techniczne` skills appears for `null` and for `techniczne`, but not for `medyczne`.
- **Unknown category** raises `unknown_category`.
- **Geometry:** the returned `cell` is a GeoJSON Polygon whose corners lie within the expected 2 km envelope (checked through one known fixture cell).

### Integration Tests:

- Smoke read-only steps (Phase 2): the page and API respond anonymously, the bad category gets a 400, and the body excludes `user_id` and `count`.

### Manual Testing Steps:

1. Run `npx supabase db reset` (it loads the Kraków seed), then `npm run dev`.
2. Signed out: open `/mapa`, type `31-001`, and check that 3 shades are visible and the legend sentence is present.
3. Cycle through all categories and confirm that no cell appears in a category view where it is missing from "Wszystkie".
4. Sign in as a resident with a location: the map starts at that resident's area.
5. Check the landing page, the Topbar links and `/?konto-usuniete=1`.

## Performance Considerations

Each request scans the matchable profiles once and groups them in Postgres. With 500 seed residents that's trivial, and at pilot scale the response is a few hundred small polygons. The Worker does one subrequest and passes the cells through, well within the Free plan's 10 ms CPU. If the directory grows nationally, the follow-up is a viewport-scoped variant with the viewport in a POST body, which is out of scope here.

## Migration Notes

The change is additive: one new function, no table changes and no backfill. Rollback is `drop function public.get_skills_density(text)` plus a revert of the page and route.

## References

- Roadmap: `context/foundation/roadmap.md` (S-11); PRD FR-008, FR-004
- Coarsening and RLS: `supabase/migrations/20260927120000_resident_profile_schema.sql`
- Security-definer precedent: `supabase/migrations/20261001120000_crisis_matching.sql:97-284`
- Map patterns: `src/components/profile/LocationPicker.tsx`
- Caching rule: `context/foundation/lessons.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Aggregation RPC and Privacy Tests

#### Automated

- [x] 1.1 The migration applies cleanly: `npx supabase db reset`
- [x] 1.2 The pgTAP suites pass, including the new one: `npm run test:db`
- [x] 1.3 The types are regenerated and the type check passes: `npm run db:types && npx astro check`

#### Manual

- [x] 1.4 As `anon`, `get_skills_density()` returns only seed cells with bands 1–3 and no other columns

### Phase 2: Service and Public API

#### Automated

- [ ] 2.1 Lint passes: `npm run lint`
- [ ] 2.2 The type check passes: `npx astro check`
- [ ] 2.3 Smoke passes against the local dev server: `npm run smoke`

#### Manual

- [ ] 2.4 `/api/mapa?kategoria=medyczne` returns `{cell, band}` rows with `Cache-Control: private, max-age=300`

### Phase 3: Map Page and Landing

#### Automated

- [ ] 3.1 Lint passes: `npm run lint`
- [ ] 3.2 The type check passes: `npx astro check`
- [ ] 3.3 The build passes: `npm run build`
- [ ] 3.4 Smoke passes against the local dev server: `npm run smoke`

#### Manual

- [ ] 3.5 Signed out, `/mapa` opens on Poland and `31-001` recentres on the seed cells in three shades
- [ ] 3.6 Category switching redraws cells, and a sparse category shows fewer cells or the empty status
- [ ] 3.7 A signed-in resident with a location gets a map centred on their area
- [ ] 3.8 The landing pitch, the Topbar "Mapa" link and the account-erased notice all work
- [ ] 3.9 Network requests carry only `kategoria`, and the postcode stays in a POST body
- [ ] 3.10 The page is usable at 375 px width
