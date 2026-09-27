# Postcode Lookup via POST Body — Plan Brief

> Full plan: `context/changes/postcode-lookup-post-body/plan.md`

## What & Why

The profile island looks postcodes up with `GET /api/kody-pocztowe/<code>`, so every code a resident types lands in Workers Logs as part of the request URL. S-15 already keeps the typed postcode out of the database, the RPCs and the page. This closes the last operator-visible copy (impl-review F1 of `profile-postcode-minimisation`) by moving the code into a POST JSON body.

## Starting Point

`src/pages/api/kody-pocztowe/[kod].ts` serves the lookup with the 400/404/503/200 contract and a `Cache-Control: public` header, which `lessons.md` forbids. `LocationPicker.tsx:99` is its only caller. The smoke test has no lookup step.

## Desired End State

The island sends `POST /api/kody-pocztowe` with `{ "postcode": "NN-NNN" }`. No request URL contains a typed code, and the GET route is gone. The island behaves the same for residents: a known code recentres the map, an unknown code shows the same message. Every lookup response is `no-store`. The smoke test proves the 200, 404 and malformed-body 400 paths, in CI and in readonly production runs.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Old GET route | Delete it outright | The island is the only caller; a stale tab shows "unknown" until it reloads, which is a seconds-long, harmless window. |
| Cache header | `Cache-Control: no-store` on every response | POST responses aren't cached anyway, and this removes the `public` value `lessons.md` forbids. |
| Bad body handling | One generic 400 (same message as a bad format) | Catching every parse failure keeps a JSON `SyntaxError`, which quotes the body, out of Workers Logs. |
| Smoke coverage | 200 + 404 + malformed 400, in `readonlySteps` | Covers every branch the island relies on and runs safely against production. |
| Unknown-code fixture | `00-000` | It isn't in the 20,561-row seed; `31-001` is. |

## Scope

**In scope:**
- A new POST route `src/pages/api/kody-pocztowe/index.ts`, and deleting `[kod].ts`
- The `LocationPicker` fetch call
- `scripts/smoke.mjs`: JSON/raw bodies, `bodyIncludes`, 3 lookup steps

**Out of scope:**
- A transition period for GET, or a 410
- Client-side matching
- RPC or schema changes
- Rate limiting
- 415 or other separate error codes
- Edits to `lessons.md`
- Workers Logs config

## Architecture / Approach

Island → `POST /api/kody-pocztowe` (JSON body) → the route checks the Content-Type, parses the body in a `try` and runs `normalisePostcode` → `lookupPostcode` RPC (already a POST body to Supabase) → `{ lat, lng }` or a 404. The status codes and Polish messages don't change, so the island's state machine is unchanged.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. POST route and island switch | The code leaves the URL; `no-store` headers; GET is removed | An uncaught body-parse error quoting the code in Workers Logs |
| 2. Smoke coverage | 3 readonly steps proving 200/404/400 | The production readonly smoke now makes an anonymous Supabase read |

**Prerequisites:** local Supabase (`npx supabase start`) and `.dev.vars` for the smoke test.
**Estimated effort:** ~1 short session, 2 small phases.

## Open Risks & Assumptions

- Assumes Workers Logs record request URLs and headers but not request bodies (the platform default; there's no `console.*` in the route).
- Tabs opened before the deploy see "Nie znamy tego kodu" on a lookup until they reload.

## Success Criteria (Summary)

- No request URL, and so no Workers Logs entry, ever contains a typed postcode (checked with `wrangler tail` after the deploy).
- Residents see no difference in the postcode field and map.
- The smoke test covers the lookup contract in CI and in production.
