---
project: SkillNet
version: 1
status: draft
created: 2026-09-26
updated: 2026-09-26
prd_version: 1
main_goal: market-feedback
top_blocker: decisions
milestone_id: pilot-ready-crisis-matching
milestone_seq: 1
milestone_status: open
---

# Roadmap: SkillNet

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Milestone

**M-1: Pilot-ready crisis matching** — Status: open

- **Intent:** A council coordinator can run a simulated crisis on real registrations from one area: residents register skills and location, the coordinator activates a crisis, gets a ranked list, alerts go out, and confirmed people land on the operational list, with the privacy guardrails in place for a real pilot.
- **Source materials:** `context/foundation/prd.md` (v1); crisis-type × skills matrix and team templates from `docs/shape_not.md`, which the PRD cites as the seed spec.
- **Done when:** every S-NN below is `done`.
- **Scope anchors:** all must-have FRs (FR-001 to FR-012, FR-014, FR-015, FR-017, FR-019) and US-01. The nice-to-have FRs (FR-013, FR-016, FR-018) are parked.

## Vision recap

In a crisis, the most valuable local resource is people nearby with specific skills, but today nobody knows who can do what or where they live, so coordination starts from zero once the crisis has already begun. SkillNet keeps a local skills directory that exists _before_ the crisis. A council coordinator activates crisis mode and gets residents ranked by distance, skill match and confirmed availability. Everyday use (an aggregated skills map) is what keeps the directory fresh between crises.

## North star

**S-03: Coordinator activates crisis mode and sees a ranked list of matched residents** — the PRD's Primary success criterion is literally "a coordinator runs a simulated crisis scenario on real registrations and gets ≥ N matched people", so this is the first moment the product can be shown to a real coordinator for feedback.

> The north star is the smallest end-to-end slice whose successful delivery proves the core product hypothesis. It is placed as early as its prerequisites allow, because everything else only matters if this works.

## At a glance

| ID   | Change ID                       | Outcome (user can …)                                                                   | Prerequisites                 | PRD refs              | Status   |
| ---- | ------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------- | --------------------- | -------- |
| S-01 | resident-skills-profile         | resident can record their skills (with level 1–3) and an approximate location          | —                             | FR-002, FR-003        | ready    |
| S-02 | coordinator-role-grant          | operator can grant the coordinator role, which opens a coordinator-only area           | —                             | FR-017                | ready    |
| S-03 | crisis-activation-ranked-list   | coordinator can activate crisis mode and see a ranked list of matched residents        | S-01, S-02                    | US-01, FR-009, FR-010 | proposed |
| S-04 | crisis-deactivation             | coordinator can end crisis mode and return to everyday mode                            | S-03                          | FR-015                | proposed |
| S-05 | verified-sign-up-with-consent   | resident can sign up with a verified email and explicit data-processing consent        | —                             | FR-001                | ready    |
| S-06 | resident-phone-and-availability | resident can add an optional hidden phone number and declare availability              | S-01                          | FR-004, FR-005        | proposed |
| S-07 | crisis-sms-alert-confirmation   | matched resident can receive a crisis SMS and answer YES/NO                            | S-03, S-06, Workers Paid plan | US-01, FR-011         | blocked  |
| S-08 | live-operational-list           | coordinator can watch confirmed people land on the operational list with contacts      | S-07                          | US-01, FR-012         | proposed |
| S-09 | break-glass-contact-reveal      | coordinator can deliberately reveal all matched people's contacts, with the act logged | S-03, S-06                    | FR-012                | proposed |
| S-10 | crisis-team-templates           | coordinator can get teams assembled from predefined templates                          | S-03                          | FR-014                | proposed |
| S-11 | public-skills-density-map       | anonymous visitor and resident can see the aggregated skills map of their area         | S-01                          | FR-008                | proposed |
| S-12 | data-visibility-controls        | resident can choose which of their data is visible, and in which mode                  | S-06                          | FR-006                | blocked  |
| S-13 | pause-availability              | resident can pause their availability without deleting the account                     | S-01                          | FR-019                | proposed |
| S-14 | unregister-and-erase            | resident can unregister and immediately disappear from searches                        | S-01                          | FR-007                | proposed |

## Streams

Navigation aid: items grouped by the prerequisite chain they share. The canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks. There are no foundations in this milestone, so streams follow the slice chains.

| Stream | Theme                             | Chain                                      | Note                                                                                                    |
| ------ | --------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| A      | Crisis matching core              | `S-01` → `S-02` → `S-03` → `S-04` → `S-10` | Reaches the north star as fast as possible; the first thing a coordinator can give feedback on.         |
| B      | Alert and confirmation loop       | `S-06` → `S-07` → `S-08` → `S-09`          | Joins Stream A at `S-03`; completes US-01 end to end and carries the riskiest integration (SMS).        |
| C      | Resident control and everyday use | `S-05` → `S-11` → `S-12` → `S-13` → `S-14` | Joins Stream A at `S-01` (and B at `S-06` for `S-12`); the guardrails a real pilot needs before launch. |

## Baseline

What's already in place in the codebase as of `2026-09-26` (auto-researched + user-confirmed).
Slices below assume these are present and do NOT re-scaffold them.

- **Frontend:** partial. Astro SSR with React islands, Tailwind and shadcn/ui (only `button`). Starter landing page and auth pages (`src/pages/index.astro`, `src/pages/auth/*`, `src/pages/dashboard.astro`); the UI copy is English starter copy.
- **Backend / API:** partial. Only the auth endpoints exist (`src/pages/api/auth/{signin,signup,signout}.ts`), with no domain API.
- **Data:** absent. Supabase (Postgres 17) is configured in `supabase/config.toml`, but there are no migrations, domain tables, geospatial extension or seed data.
- **Auth:** partial. Supabase email and password sign-in with cookie sessions (`src/lib/supabase.ts`); middleware protects `/dashboard` (`src/middleware.ts`). There are no roles, no SMS verification and no email confirmation (`enable_confirmations = false`), and Supabase's built-in SMTP blocks sign-ups from non-team addresses.
- **Deploy / infra:** present. Cloudflare Workers (**Free** plan) at `https://skillnet.barwy.workers.dev`, auto-deployed by Workers Builds; previews sit behind Cloudflare Access; CI in `.github/workflows/ci.yml` (lint, type check, build, smoke). There is no background job or scheduled-task infrastructure yet, and the Paid plan is required before crisis alerts ship.
- **Observability:** partial. Workers Logs are enabled (`observability.enabled` in `wrangler.jsonc`), but there is no error tracking and no audit trail in the database.

## Foundations

No foundations in this milestone. Every absent or partial layer is introduced inside the first slice that uses it:

- Location data and the skills taxonomy come with S-01.
- Roles come with S-02.
- The crisis matrix and ranking come with S-03.
- The consent and audit trail come with S-05 and S-09.
- Background alert delivery comes with S-07.

Each of these can be planned inside its consuming slice, so none of them needed to be pulled ahead as a separate foundation.

## Slices

### S-01: Resident records skills and approximate location

- **Outcome:** a signed-in resident can pick skills from the predefined taxonomy (medical, technical, logistics, language, military/reserve, tools/equipment) with a self-declared level of 1–3, and set an approximate location by postcode or map pin, in a Polish interface that works on a phone.
- **Change ID:** resident-skills-profile
- **PRD refs:** FR-002, FR-003
- **Prerequisites:** —
- **Parallel with:** S-02, S-05
- **Blockers:** —
- **Unknowns:**
  - How is a postcode turned into a location, given the guardrail that matching must work when optional external services fail? — Owner: user. Block: no.
- **Risk:** First, because every other slice consumes resident data. The location model has to support a radius query from day one, or S-03 inherits a rewrite.
- **Status:** ready

### S-02: Operator grants the coordinator role

- **Outcome:** the operator can grant a registered user the coordinator role; a coordinator sees a coordinator-only area that residents and anonymous visitors cannot open.
- **Change ID:** coordinator-role-grant
- **PRD refs:** FR-017
- **Prerequisites:** —
- **Parallel with:** S-01, S-05, S-06, S-11, S-12, S-13, S-14
- **Blockers:** —
- **Unknowns:**
  - What does an unauthenticated visitor see at a gated route (PRD Open Question 6)? — Owner: user. Block: no; the current redirect to sign-in is the default.
- **Risk:** Small, but it gates the north star: without a role boundary, the ranked list (which holds personal data) has no one it can safely be shown to.
- **Status:** ready

### S-03: Coordinator activates crisis mode and sees a ranked list

- **Outcome:** a coordinator can activate crisis mode by choosing the incident type, location and radius, and within 3 seconds sees residents matched to that crisis type, ranked by the weighted score (distance, skill match, skill level, availability confirmation), even when optional external services are down.
- **Change ID:** crisis-activation-ranked-list
- **PRD refs:** US-01, FR-009, FR-010
- **Prerequisites:** S-01, S-02
- **Parallel with:** S-05, S-06, S-11, S-12, S-13, S-14
- **Blockers:** —
- **Unknowns:**
  - What are the numeric weights per crisis type? The seed spec gives only the qualitative rule (distance dominates in a flood, medical skills in a mass-casualty incident). — Owner: user. Block: no; provisional weights are enough to plan and ship.
  - What does each ranked row show before a person confirms, given that phone and exact location stay hidden until the person confirms or the coordinator deliberately reveals them (S-09)? — Owner: user. Block: no.
  - Where do the registrations for the simulated scenario come from (PRD Open Question 3, cold start), and what is N (Open Question 2)? — Owner: user. Block: no for planning; yes for measuring the Primary criterion.
- **Risk:** This is the north star and the riskiest assumption: that a fixed matrix plus weights gives a coordinator a list they trust. The ≤ 3 s target means the ranking has to be one database round trip, not many.
- **Status:** proposed

### S-04: Coordinator ends crisis mode

- **Outcome:** a coordinator can deactivate crisis mode, and the app returns to everyday mode.
- **Change ID:** crisis-deactivation
- **PRD refs:** FR-015
- **Prerequisites:** S-03
- **Parallel with:** S-05, S-06, S-07, S-08, S-09, S-10, S-11, S-12, S-13, S-14
- **Blockers:** —
- **Unknowns:**
  - Should a forgotten crisis expire on its own, and should revealed contact details be hidden again after deactivation? The PRD records both counter-arguments but adopts neither. — Owner: user. Block: no.
- **Risk:** Sequenced right after the north star so a demo crisis can be closed cleanly. Low risk on its own.
- **Status:** proposed

### S-05: Resident signs up with a verified email and consent

- **Outcome:** a resident can sign up in Polish, verify their email, and give explicit consent to data processing, with the consent recorded in an audit trail that is not platform logs.
- **Change ID:** verified-sign-up-with-consent
- **PRD refs:** FR-001
- **Prerequisites:** —
- **Parallel with:** S-01, S-02, S-03, S-04, S-06, S-07, S-08, S-09, S-10, S-11, S-12, S-13, S-14
- **Blockers:** an own domain and a custom email-sending provider. Supabase's built-in SMTP sends about 2 emails an hour to team addresses only, and `workers.dev` can't be verified as a sending domain.
- **Unknowns:**
  - Is email verification enough for v1, or is SMS verification required at sign-up too (FR-001 says "email/SMS")? — Owner: user. Block: no.
- **Risk:** Not on the north star's path, since development can use today's sign-up, but a pilot with real registrations cannot start without it. The domain and email setup is the lead-time item, so start it early.
- **Status:** ready

### S-06: Resident adds a phone number and availability

- **Outcome:** a resident can add an optional phone number (hidden by default) and declare availability days and hours, shown to the coordinator as information only. A resident without a phone appears on the aggregated map but gets no alerts and no operational-list presence.
- **Change ID:** resident-phone-and-availability
- **PRD refs:** FR-004, FR-005
- **Prerequisites:** S-01
- **Parallel with:** S-02, S-03, S-04, S-05, S-10, S-11, S-13, S-14
- **Blockers:** —
- **Unknowns:** —
- **Risk:** The phone number is the most sensitive field in the product. Hidden-by-default has to hold here, before any crisis flow reads it.
- **Status:** proposed

### S-07: Matched resident gets a crisis SMS and answers YES/NO

- **Outcome:** when a crisis is activated, matched residents who have a phone number receive an SMS about it and can confirm YES or NO. Only people whose skills and area match are alerted, and each YES raises that person's position in the ranking.
- **Change ID:** crisis-sms-alert-confirmation
- **PRD refs:** US-01, FR-011
- **Prerequisites:** S-03, S-06, Workers Paid plan
- **Parallel with:** S-04, S-05, S-09, S-10, S-11, S-12, S-13, S-14
- **Blockers:** Workers Paid upgrade (Free's CPU and subrequest limits silently truncate a fan-out); an SMS provider account, including sender registration.
- **Unknowns:**
  - Which SMS provider, and is push in v1 or SMS only? Planning the alert path depends on this answer. — Owner: user. Block: yes.
  - Is there a cap on how many top-ranked people get alerted (PRD Open Question 9)? — Owner: user. Block: no for the pilot.
- **Risk:** The most expensive and most failure-prone integration in the MVP (fan-out limits, the provider's rate limits, the confirmation path crossing three vendors). It sits right after the north star to surface that risk early, which fits the feedback-first goal.
- **Status:** blocked

### S-08: Coordinator watches the operational list fill up

- **Outcome:** a coordinator sees people who confirmed YES appear on the operational list with their contact details, live, within 5 minutes of activation.
- **Change ID:** live-operational-list
- **PRD refs:** US-01, FR-012
- **Prerequisites:** S-07
- **Parallel with:** S-04, S-05, S-09, S-10, S-11, S-12, S-13, S-14
- **Blockers:** —
- **Unknowns:** —
- **Risk:** This completes US-01's acceptance criterion (< 5 minutes from activation to the confirmed list). The list must read the database directly, so a missed update never hides a confirmation.
- **Status:** proposed

### S-09: Coordinator reveals all matched contacts (break-glass)

- **Outcome:** a coordinator can deliberately reveal the contact details of everyone matched (break-glass: an emergency override of the default privacy rule, used when nobody has confirmed, for example because the mobile network is down). The reveal is recorded in an append-only audit trail.
- **Change ID:** break-glass-contact-reveal
- **PRD refs:** FR-012
- **Prerequisites:** S-03, S-06
- **Parallel with:** S-04, S-05, S-07, S-08, S-10, S-11, S-12, S-13, S-14
- **Blockers:** —
- **Unknowns:** —
- **Risk:** This is the fallback when SMS fails, so it deliberately does not depend on S-07. The audit trail must outlive the platform's 7-day log retention.
- **Status:** proposed

### S-10: Coordinator gets teams assembled from templates

- **Outcome:** a coordinator can ask for teams assembled from predefined templates (for example, an evacuation team is a medic, a physically strong person and a driver with a vehicle), built on the current ranking.
- **Change ID:** crisis-team-templates
- **PRD refs:** FR-014
- **Prerequisites:** S-03
- **Parallel with:** S-04, S-05, S-06, S-07, S-08, S-09, S-11, S-12, S-13, S-14
- **Blockers:** —
- **Unknowns:**
  - How does assembly behave when a small pilot can't fill a template (partial team vs. no team)? — Owner: user. Block: no.
- **Risk:** Builds purely on the ranking. Parallel-friendly and low risk; the templates are already written down in the seed spec.
- **Status:** proposed

### S-11: Anyone sees the aggregated skills map of their area

- **Outcome:** an anonymous visitor or a resident can see the density of skills in their area on a map, with no personal data.
- **Change ID:** public-skills-density-map
- **PRD refs:** FR-008
- **Prerequisites:** S-01
- **Parallel with:** S-02, S-03, S-04, S-05, S-06, S-07, S-08, S-09, S-10, S-12, S-13, S-14
- **Blockers:** —
- **Unknowns:**
  - What minimum aggregation keeps a sparse area from revealing an individual's location, and is a public "gap map" acceptable? — Owner: user. Block: no.
- **Risk:** This is the everyday reason to open the app, which keeps the directory fresh. At low density it can leak individual locations, so aggregation is the whole slice.
- **Status:** proposed

### S-12: Resident controls data visibility per mode

- **Outcome:** a resident can choose which of their data is visible, and whether it is visible in everyday mode, crisis mode or both.
- **Change ID:** data-visibility-controls
- **PRD refs:** FR-006
- **Prerequisites:** S-06
- **Parallel with:** S-02, S-03, S-04, S-05, S-07, S-08, S-09, S-10, S-11, S-13, S-14
- **Blockers:** —
- **Unknowns:**
  - Which fields are controllable, per which modes, and does hiding a skill also exclude it from crisis matching? Planning can't start until the visibility matrix is defined. — Owner: user. Block: yes.
- **Risk:** Interacts with matching (S-03), the map (S-11) and the operational list (S-08). An unclear rule here silently breaks the guardrails.
- **Status:** blocked

### S-13: Resident pauses their availability

- **Outcome:** a resident can pause their availability without deleting the account, and resume it later.
- **Change ID:** pause-availability
- **PRD refs:** FR-019
- **Prerequisites:** S-01
- **Parallel with:** S-02, S-03, S-04, S-05, S-06, S-07, S-08, S-09, S-10, S-11, S-12, S-14
- **Blockers:** —
- **Unknowns:**
  - Does a pause remove the person from the ranking or only from alerts, does it expire, and what happens when someone pauses after a YES during an active crisis? — Owner: user. Block: no.
- **Risk:** Low. It keeps the directory full, the alternative the PRD accepted to deletion.
- **Status:** proposed

### S-14: Resident unregisters and their data is erased

- **Outcome:** a resident can unregister at any time. They disappear from searches, the map and alerts immediately, and their personal data is fully removed within 30 days.
- **Change ID:** unregister-and-erase
- **PRD refs:** FR-007
- **Prerequisites:** S-01
- **Parallel with:** S-02, S-03, S-04, S-05, S-06, S-07, S-08, S-09, S-10, S-11, S-12, S-13
- **Blockers:** —
- **Unknowns:**
  - How does erasure reconcile with audit records (consent, break-glass) that reference the person? — Owner: user. Block: no.
- **Risk:** A hard guardrail for any pilot with real people. It needs deferred deletion, the first scheduled background task in the product.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Issue | Change ID                       | Suggested issue title                                         | Ready for `/10x-plan` | Notes                                               |
| ---------- | ----- | ------------------------------- | ------------------------------------------------------------- | --------------------- | --------------------------------------------------- |
| S-01       | #2    | resident-skills-profile         | Resident profile: skills (level 1–3) and approximate location | yes                   | Run `/10x-plan resident-skills-profile`             |
| S-02       | #3    | coordinator-role-grant          | Operator grants coordinator role; coordinator-only area       | yes                   | Run `/10x-plan coordinator-role-grant`              |
| S-03       | #4    | crisis-activation-ranked-list   | Activate crisis mode and show ranked matched residents        | no                    | North star; waits on S-01, S-02                     |
| S-04       | #5    | crisis-deactivation             | Deactivate crisis mode                                        | no                    | Waits on S-03                                       |
| S-05       | #6    | verified-sign-up-with-consent   | Sign-up with verified email and data-processing consent       | yes                   | Needs own domain + email provider before real users |
| S-06       | #7    | resident-phone-and-availability | Optional hidden phone number and availability                 | no                    | Waits on S-01                                       |
| S-07       | #8    | crisis-sms-alert-confirmation   | Crisis SMS alert with YES/NO confirmation                     | no                    | Blocked: SMS provider choice; needs Workers Paid    |
| S-08       | #9    | live-operational-list           | Live operational list of confirmed volunteers                 | no                    | Waits on S-07                                       |
| S-09       | #10   | break-glass-contact-reveal      | Break-glass reveal of matched contacts, audited               | no                    | Waits on S-03, S-06                                 |
| S-10       | #11   | crisis-team-templates           | Assemble teams from predefined templates                      | no                    | Waits on S-03                                       |
| S-11       | #12   | public-skills-density-map       | Public aggregated skills-density map                          | no                    | Waits on S-01                                       |
| S-12       | #13   | data-visibility-controls        | Per-field, per-mode data visibility controls                  | no                    | Blocked: visibility matrix undefined                |
| S-13       | #14   | pause-availability              | Pause and resume availability                                 | no                    | Waits on S-01                                       |
| S-14       | #15   | unregister-and-erase            | Unregister with immediate removal and 30-day erasure          | no                    | Waits on S-01                                       |

## Open Roadmap Questions

1. **What is `timeline_budget.mvp_weeks`?** The user accepted a multi-week MVP (full flow estimated at 6+ weeks) but did not give a number. — Owner: user. Block: none (the roadmap carries no dates).
2. **What is N in the Primary success criterion (minimum matched people in the pilot scenario)?** — Owner: user. Block: S-03 acceptance; the Primary criterion is unfalsifiable until N is set.
3. **How is cold start solved?** The coordinator only gets value once the directory holds residents. Options: a pilot in one neighbourhood, demo data, a partner organisation. — Owner: user. Block: S-03 feedback session (not planning).
4. **What are `target_scale.qps` and `target_scale.data_volume`?** Crisis mode is bursty (one activation fans out to every matched resident at once). — Owner: user. Block: S-07.
5. **Which user stories cover the resident and operator flows?** Only US-01 is written; the resident and operator slices trace to FRs only. — Owner: user. Block: none; worth adding before planning S-05, S-06, S-12, S-13, S-14.
6. **What does an unauthenticated visitor see when they hit a gated route?** — Owner: user. Block: S-02 (non-blocking default: redirect to sign-in).
7. **What are the user's additional non-goals?** — Owner: user. Block: roadmap-wide (may park more).
8. **The shaping quality cross-check never ran** (`quality_check_status: pending`, phase 6 of 8). — Owner: user. Block: roadmap-wide (unknown gaps).
9. **Parallel incidents, alert limits and per-municipality matrices are unresolved at scale.** — Owner: user. Block: none for the pilot; must be answered before multi-municipality rollout.
10. **When does production move to the Workers Paid plan?** It is a human-only change, and it must happen before the first deploy that carries crisis alerts. — Owner: user. Block: S-07.
11. **Which own domain and email-sending provider back sign-up verification?** — Owner: user. Block: S-05 going live for non-team users, and therefore any pilot with real registrations.
12. **What will the pilot council's data-protection officer accept for where phone numbers and locations are processed?** The Supabase region is fixed, but Workers process requests at any edge location. — Owner: user. Block: pilot launch (S-07, S-08, S-09 with real data).

## Parked

- **Live map of confirmed volunteers (FR-013)** — Why parked: nice-to-have; PRD §Non-Goals says the MVP ends at the operational list.
- **Ad-hoc search "skill X within Y km of Z" (FR-016)** — Why parked: nice-to-have, and it bypasses crisis mode (directory access without an incident).
- **In-product editing of the taxonomy and crisis matrix (FR-018)** — Why parked: nice-to-have; v1 matrix and weights are fixed and change only through a release.
- **Skill verification (diplomas, certificates)** — Why parked: PRD §Non-Goals; self-declaration and trust.
- **Payments for services** — Why parked: PRD §Non-Goals; volunteering only.
- **Everyday exchange board or wanted-skills list** — Why parked: PRD §Non-Goals; everyday mode in v1 is the aggregated map only.

## Milestone History

## Done
