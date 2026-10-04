# Unregister and Erase — Plan Brief

> Full plan: `context/changes/unregister-and-erase/plan.md`

## What & Why

A resident can unregister at any time and disappear from searches immediately, with their personal data fully removed (PRD FR-007, roadmap S-14). It is a hard guardrail for any pilot with real people.

## Starting Point

All personal data already cascades from `auth.users` (profile, skills, phone, availability, roles, crisis matches). Four audit records keep a bare user id with no FK, waiting for this slice to decide their retention. There is no way for a resident to delete anything today.

## Desired End State

`/profil` has a "Usuń konto" section. After re-entering their password, the resident's account and all profile data are hard-deleted in one transaction, they are signed out and see "Twoje konto i dane zostały usunięte." on the home page. They vanish from any active crisis list, and their old credentials stop working.

## Key Decisions Made

| Decision            | Choice                                          | Why (1 sentence)                                                                        |
| ------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------- |
| Deletion model      | Hard delete now, no cron                        | Meets "≤ 30 days" on day 0 with no half-deleted state for every reader to filter.       |
| Audit rows          | Keep bare id                                    | Preserves "who saw whose number" accountability; the id resolves to no one afterwards.  |
| Active crisis       | Resident vanishes (existing cascade)            | Honours "disappears immediately"; a numbering gap is accepted.                          |
| Coordinators        | May unregister; role goes with the account      | "At any time" applies to everyone; role history stays in `coordinator_role_events`.     |
| Confirmation        | Re-enter password                               | A left-open or stolen session cannot wipe the account.                                  |
| Re-auth enforcement | In SQL via JWT `amr` password ≤ 5 min           | An endpoint-only check is bypassable by calling the RPC directly through PostgREST.     |
| Placement           | Danger section on `/profil`, plain form POST    | Where residents manage their data; no new protected route.                              |
| After erasure       | Local sign-out, `/?konto-usuniete=1` notice     | Explicit proof it happened; matches the redirect + query-param pattern.                 |
| Testing             | pgTAP suite + smoke steps                       | Proves the guarantee in the DB and the HTTP flow; smoke stops leaving test accounts.    |

## Scope

**In scope:** `unregister_me()` security-definer function with re-auth guard; audit-column comments; pgTAP suite; account service + `/api/auth/unregister`; "Usuń konto" UI; home notice; smoke steps.

**Out of scope:** soft delete / grace period / `pg_cron`; tombstoning or deleting audit rows; a "N osób wyrejestrowało się" note in the crisis view; blocking coordinators or active-crisis members; passwordless accounts; pause (S-13); consent records (S-05).

## Architecture / Approach

Form POST → `api/auth/unregister.ts` → `signInWithPassword(email, password)` (fresh `amr`) → `rpc('unregister_me')` (security definer, owned by `postgres`, checks `auth.uid()` and the `amr` window, deletes the `auth.users` row so the cascades remove everything) → `signOut({ scope: "local" })` → redirect home.

## Phases at a Glance

| Phase                                | What it delivers                                         | Key risk                                                       |
| ------------------------------------ | -------------------------------------------------------- | -------------------------------------------------------------- |
| 1. Erasure function and DB tests     | `unregister_me()`, retention comments, pgTAP proof       | Hosted Supabase denying `postgres` delete on `auth.users` (verified only locally) |
| 2. Endpoint, UI and smoke coverage   | Working "Usuń konto" flow, home notice, smoke cleanup    | Session handling after the user row is gone                    |

**Prerequisites:** local Supabase running; S-01 schema (done).
**Estimated effort:** ~1–2 sessions across 2 phases.

## Open Risks & Assumptions

- `postgres` delete privilege on `auth.users` was verified locally; confirm on the hosted project when the migration is pushed.
- The re-auth guard assumes password sign-in; S-05 must revisit it if it adds OTP or magic-link sign-in.
- Supabase backups keep erased data for the platform's retention window; this is outside app control.
- Audit rows keep a uuid that could, in principle, be joined against an old backup — pseudonymised, not strictly anonymised. Accepted.

## Success Criteria (Summary)

- A resident erases their account from `/profil` with their password and can no longer sign in; no profile, skills, phone or match row remains.
- Coordinators' active crisis lists drop the erased resident immediately.
- The erasure cannot be triggered by a session alone without the password.
