# Coordinator Role Grant Implementation Plan

## Overview

Roadmap S-02 (PRD FR-017). The operator (the product owner, working in the Supabase SQL editor) can grant and revoke the coordinator role for a registered user. A coordinator sees a coordinator-only area at `/koordynator`. Anonymous visitors are sent to sign-in, and signed-in residents get a 403. The role check lives in Postgres (`is_coordinator()`), so S-03's security-definer ranking RPC can gate on it directly.

## Current State Analysis

- No roles exist: no column, table, claim or helper.
- `src/middleware.ts:4-21` resolves `Astro.locals.user` on every request and redirects anonymous users away from `PROTECTED_ROUTES = ["/dashboard", "/profil"]` (a `startsWith` prefix match). It only knows authenticated vs anonymous.
- The Supabase client (`src/lib/supabase.ts`) uses the publishable key only, and returns `null` when env is missing. There is no service-role key, and there must not be one, so no HTTP path can grant a role.
- The schema style is set by `supabase/migrations/20260927120000_resident_profile_schema.sql`: RLS on every table, one policy per operation and role, `set search_path = ''`, `security invoker` functions, explicit `revoke … from public, anon` / `grant … to authenticated`.
- DB tests are pgTAP in `supabase/tests/*.sql` (`npm run test:db`, run in CI after `supabase start`). They impersonate users with `set local role authenticated` plus `request.jwt.claims` (`supabase/tests/resident_profile_test.sql:1-40`).
- The smoke test (`scripts/smoke.mjs`) is HTTP-only. It can assert anonymous and resident behaviour, but it cannot prove the positive coordinator path.
- `jwt_expiry = 3600` (`supabase/config.toml`). A JWT-carried role would stay valid for up to an hour after a revoke, which is why the role lives in a table.

Full option analysis: `context/changes/coordinator-role-grant/research.md`.

## Desired End State

- `public.user_roles` holds the current coordinators, and `public.coordinator_role_events` holds an append-only history of every grant and revoke.
- The operator runs `select public.grant_coordinator('<email>', '<note>')` or `select public.revoke_coordinator('<email>', '<note>')` in the SQL editor. Nobody can call either function through PostgREST.
- `public.is_coordinator()` returns the caller's role status. It is the single gate that S-03 reuses.
- Every SSR request from a signed-in user carries `Astro.locals.isCoordinator`. It is `false` on any lookup error (fail closed).
- `GET /koordynator` behaves as follows:
  - anonymous → 302 to `/auth/signin`;
  - signed-in resident → 403 with a Polish "Brak dostępu" page;
  - coordinator → 200 with the "Panel koordynatora" placeholder;
  - every response under the prefix carries `Cache-Control: private, no-store`.
- The Topbar shows a "Koordynator" link only to coordinators.
- A revoke takes effect on the user's next request.

Verify with `npm run test:db` (the new suite), `npm run smoke` (the new steps), and a manual grant, visit, revoke and visit on local Supabase.

### Key Discoveries:

- Supabase's default privileges grant `execute` on new `public` functions to `anon` and `authenticated`. `grant_coordinator` / `revoke_coordinator` therefore need an explicit `revoke execute … from public, anon, authenticated`, or anyone signed in could promote themselves over `/rest/v1/rpc`.
- An RLS table with no insert, update or delete policy already blocks writes from `authenticated`. Also revoking the table privileges is a second layer, and it makes the pgTAP failures a deterministic `42501`.
- `profile_is_matchable` (the resident schema migration, "Functions") is `security invoker` and is documented as the rule S-03 reuses. `is_coordinator()` follows the same shape.
- Lesson (`context/foundation/lessons.md`): never send `Cache-Control: public` from a route that runs the auth middleware. The kody-pocztowe route's `NO_STORE` constant (`src/pages/api/kody-pocztowe/index.ts:7`) is the existing precedent.
- `Topbar.astro` is used by `src/pages/profil.astro` and `src/components/Welcome.astro`. `/dashboard` doesn't use it.

## What We're NOT Doing

- No operator UI or operator role in the app. The operator uses the SQL editor (FR-018 is parked).
- No JWT claim or custom access token hook (research options B and C).
- No crisis functionality on `/koordynator`. It's a placeholder, and S-03 fills it.
- No institutional vetting of coordinators (PRD: out of scope for the MVP).
- No logging of raw `insert` / `delete` statements on `user_roles` that bypass the functions. The runbook requires the functions, and that gap is recorded as a risk.
- No positive-path smoke step. Smoke has no service key, so pgTAP plus a manual check cover "a coordinator sees the panel".
- No tightening of the `startsWith` prefix match. Over-matching `/koordynator*` denies more, not less, so it fails safe.
- No retention policy for `coordinator_role_events` after account erasure. S-14 decides.
- No translation or cleanup of the English `/dashboard` starter page.

## Implementation Approach

The work splits into two phases along the deploy boundary. Phase 1 is a purely additive migration with its own pgTAP suite. It is pushed to production (`npx supabase db push`) before the Phase 2 code merges, so the gate never ships ahead of the function it calls. Phase 2 adds one RPC call to the middleware for signed-in users. The resulting boolean drives both the route gate and the Topbar link, so there is one source of truth. The gate sits in the middleware rather than in the page, so every future `/koordynator/*` route (S-03, S-04, S-09) inherits it without extra code.

## Critical Implementation Details

**Fail closed, in two places.** The service may throw, but the middleware must catch the error and set `isCoordinator = false`. It may log only the error code. Neither an error nor a `null` client (missing env) may ever become `true`. Until the Phase 1 migration is on production, the RPC fails and every coordinator is denied. That's safe, but it's the reason the migration must be pushed first.

**The denial rewrite must not re-run the middleware.** Serve the 403 by rendering `/brak-dostepu` in place: `next("/brak-dostepu")`, with the page setting `Astro.response.status = 403`. Don't use `context.redirect`: the URL must stay `/koordynator` and the status must be 403, not 302. Prefer `next(path)` over `context.rewrite(path)`, which re-runs the whole middleware chain and so doubles the `getUser()` and `is_coordinator()` round trips. Check in the smoke output that the rewritten response really carries 403 and the `no-store` header.

**The ordering inside the middleware matters.** The sequence is: resolve the user, then look up the role (signed-in users only), then redirect anonymous users on `PROTECTED_ROUTES` (which now includes `/koordynator`), then deny non-coordinators on the coordinator prefix, then call `next()`, then set `Cache-Control` on the prefix's response. Anonymous visitors must get the 302, not the 403.

## Phase 1: Role schema and guarantees

### Overview

One migration adds the role table, the event log, the role check and the operator-only grant and revoke functions, with RLS and privileges. A pgTAP suite proves there is no self-promotion, that revoke is immediate, and that the event trail is complete. The generated types are refreshed.

### Changes Required:

#### 1. Coordinator role migration

**File**: `supabase/migrations/20260928120000_coordinator_role.sql`

**Intent**: Store the coordinator role in Postgres with an append-only history, and expose one check (`is_coordinator()`) plus two operator-only mutators. The header comment states the guarantees, as the resident schema migration does: no self-promotion, immediate revoke, grants and revokes go through the functions.

**Contract**:

- `public.user_roles`:
  - columns: `user_id uuid not null references auth.users (id) on delete cascade`, `role text not null check (role in ('coordinator'))`, `granted_at timestamptz not null default now()`, `granted_by text not null` (the operator's note);
  - primary key: `(user_id, role)`.
- `public.coordinator_role_events`:
  - columns: `id bigint generated always as identity primary key`, `user_id uuid not null` (**no FK**, so the history survives account deletion and doesn't block S-14 erasure), `action text not null check (action in ('grant', 'revoke'))`, `note text not null`, `occurred_at timestamptz not null default now()`;
  - index on `user_id`;
  - it never stores an email.
- `public.is_coordinator() returns boolean`: `language sql stable security invoker set search_path = ''`. Returns `exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'coordinator')`. RLS already lets owners read their own row. Inside S-03's security-definer RPC, the owner bypasses RLS and `auth.uid()` still reads the caller's JWT, so the check is correct in both contexts.
- `public.grant_coordinator(p_email text, p_note text) returns void`: `plpgsql`, `security invoker`, `set search_path = ''`.
  - It finds the user in `auth.users` with `lower(email) = lower(trim(p_email))`.
  - It raises `unknown_email` if there's no match, and `note_required` if `p_note` is null or blank.
  - If the user already holds the role, it raises a `notice` of `already_coordinator` and returns, writing **no** event.
  - Otherwise it inserts the `user_roles` row (`granted_by = p_note`) and a `grant` event in the same transaction.
- `public.revoke_coordinator(p_email text, p_note text) returns void`: the same lookup and the same `unknown_email` / `note_required` errors.
  - If the user doesn't hold the role, it raises a `notice` of `not_coordinator` and returns with no event.
  - Otherwise it deletes the row and inserts a `revoke` event.
- RLS enabled on both tables:
  - `user_roles` has exactly one policy, `"user_roles: owner can read"`: `for select to authenticated using (user_id = (select auth.uid()))`;
  - `coordinator_role_events` has **no** policies.
- Privileges:
  - `revoke insert, update, delete, truncate on public.user_roles from anon, authenticated`;
  - `revoke all on public.coordinator_role_events from anon, authenticated`;
  - `revoke execute on function public.is_coordinator() from public, anon`, then `grant execute … to authenticated`;
  - `revoke execute on function public.grant_coordinator(text, text), public.revoke_coordinator(text, text) from public, anon, authenticated`. No grant: only `postgres` and `service_role` keep access.

#### 2. pgTAP suite

**File**: `supabase/tests/coordinator_role_test.sql`

**Intent**: Prove each guarantee of the migration against a real Postgres, in one transaction that rolls back. Follow the fixture and impersonation style of `resident_profile_test.sql`.

**Contract**: The test names below are the checklist. Pick the `plan(n)` count to match.

- `is_coordinator_false_for_resident`: a fixture user impersonated as `authenticated` gets `false`.
- `grant_makes_coordinator`: `grant_coordinator` (run as postgres) followed by impersonation gives `true`. There is one `user_roles` row, with `granted_by` set to the note.
- `grant_matches_email_case_insensitively`: a mixed-case, space-padded email finds the user.
- `grant_unknown_email_raises`: `throws_ok … 'unknown_email'`.
- `grant_requires_note`: a null note and a blank note both raise `note_required`.
- `double_grant_is_noop`: a second grant lives OK and leaves exactly one row and one `grant` event.
- `revoke_is_immediate`: after `revoke_coordinator`, the same impersonated session gets `false`. There is a `revoke` event, so the user has two events in order (`grant`, `revoke`).
- `revoke_non_coordinator_is_noop`: no error and no event.
- `no_self_promotion`: as `authenticated`, `insert`, `update` and `delete` on `user_roles` (including the caller's own id) all throw `42501`.
- `owner_reads_only_own_role`: the coordinator sees their own row. Another authenticated user sees 0 rows.
- `anon_cannot_check_or_read`: as `anon`, `is_coordinator()` throws `42501`, and `user_roles` returns 0 rows or throws.
- `grant_functions_not_executable_by_clients`: as `authenticated` and as `anon`, calling `grant_coordinator` and `revoke_coordinator` throws `42501`.
- `events_hidden_from_clients`: as `authenticated`, selecting from and inserting into `coordinator_role_events` both throw `42501`.
- `user_delete_cascades_role`: deleting the fixture user from `auth.users` removes their `user_roles` row, and their events remain.

#### 3. Generated types

**File**: `src/db/database.types.ts`

**Intent**: Pick up the new tables and functions so `supabase.rpc("is_coordinator")` is typed.

**Contract**: Regenerated with `npm run db:types` against local Supabase after `npx supabase db reset`. Don't edit it by hand.

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly on a fresh local DB: `npx supabase db reset`
- DB tests pass, both suites: `npm run test:db`
- Types regenerate with no diff beyond the new objects: `npm run db:types && git diff --stat src/db/database.types.ts`
- Type check passes: `npx astro check`
- Lint passes: `npm run lint`

#### Manual Verification:

- In local Studio's SQL editor, running `select public.grant_coordinator('<fixture email>', 'test')` twice shows the `already_coordinator` notice the second time
- Before merging Phase 2: the migration is pushed to production with `npx supabase db push`, and `select public.is_coordinator()` exists in the hosted SQL editor (human step, production schema change)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Coordinator area and gate

### Overview

Compute the role flag once per signed-in request, gate the `/koordynator` prefix with it, add the placeholder and denial pages and the coordinator-only Topbar link, and cover the anonymous and resident paths in smoke. Also document the operator runbook and record the PRD Open Question 6 resolution.

### Changes Required:

#### 1. Role service

**File**: `src/lib/services/roles.ts`

**Intent**: Wrap the RPC the way `getMyProfile` wraps `get_my_profile` (`src/lib/services/profile.ts`), so the middleware doesn't talk to PostgREST directly.

**Contract**: `isCoordinator(supabase: SupabaseClient): Promise<boolean>`. It calls `supabase.rpc("is_coordinator")` and returns `data === true`. It throws `new Error(\`isCoordinator: ${error.code}\`)` on error. It logs nothing.

#### 2. Locals type

**File**: `src/env.d.ts`

**Intent**: Make the role flag available to every page and component.

**Contract**: `App.Locals` gains `isCoordinator: boolean`.

#### 3. Middleware gate

**File**: `src/middleware.ts`

**Intent**: Look up the role for signed-in users, fail closed, keep anonymous users on the existing sign-in redirect, deny signed-in non-coordinators on the coordinator prefix with a 403, and mark every coordinator-prefix response as uncacheable. See **Critical Implementation Details** for the ordering and the rewrite mechanism.

**Contract**:

- `PROTECTED_ROUTES` gains `"/koordynator"`.
- A new `COORDINATOR_ROUTES = ["/koordynator"]`, matched with the same `startsWith` rule.
- `context.locals.isCoordinator`:
  - `false` when there is no client or no user, or when `isCoordinator()` throws (the catch may `console.error` the error message, which holds only the code);
  - otherwise the service result.
- Signed-in user on a coordinator route without the role → the `/brak-dostepu` page is rendered in place with status 403.
- On a coordinator route, the final response gets `Cache-Control: private, no-store`, whether it's the 200 or the 403.

#### 4. Coordinator placeholder page

**File**: `src/pages/koordynator/index.astro`

**Intent**: The coordinator-only area. For now it's a Polish placeholder that S-03 replaces with crisis activation. It follows the layout of `profil.astro` (Layout, Topbar, glass `main` card).

**Contract**: `<Layout title="Panel koordynatora">`, an `h1` reading "Panel koordynatora", and one paragraph saying crisis activation arrives in the next version. The page does no role logic of its own: the middleware owns the gate.

#### 5. Denial page

**File**: `src/pages/brak-dostepu.astro`

**Intent**: A Polish 403 page for signed-in users without the role.

**Contract**:

- It sets `Astro.response.status = 403` and uses `<Layout title="Brak dostępu">` with Topbar.
- Its body contains the exact string "Brak dostępu" (the smoke test asserts it) and a short explanation that the area is for coordinators appointed by the operator.
- It links back to `/profil`.
- Visiting it directly also returns 403. That's harmless.

#### 6. Topbar link

**File**: `src/components/Topbar.astro`

**Intent**: Coordinators can find their area. Residents never see the link.

**Contract**: When `Astro.locals.isCoordinator` is true, a "Koordynator" link to `/koordynator` appears before "Mój profil", using the same classes as the existing links.

#### 7. Smoke steps

**File**: `scripts/smoke.mjs`

**Intent**: Assert the gate over HTTP, including the lesson's cache rule, in both readonly and write modes.

**Contract**:

- `request()` also returns `cacheControl: response.headers.get("cache-control") ?? ""`.
- A new optional `cacheControlIncludes` expectation is checked the same way as `bodyIncludes` and printed on failure. The header comment documents it.
- Readonly step: `"koordynator redirects anonymous user"` expects GET `/koordynator` → `{ status: 302, location: "/auth/signin" }`.
- Write steps, after `"profil renders for signed-in user"`:
  - `"koordynator denies resident"` expects GET `/koordynator` → `{ status: 403, bodyIncludes: "Brak dostępu", cacheControlIncludes: "no-store" }`;
  - `"profil hides koordynator link from resident"` expects GET `/profil` → `{ status: 200, bodyExcludes: 'href="/koordynator"' }`.

#### 8. Operator runbook

**File**: `README.md`

**Intent**: Explain how the operator grants and revokes the role, locally and on production. Every change must go through the functions, so the event log stays complete.

**Contract**: A new `### Rola koordynatora` subsection under `## Supabase Configuration`, after `### Dane kodów pocztowych`. It covers:

- the two `select public.…_coordinator('<email>', '<note>')` calls;
- what the `unknown_email` error and the `already_coordinator` / `not_coordinator` notices mean;
- that raw `insert` / `delete` on `user_roles` is forbidden because it bypasses the log;
- a query that reads the history from `coordinator_role_events`;
- that running it on production is a production data change.

**File**: `CLAUDE.md`

**Intent**: Keep agents from granting roles on production.

**Contract**: The **Human-only** bullet in `## Deploy` also lists "granting or revoking the coordinator role on production".

#### 9. PRD Open Question 6

**File**: `context/foundation/prd.md`

**Intent**: Record the answer this slice settles.

**Contract**: Append to Open Question 6: "Resolved in S-02 (coordinator-role-grant): anonymous visitor → redirect to sign-in; signed-in user without the role → 403 "Brak dostępu"." Leave the question text itself unchanged.

### Success Criteria:

#### Automated Verification:

- Type check passes: `npx astro check`
- Lint passes: `npm run lint`
- Build passes: `npm run build`
- DB tests still pass: `npm run test:db`
- Full smoke passes against local dev with local Supabase: `npm run smoke`
- Readonly smoke passes against the local preview build: `npm run build && npm run preview`, then `SMOKE_READONLY=1 npm run smoke`

#### Manual Verification:

- Local: sign up, save a profile, visit `/koordynator` → the "Brak dostępu" page and no Topbar link
- Local: `grant_coordinator` for that email in Studio → reload → the "Koordynator" link appears and `/koordynator` shows "Panel koordynatora" (the positive path smoke can't cover)
- Local: `revoke_coordinator` → the next reload gives 403 again and the link is gone (revoke is immediate)
- Local: stop Supabase (`npx supabase stop`) while signed in, then load `/koordynator` → it is denied or redirected, never the panel (fail closed)
- After merge: `SMOKE_READONLY=1 BASE_URL=https://skillnet.barwy.workers.dev npm run smoke` passes. The operator grants the first real coordinator on production (a human step).

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- None. There is no unit runner yet. The DB guarantees are covered by pgTAP (Phase 1 §2), which is where the logic lives.

### Integration Tests:

- pgTAP `coordinator_role_test.sql`: self-promotion blocked, grant and revoke semantics including the no-op cases, immediate revoke, privilege boundaries for `anon` and `authenticated`, event completeness, cascade on user delete.
- Smoke: anonymous → 302, resident → 403 with `no-store` and the Polish body, resident Topbar with no coordinator link.

### Manual Testing Steps:

1. Resident path on local: 403 page, no link.
2. Grant in Studio → link and panel appear on reload.
3. Revoke in Studio → 403 on the very next request.
4. Supabase down → never the panel.
5. Production readonly smoke after merge, then the first real grant.

## Performance Considerations

There is one extra PostgREST round trip (`is_coordinator`, a primary-key lookup) on every SSR request from a signed-in user, running after `getUser()`. That is 2 subrequests per request, well within the Workers Free limit of 50, and the CPU cost is negligible. Anonymous requests pay nothing. If latency ever matters, the lookup can be limited to page routes, since API routes don't render the Topbar.

## Migration Notes

- Purely additive: two new tables, three functions, no changes to existing objects. It's safe to push ahead of the code.
- Order: push the Phase 1 migration with `npx supabase db push` → merge Phase 2 → Workers Builds deploys → readonly smoke on production → the operator grants the first coordinator in the hosted SQL editor.
- Rollback: `npx wrangler rollback` restores the old code, and the leftover tables are inert. Dropping them needs a new down migration, and there is no reason to.

## References

- Research: `context/changes/coordinator-role-grant/research.md`
- Roadmap: `context/foundation/roadmap.md` (S-02, and S-03 as the first consumer)
- PRD: FR-017, role matrix, Open Question 6 (`context/foundation/prd.md`)
- Schema pattern: `supabase/migrations/20260927120000_resident_profile_schema.sql`
- pgTAP pattern: `supabase/tests/resident_profile_test.sql`
- Service pattern: `src/lib/services/profile.ts` (`getMyProfile`)
- Cache lesson: `context/foundation/lessons.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Role schema and guarantees

#### Automated

- [x] 1.1 Migration applies cleanly on a fresh local DB: `npx supabase db reset`
- [x] 1.2 DB tests pass, both suites: `npm run test:db`
- [x] 1.3 Types regenerate with no diff beyond the new objects: `npm run db:types && git diff --stat src/db/database.types.ts`
- [x] 1.4 Type check passes: `npx astro check`
- [x] 1.5 Lint passes: `npm run lint`

#### Manual

- [x] 1.6 In local Studio, a second `grant_coordinator` for the same email shows the `already_coordinator` notice
- [ ] 1.7 Before merging Phase 2: migration pushed to production with `npx supabase db push`, and `is_coordinator()` present in the hosted SQL editor

### Phase 2: Coordinator area and gate

#### Automated

- [ ] 2.1 Type check passes: `npx astro check`
- [ ] 2.2 Lint passes: `npm run lint`
- [ ] 2.3 Build passes: `npm run build`
- [ ] 2.4 DB tests still pass: `npm run test:db`
- [ ] 2.5 Full smoke passes against local dev with local Supabase: `npm run smoke`
- [ ] 2.6 Readonly smoke passes against the local preview build: `SMOKE_READONLY=1 npm run smoke`

#### Manual

- [ ] 2.7 Local resident: `/koordynator` shows "Brak dostępu" and there is no Topbar link
- [ ] 2.8 Local grant in Studio: link appears and `/koordynator` shows "Panel koordynatora"
- [ ] 2.9 Local revoke: next reload gives 403 and the link is gone
- [ ] 2.10 Supabase stopped: `/koordynator` never shows the panel
- [ ] 2.11 After merge: production readonly smoke passes, and the first real coordinator is granted by the operator
