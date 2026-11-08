# Crisis SMS Alert with YES/NO Confirmation — Plan Brief

> Full plan: `context/changes/crisis-sms-alert-confirmation/plan.md`

## What & Why

When a coordinator activates a crisis, today they get a ranked list but no way to ask the people on it whether they can come. S-07 lets the coordinator text the top N matched residents. Residents reply TAK or NIE by SMS, and those who confirm rise to the top of the list. This is the alert half of US-01 ("from activation to the confirmed list in under 5 minutes") and the last blocker before S-08.

## Starting Point

The ranking is a frozen snapshot (`crisis_matches`) written by `activate_crisis`, with an unused 0.20 availability weight and no confirmation storage. Phone numbers sit in `profile_contacts` with a reserved, client-proof `phone_verified_at`, which no number has today. Exercises, pause and the S-12 visibility switches already define who must never be alerted. The Worker has no queue and runs on the Free plan.

## Desired End State

A resident verifies their number with an SMS code on `/profil`. The coordinator presses "Wyślij alert" for N people (default 50). Eligible residents get a short Polish SMS without diacritics and answer by text. The ranking shows each person's status (queued, sent, delivered, TAK, NIE, not delivered), with TAK first. An exercise only shows how many people would have been texted and at what cost. Ending the crisis erases the alerts.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Provider | SMSAPI.pl | Polish company and data, ~0.11–0.17 zł per SMS, plain REST over `fetch` |
| Answer channel | Reply TAK/NIE by SMS, no link | Works without mobile data and doesn't train people to click SMS links |
| Push | Not in v1 | Avoids service workers, PWA on iOS and http2-based SDKs on workerd |
| Who gets it | Coordinator sends to top N (1–200), can send more | Cost and mistake control; an accidental activation texts nobody |
| Phone verification | SMS code in this slice; alerts only to verified numbers; a verified number belongs to one account | A typo must not text a stranger, and a reply must map to one person |
| Effect of TAK | Confirmed first, then no answer, then NIE; `position` within groups | The coordinator sees at a glance whom they can count on |
| Changing an answer | Last answer wins; a reply after the end gets "akcja zakończona" | People change plans; the list stays current |
| Exercises | Simulated: counts and cost, no SMS | Keeps the "nobody gets an alert in an exercise" promise |
| Two crises at once | One open alert per resident; an alert stays open while its crisis is active, answered or not | A bare "TAK" is unambiguous, answers can change, and a confirmed volunteer is not pulled into a second crisis |
| S-07 / S-08 split | S-07 shows the status; S-08 adds contacts and live refresh | Smaller, shippable PRs; break-glass covers the gap |
| Failures | 3 retries, then a dead-letter queue, plus delivery reports | No alert disappears silently |
| DB access from Worker | Security-definer RPCs gated by a worker token whose SHA-256 sits in `private.worker_tokens`, no service key, explicit per-function grants | Keeps the "publishable key only" rule without adding Vault |

## Scope

**In scope:** queue and custom Worker entry, SMSAPI client and fake provider, phone verification, alert batches with caps, consumer with retries and DLQ, reply and delivery-report webhooks, ranking order and status badges, team order, privacy notice, owner checklist, production E2E.

**Out of scope:** push, links in SMS, auto-send on activation, contacts of confirmed people and live refresh (S-08), re-scoring with `w_availability`, reminders, backup provider, consent-version bump.

## Architecture / Approach

The coordinator's POST calls `queue_crisis_alerts`, which picks eligible rows, inserts `crisis_alerts` and returns ids, and puts the ids on the `skillnet-sms-alerts` queue. The consumer in `src/worker.ts` claims each alert, re-checking eligibility, sends it through SMSAPI and marks it sent. It retries on failure and hands over to the DLQ after that. SMSAPI calls back two secret-path webhooks, one for delivery reports and one for replies, which call token-gated RPCs. The list RPC orders by answer, then position. A fake provider keeps dev, CI and previews from sending real SMS.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Platform foundation | Custom entry, queue + DLQ, SMS client, GSM-7 text, secrets | The custom entry breaks the adapter's routing |
| 2. Phone verification | SMS code on `/profil`, `phone_verified_at` set | Abuse of code sends (cost); rate limits must hold |
| 3. Sending alerts | "Wyślij alert" with caps, exercise simulation, consumer | An eligibility gap texts someone who opted out |
| 4. Replies, reports, ranking | TAK/NIE loop, statuses, confirmed-first order, privacy text | SMSAPI callback format differs from the docs |
| 5. Production rollout | Owner setup, real-phone E2E, docs | Two-way number availability/cost; sender rules in PL |

**Prerequisites:** Workers Paid before the Phase 1 PR merges (Free can't deploy a queue binding). SMSAPI account with a two-way number before Phase 5.
**Estimated effort:** ~5–6 sessions, one PR per phase.

## Open Risks & Assumptions

- SMSAPI's exact API and callback field names, and the two-way product with its monthly fee, are assumed from general knowledge. They are verified at the start of Phase 1 and in the owner checklist.
- Polish rules on SMS sender registration may affect the sender; the owner asks SMSAPI and CERT Polska.
- The DPO may require a new consent version for SMS processing, which would force every resident to re-consent.
- Existing residents start unverified, so the first pilot alert reaches only those who verified.

## Success Criteria (Summary)

- On production, the owner's verified phone receives an alert, a TAK moves them to the top within 5 minutes of sending, and a NIE moves them down.
- An exercise texts nobody, and an ended crisis leaves no alert rows.
- No phone number, reply text or secret appears in Workers Logs.
