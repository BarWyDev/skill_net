# Crisis Deactivation — Plan Brief

> Full plan: `context/changes/crisis-deactivation/plan.md`

## What & Why

A coordinator can end an active crisis and return that incident to everyday mode (roadmap S-04, FR-015). Without it a demo crisis can't be closed cleanly, and the ranking snapshot, which links residents to an incident, would live forever.

## Starting Point

S-03 created `crises` (with an unused `status = 'ended'` and `ended_at`) and the `crisis_matches` snapshot. Clients cannot write either table; all writes go through security-definer RPCs. The panel lists active crises only, and several can be active at once.

## Desired End State

On the crisis page, "Zakończ kryzys" opens a dialog with the summary and a warning; confirming ends the crisis, deletes its list of matched people and returns to the panel with a success message. Ended crises show only a summary and appear in a "Zakończone" section; active ones show how long they have run, with a warning after 24 h.

## Key Decisions Made

| Decision            | Choice                                                    | Why (1 sentence)                                                                         |
| ------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Snapshot fate       | Delete `crisis_matches` at end, keep the summary          | After a crisis, no record links a person to the incident; S-08/S-09 inherit this rule.   |
| Auto-expiry         | None; show age, highlight > 24 h                          | No background jobs exist, and a multi-day flood must not expire mid-operation.           |
| Who can end         | Any coordinator; `ended_by` recorded                      | Matches S-03's shift-handover model, where every coordinator sees every crisis.          |
| Confirmation        | Native `<dialog>` with summary and warning                | A deliberate step for an irreversible action, without React.                             |
| After ending        | Panel message + last 10 ended crises                      | Proof it worked, and other coordinators on shift see who ended what.                     |
| Double end          | Idempotent: returns `false`, shows "already ended"        | Two coordinators ending at once is expected, not an error.                               |

## Scope

**In scope:** `ended_by` column and consistency check, `end_crisis` RPC, pgTAP tests, end endpoint, dialog, ended-state page, panel age + ended list, smoke gates.

**Out of scope:** auto-expiry, re-opening, post-crisis list view, a separate audit table, resident-facing notices.

## Architecture / Approach

One security-definer RPC (`end_crisis`) locks the crisis row, flips status, records `ended_at`/`ended_by` and deletes the snapshot in one transaction. A form endpoint calls it and redirects; Astro pages render from `status`. No React.

## Phases at a Glance

| Phase              | What it delivers                                   | Key risk                                                   |
| ------------------ | -------------------------------------------------- | ---------------------------------------------------------- |
| 1. Database        | Column, constraint, `end_crisis`, pgTAP, types     | Race between two coordinators — solved with `for update`   |
| 2. Endpoint and UI | Endpoint, dialog, ended page, panel, smoke         | Merging before the migration reaches production            |

**Prerequisites:** S-03 merged and its migrations in production (verified 2026-10-02).
**Estimated effort:** ~1 session across 2 phases.

## Open Risks & Assumptions

- A mistaken end loses the list; re-activation rebuilds it in seconds, which is accepted.
- The migration must reach production before Phase 2 merges, because Workers Builds deploys `master` on merge.

## Success Criteria (Summary)

- A coordinator ends a crisis in two clicks and sees it among the ended crises.
- After ending, the database holds no rows linking residents to that crisis.
- A forgotten crisis is visibly flagged in the panel after 24 h.
