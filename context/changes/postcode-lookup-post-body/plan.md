# Postcode Lookup via POST Body Implementation Plan

## Overview

The profile island looks postcodes up with `GET /api/kody-pocztowe/<code>`, so every code a resident types appears in a request URL. Workers Logs (`observability.enabled: true`) keep that URL for the retention window. This change replaces the route with `POST /api/kody-pocztowe` and a JSON body `{ "postcode": "NN-NNN" }`, so a typed code never appears in a URL. That closes the last operator-visible copy left open by S-15 (impl-review F1 of `profile-postcode-minimisation`). The same change fixes the route's `Cache-Control: public`, which violates `lessons.md`.

## Current State Analysis

- `src/pages/api/kody-pocztowe/[kod].ts` exports `GET`. It normalises `context.params.kod` with `normalisePostcode` and returns:
  - 400 `{ error }` for a malformed code;
  - 503 when Supabase isn't configured;
  - 404 `{ error }` for an unknown code;
  - 200 `{ lat, lng }` for a known code.
  The 404 and 200 responses carry `Cache-Control: public, max-age=86400` (`[kod].ts:7`).
- `src/components/profile/LocationPicker.tsx:99` is the only caller: ``fetch(`/api/kody-pocztowe/${match[1]}-${match[2]}`)``. A 404 sets the status to `unknown`; any other non-2xx or network error sets it to `failed`; a 200 sets `found` and recentres the map.
- `lookupPostcode` (`src/lib/services/profile.ts:94`) calls `supabase.rpc("lookup_postcode", …)`, which supabase-js sends as a POST body, so the code doesn't reach Supabase's API URL logs. On an RPC error it throws `lookupPostcode: <error.code>`, which contains no postcode.
- `lookup_postcode` is granted to `anon` and `authenticated` (`20260927120000_resident_profile_schema.sql:330`), so the lookup works without signing in, and the middleware doesn't protect `/api/kody-pocztowe`.
- `scripts/smoke.mjs` has no lookup step. Its `request()` helper only sends form bodies, and the step matcher supports `status`, `location` and `bodyExcludes`.
- The local database has the full postcode seed (`20260927130000_seed_postcode_centroids.sql`, 20,561 rows): `31-001` is present and `00-000` is absent.

## Desired End State

- No request the app makes contains a typed postcode in its URL. The island's lookup is `POST /api/kody-pocztowe` with `Content-Type: application/json` and body `{ "postcode": "NN-NNN" }`.
- `GET /api/kody-pocztowe/<code>` no longer exists (the route file is deleted).
- Every response from the lookup route (200, 400, 404, 503) carries `Cache-Control: no-store`. No route under `src/pages/api/` sends `Cache-Control: public`.
- A body that is not valid JSON, has the wrong Content-Type, or lacks a string `postcode` gets the same 400 as a malformed code. No exception whose message could quote the request body escapes the route.
- The island behaves exactly as before: a known code recentres the map, an unknown code shows "Nie znamy tego kodu pocztowego — zaznacz lokalizację na mapie.", and a network or server error shows "Nie udało się sprawdzić kodu. Zaznacz lokalizację na mapie."
- `npm run smoke` proves the 200, 404 and malformed-body 400 responses, and those steps also run under `SMOKE_READONLY=1`.

### Key Discoveries:

- `[kod].ts:7`: `CACHE_HEADERS = { "Cache-Control": "public, max-age=86400" }`. The `lessons.md` rule "Public cache headers on routes that pass through the auth middleware" names this exact line.
- `LocationPicker.tsx:99-112`: the island's status handling keys on `response.status === 404` and `response.ok`. As long as the status codes stay the same, only the `fetch` call changes.
- `src/lib/validation/profile.ts:12`: `normalisePostcode` accepts `NNNNN` or `NN-NNN` and returns `NN-NNN` or null. Reuse it; don't add a second regex.
- `src/pages/api/profile.ts`: the pattern for a `POST` handler (a `createClient` null check, then parse, then call the service).
- Astro's `security.checkOrigin` only applies to form content types (`application/x-www-form-urlencoded`, `multipart/form-data`, `text/plain`), so it doesn't affect a JSON POST from the island.

## What We're NOT Doing

- No transition period for the old GET path: it is deleted outright. A tab opened before the deploy gets a 404 on its next lookup and shows the "unknown" message until it reloads. The page is server-rendered, so a reload fetches the new island.
- No client-side postcode matching and no change to the `lookup_postcode` RPC or the `postcodes` table.
- No rate limiting or abuse protection on the lookup (it serves public reference data).
- No 415 response or other separate status for Content-Type or JSON errors: they all get one generic 400.
- No smoke step that calls the deleted GET path (it would put a code in a URL on every run).
- No edits to `lessons.md`. It is append-only, and its `Context` line pointing at `[kod].ts:7` stays as history.
- No change to Workers Logs configuration (`observability` stays enabled).

## Implementation Approach

Swap the route and the only caller in one phase, so there's never a deployed state where the island calls a missing route. Then extend the smoke test in a second phase. The route contract stays 400/404/503/200 with the same Polish messages, so `LocationPicker` changes only its `fetch` call.

## Critical Implementation Details

- **Body parse errors can leak the postcode.** V8's `JSON.parse` `SyntaxError` message quotes the input (for example `Unexpected token … "31-00x" is not valid JSON`). If `request.json()` throws out of the handler, Workers Logs record that message, and the postcode ends up back in the logs. Wrap body reading and parsing in a `try` that returns the generic 400, and never rethrow, log or interpolate the caught error.
- **Deploy ordering:** this is code only (no migration), so one merge ships the route and the island together. Stale tabs are covered under "What We're NOT Doing".

## Phase 1: POST route and island switch

### Overview

Replace the GET route with a POST route at `/api/kody-pocztowe`, and point the island at it.

### Changes Required:

#### 1. Lookup route

**File**: `src/pages/api/kody-pocztowe/index.ts` (new); delete `src/pages/api/kody-pocztowe/[kod].ts`

**Intent**: Serve the lookup from a POST body, so the code never appears in the URL. Send `no-store` on every response to replace the `public` header that `lessons.md` forbids.

**Contract**: `export const POST: APIRoute`. Request: `Content-Type: application/json` (media type `application/json`, parameters such as `; charset=utf-8` allowed), body `{ "postcode": string }`. The postcode goes through `normalisePostcode`, and the body object may carry other keys, which are ignored. Responses, each with `Cache-Control: no-store`:
- **400** `{ "error": "Podaj kod pocztowy w formacie 00-000." }` for any of: a wrong Content-Type, an unreadable or invalid JSON body, a body that isn't an object, a missing or non-string `postcode`, or a code `normalisePostcode` rejects.
- **503** `{ "error": "Supabase nie jest skonfigurowany." }`.
- **404** `{ "error": "Nie znamy tego kodu pocztowego — zaznacz lokalizację na mapie." }`.
- **200** `{ lat, lng }`.

Validate the Content-Type and the body before creating the Supabase client, as `[kod].ts` does today. Keep the header in one constant, as today. The route must not use `console.*`.

#### 2. Island lookup call

**File**: `src/components/profile/LocationPicker.tsx`

**Intent**: Send the normalised code in a JSON POST body instead of the URL path.

**Contract**: The `fetch` at line 99 becomes `fetch("/api/kody-pocztowe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ postcode: \`${match[1]}-${match[2]}\` }) })`. The `request !== latestLookup.current` guard, the 404 → `unknown` mapping, the `!response.ok` → `failed` mapping and the 200 handling stay unchanged.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Type check passes: `npx astro check`
- Build succeeds: `npm run build`
- No request URL is built from a postcode: `grep -rn "kody-pocztowe/" src` returns nothing
- No public cache header remains: `grep -rn "public, max-age" src` returns nothing
- The existing smoke test passes against local Supabase: `npm run smoke` (with the dev server running and `.dev.vars` pointing at `npx supabase status -o env`)

#### Manual Verification:

- On `/profil`, typing `31-001` recentres the map on Kraków and places the pin. The browser pane's network log shows `POST /api/kody-pocztowe` with the code only in the request body.
- Typing `00-000` shows "Nie znamy tego kodu pocztowego — zaznacz lokalizację na mapie."
- Typing `31-00` (incomplete) sends no request and shows no error. Clearing the field still reverts to the stored location.
- The response headers show `Cache-Control: no-store` for both the 200 and the 404.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Smoke coverage

### Overview

Make the smoke test prove the new contract, including the malformed-body 400, in both CI and readonly production runs.

### Changes Required:

#### 1. Smoke helper and matcher

**File**: `scripts/smoke.mjs`

**Intent**: Let steps send a JSON (or raw) body and assert that the response contains a string. Existing form-based steps don't change.

**Contract**: `request(path, { method, form, json, rawBody, contentType })`:
- `json` → `Content-Type: application/json` and `JSON.stringify(json)`.
- `rawBody` → sent as is, with the given `contentType` (for the malformed-JSON step).
- `form` → unchanged.

Add a `bodyIncludes` expectation next to `bodyExcludes`, update the header comment to mention it, and print it on failure.

#### 2. Lookup steps

**File**: `scripts/smoke.mjs`

**Intent**: Cover every branch the island depends on, plus the no-leak 400 path. The steps create no accounts, so they go in `readonlySteps`.

**Contract**: Three steps appended to `readonlySteps`:
- `"postcode lookup finds known code"`: POST `{ postcode: "31-001" }` → `200`, `bodyIncludes: "\"lat\""`.
- `"postcode lookup rejects unknown code"`: POST `{ postcode: "00-000" }` → `404`.
- `"postcode lookup rejects malformed body"`: POST with `rawBody: "{\"postcode\":"` and `contentType: "application/json"` → `400`.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Full smoke passes against local Supabase: `npm run smoke` (the 3 new steps are included and all steps pass)
- Readonly smoke passes locally: `SMOKE_READONLY=1 npm run smoke` (6 steps)
- CI `ci` and `smoke` jobs are green on the PR

#### Manual Verification:

- After the merge deploys, `SMOKE_READONLY=1 BASE_URL=https://skillnet.barwy.workers.dev npm run smoke` passes.
- After the deploy, with `npx wrangler tail skillnet --format json` running, typing a postcode on production `/profil` produces a log entry whose request URL is `/api/kody-pocztowe` with no code in it.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- None: the repo has no unit runner. The route's branches are covered by smoke steps.

### Integration Tests:

- Smoke: known code → 200 with `lat`; unknown code → 404; malformed JSON → 400. These run in CI against local Supabase and in readonly production runs.

### Manual Testing Steps:

1. `/profil` → type `31-001` → the map recentres; the network log shows a POST with no code in the URL.
2. Type `00-000` → the "unknown" message appears.
3. Clear the field → the stored location comes back (regression check for S-15).
4. After the deploy, check `wrangler tail` while typing a code: the URL is `/api/kody-pocztowe` only.

## Performance Considerations

The 24h response cache is lost, but it never applied to a POST. Each lookup is one indexed RPC on `postcodes.postcode`, one per complete code typed. There's no measurable change.

## Migration Notes

Code only. There's no database migration and no secret change. Rolling back with `npx wrangler rollback` restores the GET route and the old island together.

## References

- Follow-up source: `context/archive/2026-09-27-profile-postcode-minimisation/follow-ups/review-fixes.md` (F1)
- Review finding: `context/archive/2026-09-27-profile-postcode-minimisation/reviews/impl-review.md` (F1)
- Lesson: `context/foundation/lessons.md` ("Public cache headers on routes that pass through the auth middleware")
- POST handler pattern: `src/pages/api/profile.ts:8`
- Current route: `src/pages/api/kody-pocztowe/[kod].ts`
- Caller: `src/components/profile/LocationPicker.tsx:99`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: POST route and island switch

#### Automated

- [x] 1.1 Lint passes: `npm run lint`
- [x] 1.2 Type check passes: `npx astro check`
- [x] 1.3 Build succeeds: `npm run build`
- [x] 1.4 No request URL is built from a postcode: `grep -rn "kody-pocztowe/" src` returns nothing
- [x] 1.5 No public cache header remains: `grep -rn "public, max-age" src` returns nothing
- [x] 1.6 The existing smoke test passes against local Supabase: `npm run smoke`

#### Manual

- [x] 1.7 Typing `31-001` recentres the map; the network log shows a POST with the code only in the body
- [x] 1.8 Typing `00-000` shows the "unknown" message
- [x] 1.9 An incomplete code sends no request; clearing the field reverts to the stored location
- [x] 1.10 `Cache-Control: no-store` on both the 200 and the 404

### Phase 2: Smoke coverage

#### Automated

- [ ] 2.1 Lint passes: `npm run lint`
- [ ] 2.2 Full smoke passes against local Supabase, including the 3 new steps: `npm run smoke`
- [ ] 2.3 Readonly smoke passes locally: `SMOKE_READONLY=1 npm run smoke`
- [ ] 2.4 CI `ci` and `smoke` jobs are green on the PR

#### Manual

- [ ] 2.5 Production readonly smoke passes after the deploy
- [ ] 2.6 `wrangler tail` shows `/api/kody-pocztowe` with no code in the URL
