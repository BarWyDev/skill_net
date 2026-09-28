# Coordinator Role Grant — Plan Brief

> Full plan: `context/changes/coordinator-role-grant/plan.md`
> Research: `context/changes/coordinator-role-grant/research.md`

## What & Why

Roadmap S-02, PRD FR-017: the operator can grant a registered user the coordinator role, and only coordinators can open a coordinator-only area. This role boundary gates the north star. S-03's ranked list holds personal data, and without a role there is nobody it can safely be shown to. The check must work inside Postgres, because S-03's security-definer RPC is the first consumer.

## Starting Point

There are no roles today. The middleware knows only signed-in vs anonymous users (`PROTECTED_ROUTES` redirects anonymous users to sign-in). The app holds only the publishable Supabase key, so no HTTP path can grant a role. The resident-profile migration and its pgTAP suite set the schema and test patterns to follow.

## Desired End State

The operator runs `grant_coordinator(email, note)` / `revoke_coordinator(email, note)` in the Supabase SQL editor, and every change lands in an append-only event log. A coordinator sees a "Koordynator" Topbar link and a "Panel koordynatora" placeholder at `/koordynator`. Residents get a 403 "Brak dostępu" page, and anonymous visitors are sent to sign-in. A revoke takes effect on the next request.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Role storage | `public.user_roles` table plus `is_coordinator()` (security invoker) | Immediate revoke, no 1 h JWT staleness, and one DB-side gate that S-03 can call | Research / Plan |
| Grant path | `grant_coordinator` / `revoke_coordinator`, not executable by `anon`/`authenticated` | Clear errors (`unknown_email`), a double grant is a no-op notice, and the grant path is under pgTAP | Plan |
| Audit | Append-only `coordinator_role_events`, no FK to `auth.users`, no email | A grant opens access to personal data, so revokes must leave a trace; the history survives account deletion | Plan |
| Non-coordinator at `/koordynator` | 403 "Brak dostępu", rendered in place | Honest and assertable in smoke; errors fail closed to the same 403 | Plan |
| Anonymous at a gated route (PRD OQ6) | Redirect to `/auth/signin` (recorded in the PRD) | Keeps the existing default | Research |
| Nav | Middleware looks up the role on every signed-in request → `locals.isCoordinator` → Topbar link | One source of truth for the gate and the link; one PK lookup per request | Plan |
| Gate location | Middleware on the `/koordynator` prefix, `Cache-Control: private, no-store` | S-03/S-04/S-09 sub-routes inherit the gate; follows the cache lesson | Plan |

## Scope

**In scope:** the migration (2 tables, 3 functions, RLS, privileges), a pgTAP suite, regenerated types, the role service, the middleware flag and gate, the `/koordynator` and `/brak-dostepu` pages, the Topbar link, smoke steps (with a cache-header assertion), a README operator runbook, the CLAUDE.md human-only note and the PRD OQ6 resolution.

**Out of scope:** operator UI or in-app operator role, JWT claims or an access-token hook, crisis features on the panel, coordinator vetting, logging of raw SQL edits that bypass the functions, event retention after erasure (S-14), and the English `/dashboard` starter page.

## Architecture / Approach

The request flow is: `getUser()`, then `is_coordinator()` RPC (signed-in users only; an error counts as `false`), then anonymous on a protected route → 302 sign-in, then signed-in non-coordinator on `/koordynator*` → `/brak-dostepu` rendered with 403, then `next()`, then `no-store` on the prefix. In the DB, `user_roles` holds current state and is readable only by its owner, with no client write privileges. `coordinator_role_events` holds history, invisible to clients and written only by the grant and revoke functions, which only `postgres`/`service_role` can call.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Role schema and guarantees | Migration, pgTAP suite, types; pushed to production before Phase 2 merges | Forgetting to revoke Supabase's default `execute` grants → self-promotion over PostgREST (covered by pgTAP) |
| 2. Coordinator area and gate | Middleware gate, pages, Topbar link, smoke, runbook | The denial rewrite re-runs the middleware or leaks a 302/200; the lookup error path fails open |

**Prerequisites:** local Supabase (Docker) for `db reset`/`test:db`; production DB push access for the operator before Phase 2 merges.
**Estimated effort:** ~1–2 sessions across 2 phases.

## Open Risks & Assumptions

- A raw `insert`/`delete` on `user_roles` in the SQL editor bypasses the event log. It's mitigated only by the runbook and the CLAUDE.md human-only rule.
- Deleting a user cascades the role away with no `revoke` event. The prior `grant` event remains, and S-14 decides how erasure treats the log.
- Every signed-in SSR request gains one subrequest. That's fine on Free (limit 50), but it's worth revisiting if latency matters.
- The positive coordinator path is verified only by pgTAP plus a manual check, since smoke has no service key.

## Success Criteria (Summary)

- An operator can grant and revoke a coordinator from the SQL editor, and every change is in the event log.
- A coordinator reaches `/koordynator` from the Topbar. A resident gets 403, an anonymous visitor gets sign-in, and a revoke is effective on the next request.
- `npm run test:db` proves no self-promotion and no client access to the grant functions or the log, and smoke asserts the anonymous and resident paths.
