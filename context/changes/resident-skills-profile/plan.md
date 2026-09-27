# Resident Skills Profile Implementation Plan

## Overview

Roadmap slice S-01 (FR-002, FR-003): a signed-in resident can pick skills from a fixed taxonomy, give each skill a self-declared level of 1–3, and set an approximate location by postcode or map pin. The interface is in Polish and works on a phone. This is the first domain schema in SkillNet. S-03 (crisis ranking), S-06, S-11, S-13 and S-14 all read from it, so the data model is built for a PostGIS radius query from day one, and its privacy guarantees are enforced in the database, not in application code.

## Current State Analysis

- The code is still the `10x-astro-starter` scaffold. It has auth only: `src/pages/api/auth/{signin,signup,signout}.ts`, `src/middleware.ts` with `PROTECTED_ROUTES = ["/dashboard"]`, and `src/lib/supabase.ts`, whose `createClient()` returns `null` when env is missing.
- There is no `supabase/migrations/`, no PostGIS, no domain tables, no `src/types.ts` and no `src/lib/services/`. `supabase/seed.sql` is referenced by `config.toml` but doesn't exist, and it only runs on a local `db reset` anyway, never on a production `db push`.
- All UI copy is English starter copy. `src/layouts/Layout.astro` has `<html lang="en">` and a default title of "10x Astro Starter".
- The only test is `scripts/smoke.mjs`, which checks exact redirect targets. CI (`.github/workflows/ci.yml`) runs lint, `astro check` and build. It also runs a smoke job that starts a local Supabase with most services excluded.
- zod is only a transitive dependency. There is no map library.
- Production Supabase (`grbhvhfwwjmzmrbzpxzu`, `eu-central-1`) has **never been linked or migrated**. `supabase login` and `link` were deferred in `context/changes/deployment/deployment-plan.md:69,121`.
- Prior decisions: the S-03 ranking must be a single PostGIS RPC (`context/foundation/infrastructure.md:115,169`), and no personal data may appear in `console.*`, per CLAUDE.md.

## Desired End State

- A resident who signs in with an incomplete profile lands on `/profil`. There they see skills grouped under six Polish category headings. They tick skills and choose a level (Podstawowy kurs / Praktyk / Profesjonalista) for each non-equipment skill. They set a location either by typing a postcode or by placing a pin on a map, and they save. After saving, the map shows the **coarsened** point that is actually stored, and the page shows "Profil kompletny" once there is a location and at least one skill.
- In the database, no stored location is ever more precise than the centre of a 500 m grid cell, whatever the write path. A resident can read and write only their own profile rows. Postcodes resolve through a local centroid table covering all of Poland, with no runtime external service.
- `profile_is_matchable(user_id)` is the single eligibility rule S-03 reuses.
- Verify with: `supabase test db` (pgTAP) passes; `npm run smoke` passes with the new profile steps; lint, `astro check` and build pass; the page is usable at 375 px width.

### Key Discoveries:

- Auth endpoints answer with redirects and pass errors as `?error=` (`src/pages/api/auth/signin.ts:13-20`). The profile form follows the same pattern.
- `scripts/smoke.mjs:52-55` asserts that sign-in redirects to `/`. The sign-in nudge changes that for a new user, so the smoke test must change in the same phase.
- `supabase/config.toml` exposes `extensions` on the search path (`extra_search_path = ["public", "extensions"]`), so PostGIS goes in schema `extensions`, per the Supabase convention.
- react-leaflet v5 requires React 19, which the project already uses. Leaflet touches `window`, so the island must be `client:only="react"`.
- GUGiK PRG address points (about 7M points, GML per voivodeship, EPSG:2180) are open data. OpenAddresses republishes them as CSV. Either source reduces to a lon/lat/postcode CSV.

## What We're NOT Doing

- Phone number and availability (S-06), visibility controls (S-12), pause (S-13), unregister and erasure (S-14). The `on delete cascade` from `auth.users` is the only erasure hook added here.
- Display name or pseudonym. No FR requires it yet; S-06 or S-08 adds it when the operational list needs a name.
- A free-text "other" skill. The PRD dropped it (FR-002).
- In-product taxonomy editing (FR-018, parked). The taxonomy changes only by migration.
- A "use my current location" (browser geolocation) button.
- Translating the sign-in and sign-up forms, the landing page and the dashboard body. S-05 rewrites sign-up; only the shell (`lang`, Topbar, Layout title) becomes Polish here.
- Any read path for other people's profiles (the coordinator's ranking is S-03, the density map is S-11).
- Storing an exact location. The exact pin never reaches a table.
- Rejecting a postcode/pin mismatch. There is a single location and the last edit wins.

## Implementation Approach

Enforce invariants in Postgres. Everything else stays thin.

1. **Schema first, proven by pgTAP.** Triggers resolve postcodes, coarsen every point and enforce the level rule, so any write path (the RPC, a direct PostgREST PATCH allowed by RLS, a future admin script) gets the same guarantees. One RPC, `save_my_profile`, writes the location and the whole skill set atomically. A single supabase-js delete-then-insert would be two non-atomic requests.
2. **Reference data as migrations.** The taxonomy (about 30 rows, hand-written) and postcode centroids (about 22k rows, generated by a committed script) both ship as migrations, so production `db push` gets them.
3. **API follows the auth pattern.** An HTML form POST goes to `/api/profile`, the input is validated with zod, the RPC is called, and the handler redirects to `/profil?zapisano=1` or `/profil?error=<Polish message>`. A small JSON GET endpoint lets the island preview a postcode's coarsened centroid.
4. **UI last.** An Astro page loads the taxonomy and the current profile server-side and passes them to one React island (skills picker and Leaflet location picker) that submits a normal form.

## Critical Implementation Details

- **Deploy ordering (first migration ever).** Cloudflare Workers Builds deploys every push to `master`, but nothing applies Supabase migrations. Before the PR merges, a human must run `npx supabase login`, `npx supabase link --project-ref grbhvhfwwjmzmrbzpxzu`, `npx supabase db push --dry-run` and then `npx supabase db push`. The migrations are purely additive, so pushing them before the code deploy is safe. Merging first would ship a `/profil` that errors and a sign-in that calls a missing RPC. The sign-in fallback below limits the damage, but the ordering still matters.
- **Coarsening maths.** Snap in EPSG:2180, Poland's metric CS, not in degrees. Take `x' = floor(x/500)*500 + 250` and the same for `y`, then transform back to 4326. This yields cell *centres*, so two pins in one cell store identical points, and the stored point is at most about 354 m from the input. Postcode centroids are coarsened the same way when they are copied into a profile. The `postcodes` table itself keeps raw centroids, which are not personal data.
- **Preview vs stored point.** A dragged pin shows the raw drag position until the resident saves; after the save redirect, the map renders the stored, coarsened point. A postcode preview returns the already coarsened centroid, so it doesn't jump after saving. The form carries a hint: "Lokalizacja jest zaokrąglana do ok. 500 m — nikt nie zobaczy Twojego dokładnego adresu."
- **Leaflet under a bundler.** Leaflet's default marker icon resolves image URLs relative to its CSS and breaks under Vite. Use a `CircleMarker` or an `L.divIcon` instead of the default `Marker` icon. Tiles come from OpenStreetMap and need an attribution. The map is optional UX, and the postcode path works without it.
- **Sign-in nudge must not block sign-in.** If the `profile_is_matchable` RPC fails (missing migration, network), `signin.ts` falls back to redirecting to `/`.

## Phase 1: Profile schema and guarantees

### Overview

Enable PostGIS. Add the taxonomy, postcode, profile and profile-skill tables with RLS, the triggers that enforce the privacy and level rules, the save/read RPCs and the matchability predicate. Prove all of it with pgTAP and run that in CI.

### Changes Required:

#### 1. Schema migration

**File**: `supabase/migrations/20260927120000_resident_profile_schema.sql`

**Intent**: Create the first domain schema, with every invariant S-01 promises enforced at the database level.

**Contract**:
- `create extension if not exists postgis with schema extensions;`
- `skill_categories(slug text PK, name_pl text not null, sort smallint not null)`
- `skills(slug text PK, category_slug text not null FK → skill_categories, name_pl text not null, has_level boolean not null, sort smallint not null)`
- `postcodes(postcode text PK check (postcode ~ '^\d{2}-\d{3}$'), centroid extensions.geography(Point,4326) not null, address_count integer not null)`: raw centroids, not personal data.
- `profiles(user_id uuid PK references auth.users on delete cascade, postcode text null, location_source text null check in ('postcode','pin'), location extensions.geography(Point,4326) null, created_at timestamptz default now(), updated_at timestamptz default now())`, with a GIST index on `location` and table checks: `(location_source is null) = (location is null)`, `location_source = 'postcode' ⇒ postcode is not null`, `location_source = 'pin' ⇒ postcode is null`.
- `profile_skills(user_id uuid FK → profiles on delete cascade, skill_slug text FK → skills, level smallint null check (level between 1 and 3), PK (user_id, skill_slug))`, with an index on `skill_slug` for S-03.
- Trigger `profiles_resolve_and_coarsen`, BEFORE INSERT OR UPDATE on `profiles`:
  - When `location_source = 'postcode'`, look up the centroid. If there is none, raise with message `unknown_postcode`.
  - When `location_source = 'pin'`, set `postcode := null` and reject points outside Poland's bounding box (lat 49.0–54.9, lng 14.1–24.2) with message `outside_poland`.
  - When `location_source` is null, set `location` and `postcode` to null.
  - In every case, finish by setting `location := coarsen_point(location)` and bumping `updated_at`.
- Trigger `profile_skills_check_level`, BEFORE INSERT OR UPDATE: raise `level_required` if the skill has `has_level` and `level` is null; raise `level_not_applicable` if it lacks `has_level` and `level` is not null.
- `public.coarsen_point(p extensions.geography) returns extensions.geography`, immutable: the 500 m EPSG:2180 cell-centre snap described in Critical Implementation Details.
- `public.profile_is_matchable(p_user_id uuid) returns boolean`, stable, `security invoker`: true iff a profile row has a non-null `location` and at least one `profile_skills` row. **This is the eligibility contract for S-03.** Invoker plus RLS means a coordinator calling it for someone else sees no rows and gets false. S-03's ranking RPC must be `security definer`, owned by the table owner, when it calls this function for other residents. That owner bypasses RLS, and the function does not use `auth.uid()`. No table change.
- `public.save_my_profile(p_location_source text, p_postcode text, p_lat double precision, p_lng double precision, p_skills jsonb) returns void`, security invoker: raises `not_authenticated` if `auth.uid()` is null. It upserts the caller's `profiles` row and replaces the caller's `profile_skills` with `p_skills` (`[{"slug": text, "level": int|null}]`) in one transaction, so any failure leaves the previous state intact.
- `public.get_my_profile() returns jsonb`, security invoker: `{postcode, location_source, lat, lng, skills: [{slug, level}], matchable}` for `auth.uid()`, or an empty-profile shape if there is no row.
- `public.lookup_postcode(p_postcode text) returns table(lat double precision, lng double precision)`: the coarsened centroid, or no rows.
- RLS enabled on all five tables, with separate policies per operation and role:
  - `skill_categories`, `skills`, `postcodes`: `select` for `anon` and for `authenticated` using `true`; no write policies.
  - `profiles`, `profile_skills`: `select`, `insert`, `update` and `delete` for `authenticated` using or with check `user_id = (select auth.uid())`; nothing for `anon`.
- Grant execute on `save_my_profile`, `get_my_profile` and `profile_is_matchable` to `authenticated` only, and on `lookup_postcode` to `anon` and `authenticated`.

#### 2. Taxonomy seed migration

**File**: `supabase/migrations/20260927120100_seed_skills_taxonomy.sql`

**Intent**: Seed the six categories and about 30 skills, so that every skill named in the seed spec's crisis matrix and team templates (`docs/shape_not.md` §4) has a row S-03 can match on. Slugs are stable identifiers, and Polish names are display-only.

**Contract**: the rows below. Equipment and "osoba silna fizycznie" have `has_level = false`; every other skill has `has_level = true`. Items not in the matrix are added only by a later migration.

| Category slug (name_pl) | Skills: slug, name_pl |
| --- | --- |
| `medyczne` (Medyczne) | `ratownik-medyczny` Ratownik medyczny · `lekarz` Lekarz · `pielegniarka` Pielęgniarka / pielęgniarz · `pierwsza-pomoc` Kurs pierwszej pomocy · `ratownik-wodny` Ratownik wodny · `psycholog` Psycholog · `opiekun-osob-starszych` Opiekun osób starszych |
| `techniczne` (Techniczne) | `elektryk` Elektryk · `informatyk` Informatyk · `radioamator` Radioamator |
| `logistyczne` (Logistyczne) | `kierowca-kat-b` Kierowca kat. B · `kierowca-kat-c` Kierowca kat. C · `sternik` Sternik (łódź) · `logistyk` Logistyk · `osoba-silna-fizycznie` Osoba silna fizycznie (no level) |
| `jezykowe` (Językowe) | `tlumacz-angielski` Język angielski · `tlumacz-ukrainski` Język ukraiński · `tlumacz-niemiecki` Język niemiecki · `tlumacz-migowy` Polski język migowy |
| `wojskowe` (Wojskowe / rezerwa) | `rezerwista` Rezerwista · `zolnierz-wot` Żołnierz WOT · `strazak-osp` Strażak / OSP |
| `sprzet` (Narzędzia i sprzęt) (no level for any) | `agregat-pradotworczy` Agregat prądotwórczy · `ups-magazyn-energii` UPS / magazyn energii · `pompa` Pompa do wody · `pila-lancuchowa` Piła łańcuchowa · `narzedzia-reczne` Narzędzia ręczne (siekiera, łom) · `lodz` Łódź / ponton · `samochod-terenowy` Samochód terenowy · `lokal-ogrzewany-klimatyzowany` Lokal ogrzewany / klimatyzowany |

#### 3. pgTAP tests

**File**: `supabase/tests/resident_profile_test.sql`

**Intent**: Prove the privacy, eligibility and atomicity guarantees in the layer that enforces them.

**Contract**: One transaction, rolled back at the end. It inserts two users into `auth.users`, inserts a fixture postcode (for example `00-950`) into `postcodes`, and switches identity via `set local role authenticated` and `request.jwt.claims`. Named cases:
- `rls_other_profile_invisible`: user A sees zero rows of B's `profiles` and `profile_skills`, and cannot update or delete them.
- `rls_anon_denied`: `anon` sees no rows in `profiles`.
- `pin_is_coarsened`: a pin is stored at the cell centre, not at the input.
- `same_cell_same_point`: two pins in one 500 m cell store equal points.
- `coarsened_within_radius`: the distance between input and stored point is ≤ 360 m.
- `postcode_resolves`: a known postcode stores its coarsened centroid.
- `unknown_postcode_raises`: raises `unknown_postcode`.
- `pin_clears_postcode`: switching from postcode to pin nulls `postcode` (last edit wins).
- `outside_poland_raises`
- `level_required`, `level_not_applicable`, `level_out_of_range`
- `matchable_truth_table`: no row → false; location only → false; skills only → false; both → true.
- `save_is_atomic`: `save_my_profile` with an unknown skill slug fails, and the previous skills are unchanged.

#### 4. Scripts and CI

**Files**: `package.json`, `.github/workflows/ci.yml`

**Intent**: Make the DB tests runnable locally and in CI, and make generated DB types available to the app.

**Contract**:
- Add `package.json` scripts `test:db` → `supabase test db` and `db:types` → `supabase gen types typescript --local > src/db/database.types.ts`, and commit the generated file.
- In the CI `smoke` job, add a `npx supabase test db` step right after "Start local Supabase".

### Success Criteria:

#### Automated Verification:

- Migrations apply cleanly on a fresh local DB: `npx supabase db reset`
- pgTAP suite passes: `npm run test:db`
- Generated types compile: `npm run db:types && npx astro check`
- Lint passes: `npm run lint`

#### Manual Verification:

- In Studio (http://localhost:54323), `profiles` and `profile_skills` show RLS enabled with separate select, insert, update and delete policies.
- The seeded taxonomy reads correctly in Polish (review of the category and skill list above).

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Postcode centroid data

### Overview

Build the centroid for every Polish postcode from PRG address points with a committed, zero-dependency script, and ship the output as a migration.

### Changes Required:

#### 1. Build script

**File**: `scripts/build-postcode-centroids.mjs`

**Intent**: Turn a large national address-point CSV into a compact, reproducible migration without committing the raw data.

**Contract**:
- CLI: `node scripts/build-postcode-centroids.mjs --out <migration path> [--lon LON --lat LAT --postcode POSTCODE] <csv files...>`. The column names default to the OpenAddresses headers.
- It streams line by line, because the input is multiple GB. It normalises `NNNNN` or `NN-NNN` to `NN-NNN` and skips invalid postcodes or coordinates. It accumulates the mean lon/lat and a count per postcode.
- It writes batched `insert into public.postcodes (postcode, centroid, address_count) values ... on conflict (postcode) do update ...` statements, with centroids as `extensions.st_setsrid(extensions.st_makepoint(lon, lat), 4326)::extensions.geography`.
- It prints to stdout the postcode count, the rows skipped and the lon/lat bounding box, never individual addresses.
- A header comment documents both sources: OpenAddresses PL CSV, or PRG GML converted with `ogr2ogr -f CSV out.csv in.gml -t_srs EPSG:4326 -lco GEOMETRY=AS_XY`.
- Raw inputs are gitignored and never committed.

#### 2. Generated migration

**File**: `supabase/migrations/20260927130000_seed_postcode_centroids.sql`

**Intent**: Load all of Poland's postcode centroids, about 22k rows (about 1–2 MB), as reference data. Use a fresh timestamp when it is generated, as long as it stays after the Phase 1 migrations.

**Contract**: The output of the script above; an idempotent upsert, so it can be re-run.

#### 3. Data attribution

**File**: `README.md`

**Intent**: Record the data source and licence (GUGiK PRG, open data) and how to regenerate the migration.

**Contract**: A new "Dane kodów pocztowych" subsection.

### Success Criteria:

#### Automated Verification:

- Migration applies: `npx supabase db reset`
- Row count is plausible: `select count(*) from postcodes` returns 20,000–25,000.
- pgTAP suite still passes: `npm run test:db`

#### Manual Verification:

- Spot-check three known postcodes (for example `00-950` Warszawa, `31-001` Kraków, and one rural code) against a map: each centroid lands in the right place.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Profile API and sign-in nudge

### Overview

Server side of the form: validation, the save and lookup endpoints, route protection, the sign-in redirect to `/profil` for incomplete profiles, and smoke coverage.

### Changes Required:

#### 1. Dependency

**File**: `package.json`

**Intent**: Make zod a direct dependency before using it, as CLAUDE.md requires.

**Contract**: `npm install zod`.

#### 2. Shared types

**File**: `src/types.ts` (new)

**Intent**: DTOs shared by the page, the API and the island.

**Contract**: `SkillCategoryDTO {slug, name}`, `SkillDTO {slug, categorySlug, name, hasLevel}`, `ProfileSkillDTO {slug, level: 1|2|3|null}`, `MyProfileDTO {postcode, locationSource: 'postcode'|'pin'|null, lat, lng, skills: ProfileSkillDTO[], matchable: boolean}`.

#### 3. Profile service

**File**: `src/lib/services/profile.ts` (new)

**Intent**: Keep Supabase calls and the mapping from DB errors to Polish messages out of the route handlers.

**Contract**:
- `getTaxonomy(supabase)`, `getMyProfile(supabase)`, `saveMyProfile(supabase, input)`, `isProfileMatchable(supabase)` and `lookupPostcode(supabase, code)`, each calling the Phase 1 RPC or table.
- Error mapping to Polish user messages:
  - `unknown_postcode` → "Nie znamy tego kodu pocztowego — zaznacz lokalizację na mapie."
  - `outside_poland` → "Lokalizacja musi być w Polsce."
  - `level_required` → "Wybierz poziom dla każdej zaznaczonej umiejętności."
  - FK violation (23503) → "Nieznana umiejętność."
  - Anything else → "Nie udało się zapisać profilu. Spróbuj ponownie."
- Never logs input values.

#### 4. Validation schema

**File**: `src/lib/validation/profile.ts` (new)

**Intent**: Parse the form POST into the RPC input.

**Contract**:
- Form fields: `location_source` (`postcode`|`pin`|empty), `postcode`, `lat`, `lng`, and repeated `skill` values shaped as `<slug>` (no-level skills) or `<slug>:<1|2|3>`.
- Rules:
  - Postcode `NNNNN` or `NN-NNN` is normalised to `NN-NNN`.
  - `lat`/`lng` are required and range-checked only when the source is `pin`.
  - Slugs are unique.
  - At most 40 skills.
- Level presence versus `has_level` is left to the DB trigger, which is the single source of truth.

#### 5. Save endpoint

**File**: `src/pages/api/profile.ts` (new)

**Intent**: Handle the profile form POST with the existing redirect pattern.

**Contract**:
- `POST` → 302 to `/profil?zapisano=1` on success, or to `/profil?error=<encoded Polish message>` on validation or DB failure.
- A request without a user goes to `/auth/signin`, and a `null` client goes to `/profil?error=`.

#### 6. Postcode lookup endpoint

**File**: `src/pages/api/kody-pocztowe/[kod].ts` (new)

**Intent**: Let the island move the pin when a postcode is typed.

**Contract**: `GET` returns 200 with `{lat, lng}` (the coarsened centroid), 404 with `{error}` for an unknown code, and 400 for a malformed one. It is public, because centroids are not personal data, and responds with `Cache-Control: public, max-age=86400`.

#### 7. Route protection and sign-in nudge

**Files**: `src/middleware.ts`, `src/pages/api/auth/signin.ts`

**Intent**: Gate `/profil`, and send residents with incomplete profiles to it after sign-in.

**Contract**:
- `PROTECTED_ROUTES` gains `"/profil"`.
- After a successful `signInWithPassword`, redirect to `/profil` if `isProfileMatchable` returns `false`, otherwise to `/`. On any RPC error, redirect to `/`.

#### 8. Minimal profile page

**File**: `src/pages/profil.astro` (new)

**Intent**: Give the sign-in redirect a real route so this phase's smoke step can assert 200. Phase 4 replaces the body.

**Contract**: A signed-in user gets 200 and the title "Mój profil". No skills form and no map in this phase.

#### 9. Smoke test

**File**: `scripts/smoke.mjs`

**Intent**: Cover the profile flow end to end over HTTP and keep the redirect contract honest.

**Contract**:
- Readonly steps gain `profil redirects anonymous user`: `/profil` → 302 `/auth/signin`.
- Write steps become:
  - signup
  - wrong password
  - `signin redirects new user to profil` → 302 `/profil`
  - `profil renders for signed-in user` → 200
  - `profile save rejects bad level` (`skill=elektryk:5`) → 302 `/profil?error=`
  - `profile save accepts pin and skill` (`location_source=pin`, `lat=52.2297`, `lng=21.0122`, `skill=elektryk:2`) → 302 `/profil?zapisano=1`
  - signout
  - `signin redirects complete user home` → 302 and the `Location` header equals `/`. `scripts/smoke.mjs` currently uses `startsWith`, and `"/profil".startsWith("/")` is true, so this step must compare equality or it also passes when every sign-in still lands on `/profil`.
  - dashboard renders
  - signout
  - dashboard redirects after signout

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Type check passes: `npx astro check`
- Build passes: `npm run build`
- Smoke passes against local dev with local Supabase: `npm run smoke`
- Readonly smoke passes: `SMOKE_READONLY=1 npm run smoke`

#### Manual Verification:

- `curl -i localhost:4321/api/kody-pocztowe/00-950` returns coarsened coordinates, `99-999` returns 404, and `abc` returns 400.
- `npx wrangler tail` or the dev console shows no postcode, coordinates or email during a save.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Polish profile UI

### Overview

The `/profil` page and its React island, plus the Polish shell.

### Changes Required:

#### 1. Map dependency

**File**: `package.json`

**Intent**: Add a map library for the pin, which S-11 will reuse.

**Contract**: `npm install leaflet react-leaflet` and `npm install -D @types/leaflet`.

#### 2. Profile page

**File**: `src/pages/profil.astro` (replaces the Phase 3 stub)

**Intent**: Server-render the profile using the taxonomy and the current profile, then hydrate the form.

**Contract**:
- Loads `getTaxonomy` and `getMyProfile`.
- Reads `?zapisano` and `?error` for the banners.
- Shows the status: "Profil kompletny" when matchable, otherwise "Profil niekompletny — dodaj lokalizację i co najmniej jedną umiejętność, aby koordynator mógł Cię znaleźć."
- Renders `<ProfileForm client:only="react" …props />`.
- Title "Mój profil".

#### 3. Profile form island

**Files**: `src/components/profile/ProfileForm.tsx`, `SkillsPicker.tsx`, `LocationPicker.tsx` (new)

**Intent**: One `<form method="POST" action="/api/profile">` that a phone user can complete.

**Contract**:
- **SkillsPicker**:
  - One `<fieldset>` per category.
  - A checkbox per skill.
  - When a `hasLevel` skill is checked, it shows a 3-option radio group ("Podstawowy kurs" / "Praktyk" / "Profesjonalista") with **no default**. The client blocks submit until every checked skill has a level.
  - Emits hidden `skill` inputs in the Phase 3 format.
- **LocationPicker**:
  - A postcode input. On a valid `NN-NNN`, it fetches `/api/kody-pocztowe/[kod]`, recentres the map to zoom 14, places the marker and sets `location_source=postcode`.
  - A Leaflet map with OSM tiles and attribution, centred on the saved point, or on Poland at zoom 6 if there is none. Clicking or dragging places a `CircleMarker`, sets `location_source=pin` and clears the postcode field (last edit wins).
  - Shows the coarsening hint.
  - Emits hidden `location_source`, `lat` and `lng`.
- Uses `cn()` for classes. Every label is in Polish, and every input has an associated `<label>`, to satisfy jsx-a11y.

#### 4. Polish shell

**Files**: `src/layouts/Layout.astro`, `src/components/Topbar.astro`, `src/pages/dashboard.astro`

**Intent**: Make everything around the profile journey Polish.

**Contract**:
- `Layout.astro`: `lang="pl"`, default title "SkillNet".
- `Topbar.astro`: "Mój profil" link to `/profil`, "Panel", "Wyloguj", "Nie zalogowano", "Zaloguj się", "Załóż konto".
- `dashboard.astro`: add a "Mój profil" link.
- The sign-in and sign-up forms stay English (S-05).

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Type check passes: `npx astro check`
- Build passes: `npm run build`
- Smoke still passes: `npm run smoke`

#### Manual Verification:

- At 375 px (browser pane mobile preset), a new resident can tick three skills, pick levels, type `00-950`, save, and see "Profil kompletny" with the pin on the coarsened point, with no horizontal scroll.
- Dragging the pin clears the postcode field. After saving, the pin sits on the coarsened point, not the drag point.
- Checking a level skill and submitting without a level is blocked, with a Polish message. Equipment shows no level control.
- An unknown postcode shows the Polish "Nie znamy tego kodu pocztowego…" message and the pin path still works.
- Reloading `/profil` shows the saved skills, levels and location.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Before merging the PR, run the deploy-ordering steps in Critical Implementation Details (link and `db push` to production).

---

## Testing Strategy

### Unit Tests:

- None added. No unit runner exists, and the risky logic lives in SQL, where pgTAP covers it.

### Integration Tests:

- pgTAP (`supabase/tests/resident_profile_test.sql`): RLS isolation, coarsening, postcode resolution and last-edit-wins, level rules, the matchability truth table, and RPC atomicity. It runs in the CI smoke job.
- HTTP smoke (`scripts/smoke.mjs`): anonymous gate, sign-in nudge, save success and failure, and the redirect home once the profile is complete.

### Manual Testing Steps:

1. Sign up a fresh user and sign in. You land on `/profil` with "Profil niekompletny".
2. Tick "Elektryk" and "Agregat prądotwórczy", and choose "Praktyk" for Elektryk. The generator has no level control.
3. Type `31-001`. The map jumps to Kraków. Save; you see "Zapisano" and "Profil kompletny".
4. Drag the pin a few streets away and save. Postcode is empty and the pin snaps to a nearby cell centre.
5. Sign out and sign in again. You land on `/`.
6. In Studio, as the owner, confirm that `profiles.location` is not the exact drag point.

## Performance Considerations

- The GIST index on `profiles.location` and the index on `profile_skills.skill_slug` exist now, so S-03's single-RPC ranking stays within ≤ 3 s without a schema change.
- The postcode lookup is a primary-key hit, and the endpoint sets a one-day cache header.
- The `/profil` SSR makes two Supabase round trips (taxonomy and `get_my_profile`) from the edge to Frankfurt, which is acceptable for a profile page.

## Migration Notes

- These are the first migrations in the repo, and all of them are additive, so a Worker rollback leaves them harmless.
- Production has never been linked. The human steps (`supabase login`, `link`, `db push --dry-run`, `db push`) must run before merge; see Critical Implementation Details.
- The postcode migration is 1–2 MB. `db push` handles this, but if the dashboard SQL editor is ever used instead, it will choke on a file this size.

## References

- Roadmap slice: `context/foundation/roadmap.md` → S-01
- PRD: `context/foundation/prd.md` → FR-002, FR-003, Guardrails
- Seed spec (crisis matrix, team templates): `docs/shape_not.md` §4
- Ranking constraint: `context/foundation/infrastructure.md:115,169`
- Pending Supabase link: `context/changes/deployment/deployment-plan.md:69,121,256`
- Redirect pattern: `src/pages/api/auth/signin.ts:13-20`
- Smoke contract: `scripts/smoke.mjs:40-62`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Profile schema and guarantees

#### Automated

- [x] 1.1 Migrations apply cleanly on a fresh local DB: `npx supabase db reset` — 740d731
- [x] 1.2 pgTAP suite passes: `npm run test:db` — 740d731
- [x] 1.3 Generated types compile: `npm run db:types && npx astro check` — 740d731
- [x] 1.4 Lint passes: `npm run lint` — 740d731

#### Manual

- [x] 1.5 Studio shows RLS enabled with separate per-operation policies on `profiles` and `profile_skills` — 740d731
- [x] 1.6 Seeded taxonomy reads correctly in Polish — 740d731

### Phase 2: Postcode centroid data

#### Automated

- [x] 2.1 Migration applies: `npx supabase db reset` — c6d6f5c
- [x] 2.2 `select count(*) from postcodes` returns 20,000–25,000 — c6d6f5c
- [x] 2.3 pgTAP suite still passes: `npm run test:db` — c6d6f5c

#### Manual

- [x] 2.4 Three spot-checked postcode centroids land in the right place — c6d6f5c

### Phase 3: Profile API and sign-in nudge

#### Automated

- [x] 3.1 Lint passes: `npm run lint`
- [x] 3.2 Type check passes: `npx astro check`
- [x] 3.3 Build passes: `npm run build`
- [x] 3.4 Smoke passes against local dev: `npm run smoke`
- [x] 3.5 Readonly smoke passes: `SMOKE_READONLY=1 npm run smoke`

#### Manual

- [x] 3.6 Postcode endpoint returns 200, 404 and 400 as specified
- [x] 3.7 No postcode, coordinates or email in logs during a save

### Phase 4: Polish profile UI

#### Automated

- [ ] 4.1 Lint passes: `npm run lint`
- [ ] 4.2 Type check passes: `npx astro check`
- [ ] 4.3 Build passes: `npm run build`
- [ ] 4.4 Smoke still passes: `npm run smoke`

#### Manual

- [ ] 4.5 New resident completes the profile at 375 px with no horizontal scroll
- [ ] 4.6 Dragging the pin clears the postcode, and the saved pin sits on the coarsened point
- [ ] 4.7 A missing level is blocked with a Polish message, and equipment has no level control
- [ ] 4.8 Unknown postcode shows the Polish message and the pin path still works
- [ ] 4.9 Reloading `/profil` shows the saved state
