# Verified Sign-up with Consent — Plan Brief

> Full plan: `context/changes/verified-sign-up-with-consent/plan.md`

## What & Why

Roadmap S-05 (FR-001). A resident signs up in Polish, gives explicit, versioned consent to data processing, and verifies their email before using the account. The consent is recorded in a Supabase audit table, not in logs. A pilot with real registrations can't start without this.

## Starting Point

Sign-up today is an English email+password form with no consent. Production already requires email confirmation, but nothing receives the link, an expired link is a dead end, and the built-in SMTP only reaches team addresses (about 2 emails an hour).

## Desired End State

The Polish sign-up form has an unticked consent checkbox and a privacy page. The account and its consent record are created in one transaction, and calling GoTrue directly can't skip consent. A Polish email link verifies the resident and signs them in, and a broken link offers a resend. Older accounts are gated to `/zgoda` until they accept. Residents with no consent never enter crisis matching or the density map. On production, mail goes through custom SMTP on an own domain.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Verification channel | Email only | SMS needs a provider and Workers Paid (S-07); FR-004 keeps the phone optional. |
| SMTP / domain | Code now, human rollout phase | DNS lead time shouldn't block code; tested on team addresses until then. |
| How consent is written | `after insert` trigger on `auth.users` reading `consent_version` from sign-up metadata | Atomic with account creation; no session exists at sign-up while confirmation is on. |
| Enforcement | API check + DB trigger for `provider = email` sign-ups | The public key can't create an account without consent; fixtures and admin inserts stay exempt. |
| Older accounts | Gate on next visit (`/zgoda`) | Never fabricate consent through a backfill. |
| Retention after erasure | Keep a bare id + version + timestamp | Proves lawful past processing; same as other audit tables (S-14). |
| Consent text | Drafted Polish text + privacy page, one version constant | Unblocks code; a wording change is a version bump that re-triggers the gate. Needs owner/legal review. |
| Expired link | Resend form, neutral response | No dead ends; doesn't reveal which emails are registered. |
| Link format | `token_hash` + `verifyOtp` (not PKCE `code`) | Works when someone signs up on one device and clicks on another. |
| Matching | Exclude residents with no consent row ever | A wording bump can't empty a live crisis list. |

## Scope

**In scope:** consent tables, trigger and RPCs; consent clause in `profile_is_matchable`; Polish sign-up, sign-in, confirm and resend pages; privacy page; `/auth/confirm`; consent gate with accept, sign-out and unregister; smoke and pgTAP; the production checklist for template, domain and SMTP.

**Out of scope:** SMS verification; withdrawing consent without deleting the account; backfilling consent; final legal wording; moving the Worker to a custom domain; a service-role key.

## Architecture / Approach

The invariants live in Postgres. `consent_versions` whitelists published versions. `consent_events` is append-only (owner select only, writes through security-definer functions). The trigger on `auth.users` writes the `signup` row or raises `consent_required`. In the app, one consent module holds the version, the endpoints pass it through, the middleware checks `my_latest_consent_version()` in parallel with the coordinator check and **fails open**, and `/auth/confirm` verifies the `token_hash`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Consent data model | Tables, trigger, RPCs, matchability clause, pgTAP | A trigger bug breaks every sign-up; 9 suites need consent fixtures |
| 2. Polish sign-up with consent | Checkbox, privacy page, endpoint check, Polish auth copy, error mapper | Draft legal text mistaken for final |
| 3. Email verification flow | `/auth/confirm`, Polish template, resend, unconfirmed sign-in | Local runs without confirmations; manual Mailpit test needed |
| 4. Consent gate | Middleware gate, `/zgoda`, unregister `return_to` | Over-broad gate locking out auth routes |
| 5. Production rollout (human) | `db push`, template, domain + SMTP, live test | Pushing the migration before merging breaks production sign-up |

**Prerequisites:** local Supabase (Docker); a domain and provider account by Phase 5.
**Estimated effort:** about 3–4 sessions for phases 1–4, plus DNS lead time for phase 5.

## Open Risks & Assumptions

- Deploy order is load-bearing: merge first, then `db push` immediately. A future version bump needs the migration pushed before the constant changes.
- The consent and privacy wording is a draft and isn't legal advice. The owner reviews it before the pilot.
- Existing team and test accounts drop out of new crisis activations until they accept once.
- Mailing an address requires the custom SMTP to be live; until then only team addresses work in production.

## Success Criteria (Summary)

- A new resident can't get an account without ticking consent, and the record exists the moment the account does.
- The Polish email link verifies and signs the resident in, on any device, and a broken link offers a resend.
- No resident without a consent record appears in a crisis list or on the map.
