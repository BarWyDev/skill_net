# Public Skills-Density Map — Plan Brief

> Full plan: `context/changes/public-skills-density-map/plan.md`

## What & Why

Roadmap S-11 (FR-008): anyone, anonymous or signed in, can open `/mapa` and see where skills are concentrated in their area, with no personal data. The map is the everyday reason to open SkillNet, and that use is what keeps the directory fresh before a crisis. In a sparse pilot area a careless cell reveals a household, so aggregation is the whole slice.

## Starting Point

Profiles store only a 500 m cell centre (EPSG:2180) and never the postcode. RLS is owner-only, and no anonymous read path over resident data exists. Leaflet is already used for the profile location picker. The landing page is still the starter's English hero.

## Desired End State

A public `/mapa` page shows 2 km squares in three shades (5–9, 10–24, 25+ people), for all skills or one of the 6 categories. A visitor jumps to an area by postcode; a signed-in resident starts at their own area. Areas with fewer than 5 people look exactly like empty ones. The landing page pitches SkillNet in Polish and links to the map.

## Key Decisions Made

| Decision        | Choice                                    | Why (1 sentence)                                                                                |
| --------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Grid            | Fixed 2 km EPSG:2180 squares              | Pure SQL like `coarsen_point`; each 500 m stored cell falls in exactly one 2 km cell.           |
| Threshold       | k = 5, a hidden cell looks the same as an empty one | No public gap map; small counts never leave the database.                             |
| Count unit      | Distinct residents                        | k-anonymity protects people, and one multi-skilled person can't push a cell past k.             |
| Display         | Bands, not exact counts                   | Blunts differencing across time and filters (7→8 after a neighbour signs up).                   |
| Filters         | "All" plus the 6 categories               | Categories clear k in a pilot; per-skill views would be mostly empty and add differencing pairs. |
| Area            | Poland view, postcode jump, own point as start | Works for anonymous visitors; the whole country is fetched per filter, so no viewport reaches the logs. |
| Inclusion       | `profile_is_matchable`                    | One eligibility rule shared with crisis matching; S-13 pause will flow through it.              |
| Placement       | New `/mapa`, landing hero links to it      | Shareable URL; the landing page stops advertising the starter.                                  |
| Freshness       | Live query, `Cache-Control: private, max-age=300` | No scheduler exists; the lesson in `lessons.md` forbids `public` behind the auth middleware. |

## Scope

**In scope:** the `get_skills_density` security-definer RPC with a pgTAP privacy suite; `GET /api/mapa`; the `/mapa` page with a Leaflet island; the Polish landing hero; the Topbar link; read-only smoke steps.

**Out of scope:** per-skill filters, exact counts or a "1–4" bucket, zoom-dependent or gmina grids, viewport queries, availability weighting, snapshots or cron, the coordinator live map (FR-013).

## Architecture / Approach

Every guarantee lives in one SQL function: it snaps matchable residents to 2 km cells, counts distinct people (filtered by category), drops cells under 5, and returns only `{cell GeoJSON polygon, band 1–3}`. It is granted to `anon`. The Worker validates `kategoria`, calls the RPC and passes the cells through. A React-Leaflet island fetches `/api/mapa?kategoria=…` when the filter changes and draws the cells by band.

## Phases at a Glance

| Phase                                 | What it delivers                                       | Key risk                                                 |
| ------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------- |
| 1. Aggregation RPC and privacy tests  | `get_skills_density` plus a pgTAP suite pinning k, bands, distinctness | A count or id leaking through a definer function that bypasses RLS |
| 2. Service and public API             | `GET /api/mapa`, DTOs, smoke steps                     | Caching headers drifting to `public`                     |
| 3. Map page and landing               | `/mapa` island, legend, postcode jump, Polish landing   | Leaflet SSR pitfalls (needs `client:only`)               |

**Prerequisites:** S-01 is done; a local Supabase with the Kraków seed for visual checks.
**Estimated effort:** about 1–2 sessions across 3 phases.

## Open Risks & Assumptions

- Differencing between "All" and a category, at band edges, can still hint at a few people; bands and k = 5 are judged sufficient for the pilot.
- An early pilot will show a mostly blank map until registrations clear k = 5 per cell; this is accepted as the price of not publishing a gap map.
- The whole-country fetch per filter assumes pilot scale (hundreds of cells); a national rollout needs a viewport-scoped variant.

## Success Criteria (Summary)

- An anonymous visitor sees banded skill density around a postcode and can switch categories, with no individual ever inferable from a cell.
- The pgTAP suite proves that a cell with 4 people is never returned and that counts are of distinct people.
- The landing page leads to the map, and the smoke tests confirm the endpoint never returns counts or ids.
