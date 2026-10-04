# Break-glass Contact Reveal — Plan Brief

> Full plan: `context/changes/break-glass-contact-reveal/plan.md`

## What & Why

Roadmap S-09 (FR-012). By default a coordinator never sees residents' phone numbers. If nobody confirms (no network, night, or no SMS path yet), the coordinator has no way to reach anyone. Break-glass lets a coordinator deliberately reveal the numbers of everyone matched to an active crisis, with a stated reason. Every reveal is logged in Supabase, where the log outlives Workers' 7-day log retention.

## Starting Point

S-06 put phones in `profile_contacts`, readable only by their owner. The crisis page shows a pseudonymous ranked list (`Osoba #N`, capped at 200 rows) with only a "bez telefonu" flag. `end_crisis` deletes the ranking snapshot so that no record links a resident to an incident. The only audit table so far is `coordinator_role_events`.

## Desired End State

On an active crisis, a coordinator opens "Ujawnij kontakty (break-glass)", reads a warning, enters a reason of at least 10 characters and submits. The response lists every matched resident who has a phone (no 200 cap), each with a tap-to-call number marked unverified. Reloading, opening the crisis page, or switching to another coordinator shows no numbers until a new reveal. Each reveal leaves an event row and one row per exposed resident, and those rows survive the end of the crisis and the deletion of accounts.

## Key Decisions Made

| Decision          | Choice                                                         | Why (1 sentence)                                                                                     |
| ----------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Persistence       | Per-view: numbers only in the POST response; re-reveal each time | Every on-screen exposure has its own audit row, and nothing lingers for the next person on the device. |
| Scope             | Everyone in the snapshot with a phone, no 200 cap              | FR-012 says "all matched", and a blackout is exactly when the coordinator needs every number.          |
| Audit contents    | Event (crisis, coordinator, time, count, reason) + exposed user_ids, kept after crisis end | Answers "who saw my number, when, why"; a documented exception to S-04's no-link rule.    |
| Reason            | Required free text, 10–500 characters after trimming           | It makes the act deliberate and gives a reviewer context.                                            |
| Reveal view       | Dedicated `/koordynator/kryzys/<id>/kontakty` page, GET form + POST list | The default list stays number-free; one tap to call on a phone; works without JS.          |
| Unverified phones | Show all, with an unverified banner                            | No number is verified before S-07; filtering would make the slice return nothing.                    |
| Export            | None, screen only                                              | The numbers never leave the audited channel.                                                         |
| Resident notice   | Not in this slice                                              | The subject rows make it answerable on request; a `/profil` view is parked.                          |
| Where rules live  | One security-definer RPC that checks, logs and returns in a single transaction | No path returns numbers without a log row, so the app layer cannot weaken it.          |

## Scope

**In scope:** two audit tables and `reveal_crisis_contacts` (with a pgTAP suite); `CrisisContactDTO` and the `revealCrisisContacts` service; the `kontakty` page; the entry link and updated copy on the crisis page; smoke gate checks; `formatPhone`.

**Out of scope:** persistent revealed state, export, a resident-facing reveal history, verified-only filtering, gating on missing confirmations (S-07), partial or top-N reveal, audit retention (S-14), email as a contact, an operator UI for the log, changes to `end_crisis` and `get_crisis_matches`.

## Architecture / Approach

The request flows from the GET `kontakty` page (warning + reason form), through a POST to the same page (zod validation of the reason), to `revealCrisisContacts`, which calls the `reveal_crisis_contacts` RPC. Inside one transaction the RPC checks `is_coordinator`, locks the crisis row `FOR SHARE` and requires it to be active, checks the reason, inserts the event and subject rows, and returns the rows. The page then renders the contact list in the POST response, with no redirect. The middleware already gates the route and sends `private, no-store`.

## Phases at a Glance

| Phase                      | What it delivers                                                | Key risk                                                                                       |
| -------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 1. Database                | Audit tables, the reveal RPC, the pgTAP suite, regenerated types | A grant or revoke slip exposes the log or the RPC to clients (the suite covers it).            |
| 2. App                     | `kontakty` page, service, entry link, smoke checks              | Numbers leaking outside the POST response (redirect, URL, storage); POST resubmit semantics.   |

**Prerequisites:** S-03, S-04, S-06 merged (done); local Supabase via Docker; the Phase 1 migration pushed to production before the Phase 2 PR merges.
**Estimated effort:** ~2 sessions across 2 phases.

## Open Risks & Assumptions

- Keeping the exposed user_ids after crisis end is a deliberate exception to S-04's rule. S-14 erasure and the pilot DPO (Roadmap Q12) must accept it.
- Unverified numbers may be wrong. The coordinator is warned, but may still call a stranger.
- A browser "resend form" counts as a new reveal and writes a new audit row. That is intended, but it may inflate the log.
- A very large match (thousands) renders a long page. That is acceptable for the pilot, but untested at scale.

## Success Criteria (Summary)

- A coordinator can reach every matched resident who has a phone on an active crisis, with tap-to-call on a phone, within a minute of deciding to.
- The numbers are visible only in the response to a reveal that wrote an audit row naming the coordinator, the reason and every exposed resident.
- The audit trail survives the end of the crisis and the deletion of accounts, and no client role can read or alter it.
