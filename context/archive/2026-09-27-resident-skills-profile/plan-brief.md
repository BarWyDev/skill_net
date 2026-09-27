# Resident Skills Profile — Plan Brief

> Full plan: `context/changes/resident-skills-profile/plan.md`

## What & Why

Roadmap S-01 (FR-002, FR-003): a signed-in resident records their skills from a fixed taxonomy, with a level of 1–3, and an approximate location set by postcode or map pin, in a Polish interface that works on a phone. Every later slice reads this data. S-03 ranks residents with a single PostGIS query, so the data model has to support a radius search and keep the "no exact location" privacy promise from the first migration.

## Starting Point

The code is still the auth-only starter scaffold: no migrations, no PostGIS, no domain tables, English UI, and one HTTP smoke test. The production Supabase project exists but has never been linked or migrated.

## Desired End State

After signing in, a resident with an incomplete profile lands on `/profil`. They tick skills grouped under six Polish categories and pick a level where it makes sense. They type a postcode or drop a pin, save, and see "Profil kompletny". The database never holds a location more precise than a 500 m cell centre, a resident can only see their own rows, and postcodes resolve from a local table covering all of Poland with no external service.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Postcode → point | Offline centroid table built from GUGiK PRG | No runtime dependency, which honours "works when external services fail". |
| Coverage | All of Poland (~22k postcodes) | The pilot area isn't chosen yet, and the same data serves S-11. |
| Precision | Coarsen on save to a 500 m grid cell centre | "Approximate" becomes a hard guarantee that no read path or bug can undo. |
| Postcode vs pin | One location, last edit wins | The resident always sees the exact point they'll be matched on. |
| Equipment levels | No level (`has_level = false`) | "Basic course / professional" means nothing for a chainsaw, and a forced default would bias the ranking. |
| Taxonomy | ~30 items derived from the seed crisis matrix, seeded by migration | S-03 can match every crisis type without a taxonomy change. |
| Required fields | Partial save allowed; `profile_is_matchable()` = location + ≥1 skill | No lost work on a phone, and one eligibility rule for S-03. |
| Entry point | `/profil`, plus a redirect there after sign-in when incomplete | New residents land in the form, which attacks cold start. |
| Polish scope | Profile screens + shell (`lang="pl"`, Topbar, title) | Auth copy stays English until S-05 rewrites sign-up. |
| Testing | pgTAP for DB guarantees + extended HTTP smoke | The privacy rules live in Postgres, so that's where they're proven. |
| Where invariants live | Postgres triggers + an atomic `save_my_profile` RPC | Every write path, including a direct PostgREST call, gets the same guarantees. |
| Map | Leaflet + react-leaflet v5, OSM tiles, `client:only` | React 19 compatible, and S-11 can reuse it. |

## Scope

**In scope:** PostGIS; taxonomy, postcode, profile and profile-skill tables with per-operation RLS; coarsening, postcode, level and matchability logic in SQL; the postcode centroid build script and migration; `POST /api/profile` and `GET /api/kody-pocztowe/[kod]`; the sign-in nudge; the Polish `/profil` page with a skills picker and map; a Polish shell; pgTAP and smoke tests.

**Out of scope:** phone and availability (S-06), visibility controls (S-12), pause (S-13), erasure beyond the FK cascade (S-14), display name, free-text "other" skill, geolocation button, translating the auth forms, and any read of other people's profiles.

## Architecture / Approach

Postgres owns the rules. Triggers on `profiles` resolve a postcode to its centroid, null the postcode when a pin is used, reject points outside Poland, and snap every point to a 500 m cell centre in EPSG:2180. A trigger on `profile_skills` enforces level versus `has_level`. `save_my_profile(jsonb)` writes the location and the skill set in one transaction. The Astro API route validates with zod, calls the RPC, and answers with redirects (the existing auth pattern). `/profil` server-renders the taxonomy and current profile into one React island that submits a normal HTML form.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Profile schema and guarantees | PostGIS, 5 tables, RLS, triggers, RPCs, pgTAP in CI | Coarsening maths or the RLS setup in pgTAP identity switching |
| 2. Postcode centroid data | Build script + ~22k-row migration for all of Poland | Multi-GB source download; availability of the OpenAddresses CSV (falls back to converting PRG GML with ogr2ogr) |
| 3. Profile API and sign-in nudge | zod, service, save and lookup endpoints, `/profil` gate, a stub page so smoke can assert 200, smoke steps | The sign-in redirect change must not break sign-in if the RPC fails |
| 4. Polish profile UI | `/profil` page, skills and location island, Polish shell | Leaflet under Vite/SSR (`client:only`, marker icons), phone ergonomics |

**Prerequisites:** Docker for local Supabase. Before merge, a human links production Supabase and runs `db push`, which is the first-ever migration.
**Estimated effort:** ~3–4 sessions across 4 phases.

## Open Risks & Assumptions

- **Deploy ordering:** Workers Builds deploys on merge, but nobody applies migrations. `supabase db push` to production must happen before the merge.
- Rural postcodes cover several villages, so their centroid can sit between them. This is acceptable for a 2–5 km radius, and a resident can switch to the pin.
- The taxonomy list is a draft derived from the seed spec. Adjust it during Phase 1 review, because later changes need a new migration.
- S-03 must decide how a null level (equipment) scores. The data contract is fixed here, the scoring is not.

## Success Criteria (Summary)

- A new resident completes a profile on a phone in Polish and sees "Profil kompletny".
- No stored location is more precise than a 500 m cell centre, and no resident can read another's profile, as proven by pgTAP in CI.
- S-03 can rank on `profiles.location` and `profile_skills` with `profile_is_matchable()` and no schema change. The function is `security invoker`; S-03's ranking RPC must be `security definer`, owned by the table owner, when it evaluates other residents.
