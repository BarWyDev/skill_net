---
project: SkillNet
version: 1
status: draft
created: 2026-09-26
updated: 2026-11-28
prd_version: 3
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
- **Source materials:** `context/foundation/prd.md` (v3); crisis-type × skills matrix and team templates from `docs/shape_not.md`, which the PRD cites as the seed spec.
- **Done when:** every S-NN below is `done`.
- **Scope anchors:** all must-have FRs (FR-001 to FR-012, FR-014, FR-015, FR-017, FR-019) and US-01, plus the nice-to-have FR-020 (neighbour courses), pulled in on 2026-10-20, FR-021 (interface in English and Ukrainian), pulled in on 2026-11-26, and FR-022 to FR-027 (everyday neighbour help), pulled in on 2026-11-28. The other nice-to-have FRs (FR-013, FR-016, FR-018) are parked.

## Vision recap

In a crisis, the most valuable local resource is people nearby with specific skills, but today nobody knows who can do what or where they live, so coordination starts from zero once the crisis has already begun. SkillNet keeps a local skills directory that exists _before_ the crisis. A council coordinator activates crisis mode and gets residents ranked by distance, skill match and confirmed availability. Everyday use (an aggregated skills map) is what keeps the directory fresh between crises.

## North star

**S-03: Coordinator activates crisis mode and sees a ranked list of matched residents** — the PRD's Primary success criterion is literally "a coordinator runs a simulated crisis scenario on real registrations and gets ≥ N matched people", so this is the first moment the product can be shown to a real coordinator for feedback.

> The north star is the smallest end-to-end slice whose successful delivery proves the core product hypothesis. It is placed as early as its prerequisites allow, because everything else only matters if this works.

## At a glance

| ID   | Change ID                       | Outcome (user can …)                                                                       | Prerequisites                 | PRD refs              | Status   |
| ---- | ------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------- | --------------------- | -------- |
| S-01 | resident-skills-profile         | resident can record their skills (with level 1–3) and an approximate location              | —                             | FR-002, FR-003        | done     |
| S-02 | coordinator-role-grant          | operator can grant the coordinator role, which opens a coordinator-only area               | —                             | FR-017                | done     |
| S-03 | crisis-activation-ranked-list   | coordinator can activate crisis mode and see a ranked list of matched residents            | S-01, S-02, S-15              | US-01, FR-009, FR-010 | done     |
| S-04 | crisis-deactivation             | coordinator can end crisis mode and return to everyday mode                                | S-03                          | FR-015                | done     |
| S-05 | verified-sign-up-with-consent   | resident can sign up with a verified email and explicit data-processing consent            | —                             | FR-001                | done     |
| S-06 | resident-phone-and-availability | resident can add an optional hidden phone number and declare availability                  | S-01                          | FR-004, FR-005        | done     |
| S-07 | crisis-sms-alert-confirmation   | matched resident can receive a crisis SMS and answer YES/NO                                | S-03, S-06, Workers Paid plan | US-01, FR-011         | paused   |
| S-08 | live-operational-list           | coordinator can watch confirmed people land on the operational list with contacts          | S-07                          | US-01, FR-012         | paused   |
| S-09 | break-glass-contact-reveal      | coordinator can deliberately reveal all matched people's contacts, with the act logged     | S-03, S-06                    | FR-012                | done     |
| S-10 | crisis-team-templates           | coordinator can get teams assembled from predefined templates                              | S-03                          | FR-014                | done     |
| S-11 | public-skills-density-map       | anonymous visitor and resident can see the aggregated skills map of their area             | S-01                          | FR-008                | done     |
| S-12 | data-visibility-controls        | resident can choose which of their data is visible, and in which mode                      | S-06                          | FR-006                | done     |
| S-13 | pause-availability              | resident can pause their availability without deleting the account                         | S-01                          | FR-019                | done     |
| S-14 | unregister-and-erase            | resident can unregister and immediately disappear from searches                            | S-01                          | FR-007                | done     |
| S-15 | profile-postcode-minimisation   | resident's stored profile holds only the coarsened point, never the postcode typed         | S-01                          | FR-003                | done     |
| S-16 | email-delivery                  | resident outside the team can receive the Polish confirmation email and confirm            | S-05                          | FR-001                | done     |
| S-17 | neighbour-courses               | resident can offer a free course and signed-in neighbours can sign up for it               | S-01, S-11, S-12              | FR-020                | done     |
| S-18 | interface-language-switch       | visitor can switch the public and sign-in pages to English or Ukrainian                    | —                             | FR-021                | done     |
| S-19 | resident-area-translations      | resident can use their profile, courses, consent and privacy pages in English or Ukrainian | S-18                          | FR-021                | done     |
| S-20 | coordinator-area-translations   | coordinator can run the coordinator area and crisis mode in English or Ukrainian           | S-18, S-19                    | FR-021                | done     |
| S-21 | emails-in-chosen-language       | resident can receive SkillNet's emails in the language they chose                          | S-18                          | FR-021                | proposed |
| S-22 | everyday-help-skills            | resident can add everyday-help skills to their profile, and they count on the map          | S-01, S-11                    | FR-022                | ready    |
| S-23 | content-reports-and-rules       | resident can report a course that breaks the community rules; the operator can hide it     | S-17                          | FR-023                | ready    |
| S-24 | neighbour-help-requests         | resident can ask for help tied to a skill, and matching neighbours can offer it            | S-17, S-22, S-23              | FR-024                | proposed |
| S-25 | help-request-notifications      | resident can get an email about a matching help request or a new offer of help             | S-21, S-24, Workers Paid plan | FR-025                | proposed |
| S-26 | help-confirmation-and-history   | person who asked can confirm the help; both people see it in a private history             | S-24                          | FR-026                | proposed |
| S-27 | remote-help                     | resident can mark a help request or a course as possible remotely                          | S-24                          | FR-027, FR-020        | proposed |

## Before pilot launch

**Paused, not dropped.** Paused on 2026-11-26 because every item here costs money; the owner will pick them up right before the pilot launch, whose date is not set. M-1 stays open until they are done, and the pilot must not start without them.

| Item                                                  | Why it is required                                                            | State on 2026-11-26                                  |
| ----------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------- |
| Workers Paid plan (human-only change)                 | Free's 10 ms CPU and 50-subrequest limits silently truncate the alert fan-out | Not done; Open Roadmap Question 10                   |
| SMS provider account and sender registration          | S-07 cannot send without it; sender registration has lead time                | Not done                                             |
| S-07: crisis SMS alert with YES/NO confirmation       | Completes US-01 and FR-011                                                    | PRs #128–#131 open (phases 1–4), phase 5 not started |
| S-08: live operational list                           | Completes US-01's acceptance criterion and FR-012                             | Not started; waits on S-07                           |
| Data-protection officer's answer on processing places | Blocks a pilot with real phone numbers and locations                          | Open Roadmap Question 12                             |

While these wait, the open S-07 branches drift from `master`; rebase them when work resumes, before reviewing.

The Workers Paid plan also gates S-25 (email notifications about help requests). On 2026-11-28 the owner confirmed that production will move to the Paid plan; the date is still Open Roadmap Question 10. The other everyday-help slices (S-22, S-23, S-24, S-26, S-27) need nothing from this table and do not block the pilot.

## Streams

Navigation aid: items grouped by the prerequisite chain they share. The canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks. There are no foundations in this milestone, so streams follow the slice chains.

| Stream | Theme                             | Chain                                                                | Note                                                                                                                                                                  |
| ------ | --------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A      | Crisis matching core              | `S-01` → `S-15` → `S-02` → `S-03` → `S-04` → `S-10`                  | Reaches the north star as fast as possible; the first thing a coordinator can give feedback on.                                                                       |
| B      | Alert and confirmation loop       | `S-06` → `S-07` → `S-08` → `S-09`                                    | Joins Stream A at `S-03`; completes US-01 end to end and carries the riskiest integration (SMS).                                                                      |
| C      | Resident control and everyday use | `S-05` → `S-16` → `S-11` → `S-12` → `S-13` → `S-14` → `S-17`         | Joins Stream A at `S-01` (and B at `S-06` for `S-12`); the guardrails a real pilot needs before launch, then neighbour courses as an everyday reason to open the app. |
| D      | Interface language                | `S-18` → `S-19` → `S-20`, with `S-21` beside them after `S-18`       | Starts from nothing and touches every page, so it runs while Stream B waits. It does not block the pilot.                                                             |
| E      | Everyday neighbour help           | `S-22` → `S-23` → `S-24` → `S-26` → `S-27`, with `S-25` after `S-24` | Joins Stream C at `S-17`, whose course rules it reuses, and D at `S-21` for `S-25`. Gives residents an everyday reason to open the app; does not block the pilot.     |

## Baseline

What's already in place in the codebase as of `2026-09-26` (auto-researched + user-confirmed).
Slices below assume these are present and do NOT re-scaffold them.

- **Frontend:** partial. Astro SSR with React islands, Tailwind and shadcn/ui (only `button`). Starter landing page and auth pages (`src/pages/index.astro`, `src/pages/auth/*`, `src/pages/dashboard.astro`); the UI copy is English starter copy.
- **Backend / API:** partial. Only the auth endpoints exist (`src/pages/api/auth/{signin,signup,signout}.ts`), with no domain API.
- **Data:** absent. Supabase (Postgres 17) is configured in `supabase/config.toml`, but there are no migrations, domain tables, geospatial extension or seed data.
- **Auth:** partial. Supabase email and password sign-in with cookie sessions (`src/lib/supabase.ts`); middleware protects `/dashboard` (`src/middleware.ts`). There are no roles, no SMS verification and no email confirmation (`enable_confirmations = false`), and Supabase's built-in SMTP blocks sign-ups from non-team addresses.
- **Deploy / infra:** present. Cloudflare Workers (**Free** plan) at `https://skillnet.barwy.workers.dev` (since 2026-11 `https://skillnet.org.pl`), auto-deployed by Workers Builds; previews sit behind Cloudflare Access; CI in `.github/workflows/ci.yml` (lint, type check, build, smoke). There is no background job or scheduled-task infrastructure yet, and the Paid plan is required before crisis alerts ship.
- **Observability:** partial. Workers Logs are enabled (`observability.enabled` in `wrangler.jsonc`), but there is no error tracking and no audit trail in the database.

## Foundations

No foundations in this milestone. Every absent or partial layer is introduced inside the first slice that uses it:

- Location data and the skills taxonomy come with S-01.
- Roles come with S-02.
- The crisis matrix and ranking come with S-03.
- The consent and audit trail come with S-05 and S-09.
- Background alert delivery comes with S-07.
- Email sent by the app itself (outside sign-in emails) comes with S-25.

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
- **Status:** done

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
- **Status:** done

### S-03: Coordinator activates crisis mode and sees a ranked list

- **Outcome:** a coordinator can activate crisis mode by choosing the incident type, location and radius, and within 3 seconds sees residents matched to that crisis type, ranked by the weighted score (distance, skill match, skill level, availability confirmation), even when optional external services are down.
- **Change ID:** crisis-activation-ranked-list
- **PRD refs:** US-01, FR-009, FR-010
- **Prerequisites:** S-01, S-02, S-15
- **Parallel with:** S-05, S-06, S-11, S-12, S-13, S-14
- **Blockers:** —
- **Unknowns:**
  - What are the numeric weights per crisis type? The seed spec gives only the qualitative rule (distance dominates in a flood, medical skills in a mass-casualty incident). — Owner: user. Block: no; provisional weights are enough to plan and ship.
  - What does each ranked row show before a person confirms, given that phone and exact location stay hidden until the person confirms or the coordinator deliberately reveals them (S-09)? — Owner: user. Block: no.
  - Where do the registrations for the simulated scenario come from (PRD Open Question 3, cold start), and what is N (Open Question 2)? — Owner: user. Block: no for planning; yes for measuring the Primary criterion.
- **Risk:** This is the north star and the riskiest assumption: that a fixed matrix plus weights gives a coordinator a list they trust. The ≤ 3 s target means the ranking has to be one database round trip, not many.
- **Status:** done

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
- **Status:** done

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
- **Status:** done

### S-06: Resident adds a phone number and availability

- **Outcome:** a resident can add an optional phone number (hidden by default) and declare availability days and hours, shown to the coordinator as information only. A resident without a phone appears on the aggregated map but gets no alerts and no operational-list presence.
- **Change ID:** resident-phone-and-availability
- **PRD refs:** FR-004, FR-005
- **Prerequisites:** S-01
- **Parallel with:** S-02, S-03, S-04, S-05, S-10, S-11, S-13, S-14
- **Blockers:** —
- **Unknowns:** —
- **Risk:** The phone number is the most sensitive field in the product. Hidden-by-default has to hold here, before any crisis flow reads it.
- **Status:** done

### S-07: Matched resident gets a crisis SMS and answers YES/NO

- **Outcome:** when a crisis is activated, matched residents who have a phone number receive an SMS about it and can confirm YES or NO. Only people whose skills and area match are alerted, and each YES raises that person's position in the ranking.
- **Change ID:** crisis-sms-alert-confirmation
- **PRD refs:** US-01, FR-011
- **Prerequisites:** S-03, S-06, Workers Paid plan
- **Parallel with:** S-04, S-05, S-09, S-10, S-11, S-12, S-13, S-14, S-17
- **Blockers:** Workers Paid upgrade (Free's CPU and subrequest limits silently truncate a fan-out); an SMS provider account, including sender registration.
- **Unknowns:**
  - Which SMS provider, and is push in v1 or SMS only? Planning the alert path depends on this answer. — Owner: user. Block: yes.
  - Is there a cap on how many top-ranked people get alerted (PRD Open Question 9)? — Owner: user. Block: no for the pilot.
- **Risk:** The most expensive and most failure-prone integration in the MVP (fan-out limits, the provider's rate limits, the confirmation path crossing three vendors). It sits right after the north star to surface that risk early, which fits the feedback-first goal.
- **Status:** paused (2026-11-26). **Required before pilot launch**; see "Before pilot launch".

### S-08: Coordinator watches the operational list fill up

- **Outcome:** a coordinator sees people who confirmed YES appear on the operational list with their contact details, live, within 5 minutes of activation.
- **Change ID:** live-operational-list
- **PRD refs:** US-01, FR-012
- **Prerequisites:** S-07
- **Parallel with:** S-04, S-05, S-09, S-10, S-11, S-12, S-13, S-14, S-17
- **Blockers:** —
- **Unknowns:** —
- **Risk:** This completes US-01's acceptance criterion (< 5 minutes from activation to the confirmed list). The list must read the database directly, so a missed update never hides a confirmation.
- **Status:** paused (2026-11-26). **Required before pilot launch**; see "Before pilot launch".

### S-09: Coordinator reveals all matched contacts (break-glass)

- **Outcome:** a coordinator can deliberately reveal the contact details of everyone matched (break-glass: an emergency override of the default privacy rule, used when nobody has confirmed, for example because the mobile network is down). The reveal is recorded in an append-only audit trail.
- **Change ID:** break-glass-contact-reveal
- **PRD refs:** FR-012
- **Prerequisites:** S-03, S-06
- **Parallel with:** S-04, S-05, S-07, S-08, S-10, S-11, S-12, S-13, S-14
- **Blockers:** —
- **Unknowns:** —
- **Risk:** This is the fallback when SMS fails, so it deliberately does not depend on S-07. The audit trail must outlive the platform's 7-day log retention.
- **Status:** done

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
- **Status:** done

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
- **Status:** done

### S-12: Resident controls data visibility per mode

- **Outcome:** a resident can choose which of their data is visible, and whether it is visible in everyday mode, crisis mode or both.
- **Change ID:** data-visibility-controls
- **PRD refs:** FR-006
- **Prerequisites:** S-06
- **Parallel with:** S-02, S-03, S-04, S-05, S-07, S-08, S-09, S-10, S-11, S-13, S-14
- **Blockers:** —
- **Unknowns:**
  - ~~Which fields are controllable, per which modes, and does hiding a skill also exclude it from crisis matching?~~ Resolved 2026-10-19: matrix accepted (decisions D1–D8) in `context/changes/data-visibility-controls/visibility-matrix-proposal.md`. Four switches (map contribution, per-skill crisis use, availability shown in crisis, break-glass consent); a hidden skill is excluded from matching.
- **Risk:** Interacts with matching (S-03), the map (S-11) and the operational list (S-08). An unclear rule here silently breaks the guardrails.
- **Status:** done

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
- **Status:** done

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
- **Status:** done

### S-15: Resident's stored location never identifies a building

- **Outcome:** when a resident sets their location by postcode, only the coarsened 500 m point and `location_source = 'postcode'` are stored; the typed postcode is discarded, and `/profil` shows "Ustawiono z kodu pocztowego" instead of the code.
- **Change ID:** profile-postcode-minimisation
- **PRD refs:** FR-003 (approximate location), Guardrails (exact location hidden)
- **Prerequisites:** S-01
- **Parallel with:** S-02, S-05, S-06, S-11, S-13, S-14
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Found by the S-01 implementation review (F1, `context/archive/2026-09-27-resident-skills-profile/reviews/impl-review.md`). 981 postcodes cover a single PRG address and 3,217 cover 5 or fewer, so a stored postcode can identify a building. S-03's security-definer ranking RPC would be the first cross-user reader, so this must land before S-03.
- **Status:** done

### S-16: Resident outside the team receives the confirmation email

- **Outcome:** a resident with any email address can sign up on production, receive the Polish confirmation email from SkillNet's own sending domain, and confirm the account through the link, which signs them in and opens `/profil`.
- **Change ID:** email-delivery
- **PRD refs:** FR-001 (email verification)
- **Prerequisites:** S-05
- **Parallel with:** S-07, S-08, S-12, S-17
- **Blockers:** an own domain, verified with an email-sending provider (SPF, DKIM, DMARC). DNS verification is the lead-time item.
- **Unknowns:** — (resolved 2026-10-24: Resend, domain `skillnet.org.pl`, sending subdomain `auth.skillnet.org.pl`)
- **Risk:** Split out of S-05 on 2026-10-06. S-05's sign-up, consent and confirmation route are live, but Supabase's built-in sender reaches team addresses only (about 2 emails an hour) and refuses template edits on the free plan, so no resident outside the team can confirm an account. Any pilot with real registrations is blocked until this lands.
- **Status:** done

### S-17: Resident offers a neighbour course

- **Outcome:** a resident can offer a free course tied to one of their skills (title, description, duration); signed-in residents see the courses offered in their area, with no organiser name or contact and the place only as the 2 km square of the public map, and sign up in the app; the organiser sees how many people signed up and gives them the meeting place and time.
- **Change ID:** neighbour-courses
- **PRD refs:** FR-020
- **Prerequisites:** S-01, S-11, S-12
- **Parallel with:** S-07, S-08, S-16
- **Blockers:** —
- **Unknowns:**
  - How does the organiser give the meeting place and time to the people who signed up: inside the app, or by email? Email reaches residents outside the team only after S-16. — Owner: user. Block: no; an in-app notice is the default that needs no new vendor.
  - Does a course in a sparse 2 km square follow the map's minimum-aggregation threshold, given that a listing reveals that someone with skill X lives there? — Owner: user. Block: no; the map's existing threshold is the default.
  - How do courses and sign-ups interact with the resident's controls: does turning off map contribution (S-12) hide their courses, and what happens to their courses and sign-ups when they pause (S-13) or unregister (S-14)? — Owner: user. Block: no.
- **Risk:** Added on 2026-10-20 as the only nice-to-have pulled into M-1. It reopens a slice of the everyday exchange cut during shaping, so the privacy narrowing in FR-020 (signed-in only, no organiser identity, 2 km square) is the whole slice. It touches no crisis path, so it never competes with S-16 for the pilot's critical path.
- **Status:** done

### S-18: Visitor switches the interface language

- **Outcome:** a visitor can switch the interface between Polish, English and Ukrainian with a switcher in the header; the first visit follows the browser's language, the choice is remembered in a cookie, and the landing page, the public map, sign-in, sign-up, the confirmation pages and the error pages follow it, at the same addresses.
- **Change ID:** interface-language-switch
- **PRD refs:** FR-021
- **Prerequisites:** —
- **Parallel with:** S-07, S-08
- **Blockers:** —
- **Unknowns:**
  - Who checks the Ukrainian text before it reaches production? A machine translation of crisis and consent wording needs a native reader. — Owner: user. Block: no for staging; yes for promoting Ukrainian to production (Open Roadmap Question 13).
  - Is a library needed, or are typed message catalogues in `src/lib/` enough? The app has about 600 lines of Polish copy in 73 files, in Astro pages, React islands and server-side validation and services. — Owner: planning. Block: no.
- **Risk:** This slice carries the foundation every later one uses: where the messages live, how the language is resolved on the server (cookie, then the browser's `Accept-Language`, then Polish), and how React islands and server-side error messages get it. The language now varies a page at one address, so no page may be cached as public (see the lesson on public cache headers). The auth endpoints pass errors as `?error=` codes, which the smoke test asserts, so the codes stay and only their display text is translated.
- **Status:** done

### S-19: Resident uses their area in English or Ukrainian

- **Outcome:** a signed-in resident can use `/profil`, `/kursy`, `/zgoda` and `/prywatnosc` in English or Ukrainian, with skill and category names, validation messages, dates and numbers in that language; the consent and the privacy policy carry a note that they are a courtesy translation and the Polish text is binding.
- **Change ID:** resident-area-translations
- **PRD refs:** FR-021
- **Prerequisites:** S-18
- **Parallel with:** S-07, S-08, S-21
- **Blockers:** —
- **Unknowns:**
  - Does the pilot council's data-protection officer accept a courtesy translation of the consent with the Polish text binding? — Owner: user. Block: no for building it; ask together with Open Roadmap Question 12.
  - Category names already come from a message catalogue keyed by slug (`src/lib/i18n/messages/taxonomy.ts`, shipped with S-18, with the database's Polish name as the fallback). Do skill names follow the same way, or get `name_en` and `name_uk` columns beside `name_pl`? Columns are an expand-only migration; catalogues need no migration. — Owner: planning. Block: no.
- **Rollout:** production's `ENABLED_LOCALES` (top-level `vars` in `wrangler.jsonc`) stays `pl` until this slice is done, so no visitor lands on a half-translated resident area; S-18 ships to production with Polish only. Switching it is a one-line change in the last PR of this slice.
- **Already shipped with S-18:** the courtesy translation of the consent on the sign-up form, with the Polish original below it marked as binding (`src/lib/i18n/messages/auth.ts`; `/zgoda` still shows Polish only), and the six category names.
- **Risk:** The consent wording has a single source in `src/lib/consent.ts`, tied to a row in `consent_versions`. The translation must not change the consent version, or every resident is asked to consent again. Course titles and descriptions are typed by residents and stay as written.
- **Status:** done

### S-20: Coordinator runs crisis mode in English or Ukrainian

- **Outcome:** a coordinator can use the coordinator area and crisis mode (activation, ranked list, coverage, teams, contacts, ending a crisis) in English or Ukrainian, with crisis types, team templates and role names in that language.
- **Change ID:** coordinator-area-translations
- **PRD refs:** FR-021
- **Prerequisites:** S-18, S-19 (skill names)
- **Parallel with:** S-07, S-08, S-21
- **Blockers:** —
- **Unknowns:** —
- **Risk:** This is the crisis path, so a wrong or missing translation costs the most here: a missing message must fall back to Polish, never to an empty label or a key. The ranked list must still appear within 3 seconds. The open S-07 and S-08 branches touch the same pages, so whichever lands second rebases onto the other.
- **Status:** done

### S-21: Resident receives emails in the chosen language

- **Outcome:** a resident who chose English or Ukrainian receives the confirmation, sign-in-link and password-recovery emails in that language; the choice is stored with the account, so it also holds on another device.
- **Change ID:** emails-in-chosen-language
- **PRD refs:** FR-021, FR-001
- **Prerequisites:** S-18
- **Parallel with:** S-07, S-08, S-19, S-20
- **Blockers:** —
- **Unknowns:**
  - Supabase keeps one template per email type. Can the three templates in `supabase/templates/` branch on a language value in the user's metadata, and one subject line serve three languages? — Owner: planning. Block: no.
- **Risk:** Email settings are per Supabase project and have drifted on production before (S-16's lesson), so the templates must be checked on production through the Management API after the change. The crisis SMS wording and the YES/NO replies in three languages belong to S-07, not here: a Ukrainian SMS in Cyrillic holds 70 characters per part instead of 160, which raises the cost per alert.
- **Status:** proposed

### S-22: Resident adds everyday-help skills

- **Outcome:** a resident can add everyday-help skills (for example shopping, clearing snow, looking after a pet, keeping someone company, help with moving, small repairs) to their profile, in all three languages; the skills form a seventh category with no level, show on the aggregated map under the same anonymity threshold, and carry no weight in any crisis type.
- **Change ID:** everyday-help-skills
- **PRD refs:** FR-022
- **Prerequisites:** S-01, S-11
- **Parallel with:** S-07, S-08, S-21, S-23
- **Blockers:** —
- **Unknowns:**
  - Which skills make the final list? — Owner: user. Block: no; the default list is in `context/foundation/neighbour-help-plan.md`.
  - Should any everyday skill count in a crisis type (for example shopping during a heat wave)? — Owner: user. Block: no; the default is no weight, so the crisis ranking does not change.
- **Risk:** Sequenced first because it is the smallest slice and the later ones need it: without everyday skills a help request can name only crisis skills, and a resident without a specialist skill has nothing to put in the profile. The category shows up in every place that lists categories (profile, map filter, courses), so a missing translation would be visible at once; the Ukrainian names wait for a native reader (Open Roadmap Question 13).
- **Status:** ready

### S-23: Resident reports content that breaks the rules

- **Outcome:** a signed-in resident can report a course with a reason from a fixed list; a course reported by several residents is hidden until the operator decides, and the operator can hide or restore it; its organiser sees that it is hidden and why; anyone can read the community rules, which include advice on meeting a stranger safely.
- **Change ID:** content-reports-and-rules
- **PRD refs:** FR-023
- **Prerequisites:** S-17
- **Parallel with:** S-07, S-08, S-21, S-22
- **Blockers:** —
- **Unknowns:**
  - Where does the operator read and decide reports: in Supabase Studio, as with the coordinator role, or on an operator page in the app? — Owner: user. Block: no; Studio is the default and needs no new role.
  - How many distinct reports hide an item before the operator has looked? — Owner: user. Block: no; three is the default.
  - Who reads the reports once the pilot runs, and how fast? — Owner: user. Block: no for planning; see Open Roadmap Question 16.
- **Risk:** Sequenced before help requests because a request is the first content written by a person who may be vulnerable, and it must not ship without a way to flag abuse. A report is itself personal data (who reported what), so the privacy notice changes and a new consent version follows (Open Roadmap Question 15). Reports can also be used to silence a neighbour, so each resident's reports are limited and a hidden item is restored by the operator, never deleted automatically.
- **Status:** ready

### S-24: Resident asks neighbours for help

- **Outcome:** a resident can ask for help tied to one skill, with a short description, for 14 days; only signed-in residents in the area who declared that skill see the request, with no name or contact and the place only as the 2 km square of the public map; a neighbour offers help in the app; the person asking sees how many offered and gives the details (place, time, contact) only to the offers they accept; either side can withdraw, and reporting (S-23) covers requests too.
- **Change ID:** neighbour-help-requests
- **PRD refs:** FR-024
- **Prerequisites:** S-17 (visibility, squares and eligibility rules), S-22, S-23
- **Parallel with:** S-07, S-08, S-21
- **Blockers:** —
- **Unknowns:**
  - What does the person asking see about a neighbour who offered, before deciding to share the details? — Owner: user. Block: no; the default is the skill level and how long the account has existed, never a name.
  - Do only residents with the matching skill see a request, or every signed-in neighbour? — Owner: user. Block: no; matching skill only is the default (FR-024).
  - How do requests and offers interact with the resident's controls: pausing (S-13), turning off map contribution (S-12) and unregistering (S-14)? — Owner: planning. Block: no; the course rules are the default.
  - How many open requests may one resident have, and can a request be renewed after 14 days? — Owner: planning. Block: no; three open requests and one renewal are the defaults.
- **Risk:** The largest slice of this stream, and the one that reverses a PRD non-goal, so the narrowing in FR-024 is the whole slice: no board of offers, no browsing without the skill, no chat. Two strangers meet with no identity shown on either side, so the hand-over of details must be a deliberate act of the person asking, per accepted offer, and the safety advice (S-23) must be on the page. The privacy notice changes (a new consent version; Open Roadmap Question 15). Without notifications (S-25) a neighbour sees a request only when they open the app, so the first feedback may look quieter than the feature deserves.
- **Status:** proposed

### S-25: Resident gets an email about a matching request

- **Outcome:** a resident who switched the notification on receives an email, in their chosen language, when a neighbour asks for help matching their skills; the person asking receives an email when a neighbour offers help; every such email carries a link that switches the notification off, and no email carries personal data of the other person.
- **Change ID:** help-request-notifications
- **PRD refs:** FR-025
- **Prerequisites:** S-21 (the language stored with the account), S-24, Workers Paid plan
- **Parallel with:** S-07, S-08, S-26, S-27
- **Blockers:** Workers Paid plan (human-only change; Open Roadmap Question 10). A sending key for the email provider on production and staging (owner).
- **Unknowns:**
  - How many matching neighbours get the email for one request, and how often may one resident be emailed? — Owner: user. Block: no; the nearest 20 and at most one email a day are the defaults.
  - Does the pilot council's data-protection officer accept the email provider's US-hosted logs for these emails too (Open Roadmap Questions 11 and 12)? — Owner: user. Block: no for planning; yes for a pilot with real residents.
  - Does this slice share its background queue with the crisis alerts of S-07 or get its own? — Owner: planning. Block: no; its own queue is the default, so an everyday burst can never delay a crisis alert.
- **Risk:** The only slice here that costs money and sends to many people at once: on the Free plan the fan-out would be cut off silently, as with crisis alerts. It is also the first email the app sends by itself (sign-in emails go through the auth provider), so it brings a new secret per environment and a new way to annoy residents. The one criticism of Commu found in its App Store reviews was notifications used for marketing, so the notification is off by default and limited. S-07 touches the same queue configuration; whichever lands second rebases onto the other.
- **Status:** proposed

### S-26: Person who asked confirms the help

- **Outcome:** the person who asked can confirm that the help took place, and is asked about it when closing the request; the confirmed help appears in the private history of both people and nowhere else; the map shows how many helps were confirmed and how many courses are open in an area, under the same anonymity threshold as the skills map.
- **Change ID:** help-confirmation-and-history
- **PRD refs:** FR-026
- **Prerequisites:** S-24
- **Parallel with:** S-07, S-08, S-25, S-27
- **Blockers:** —
- **Unknowns:**
  - How long is the history kept, and can a resident remove an entry? — Owner: user. Block: no; until the account is deleted, with removal of single entries, is the default.
  - Does the number of confirmed helps ever feed the coordinator's crisis ranking? — Owner: user. Block: no; the default is never, so everyday behaviour does not become a crisis score.
  - Are small numbers on the map shown exactly or as a band? — Owner: planning. Block: no; bands, as on the skills map, are the default.
- **Risk:** The history is new personal data about who helped whom, so the privacy notice changes again (a new consent version; Open Roadmap Question 15) and unregistering (S-14) must erase it on both sides. A count per area must not single out one household in a sparse square, which is why it follows the map's threshold. Public rankings and badges stay out: they would contradict the promise that nobody sees a resident outside a crisis.
- **Status:** proposed

### S-27: Resident marks help as possible remotely

- **Outcome:** a resident can mark a help request or a course as possible remotely (for example help with a phone, a language, a conversation); a remote item is offered to matching residents beyond the neighbouring squares and shows no square at all.
- **Change ID:** remote-help
- **PRD refs:** FR-027, FR-020
- **Prerequisites:** S-24
- **Parallel with:** S-07, S-08, S-25, S-26
- **Blockers:** —
- **Unknowns:**
  - How far does a remote item reach: a fixed distance, or every resident with the skill? — Owner: user. Block: no; 25 km is the default, so the pilot area stays the audience.
- **Risk:** Small, and last because it only widens the audience of what S-17 and S-24 already show. A wider audience means more people see that someone needs help, so a remote item must show even less about the place than a local one.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Issue | Change ID                       | Suggested issue title                                                  | Ready for `/10x-plan` | Notes                                               |
| ---------- | ----- | ------------------------------- | ---------------------------------------------------------------------- | --------------------- | --------------------------------------------------- |
| S-01       | #2    | resident-skills-profile         | Resident profile: skills (level 1–3) and approximate location          | done                  | Archived 2026-09-27                                 |
| S-02       | #3    | coordinator-role-grant          | Operator grants coordinator role; coordinator-only area                | done                  | Archived 2026-09-28                                 |
| S-03       | #4    | crisis-activation-ranked-list   | Activate crisis mode and show ranked matched residents                 | done                  | Archived 2026-10-02 (north star)                    |
| S-04       | #5    | crisis-deactivation             | Deactivate crisis mode                                                 | done                  | Archived 2026-10-02                                 |
| S-05       | #6    | verified-sign-up-with-consent   | Sign-up with verified email and data-processing consent                | done                  | Archived 2026-10-06; email delivery split into S-16 |
| S-06       | #7    | resident-phone-and-availability | Optional hidden phone number and availability                          | done                  | Archived 2026-10-03                                 |
| S-07       | #8    | crisis-sms-alert-confirmation   | Crisis SMS alert with YES/NO confirmation                              | no                    | Paused 2026-11-26; required before pilot launch     |
| S-08       | #9    | live-operational-list           | Live operational list of confirmed volunteers                          | no                    | Paused with S-07; required before pilot launch      |
| S-09       | #10   | break-glass-contact-reveal      | Break-glass reveal of matched contacts, audited                        | done                  | Archived 2026-10-04                                 |
| S-10       | #11   | crisis-team-templates           | Assemble teams from predefined templates                               | done                  | Archived 2026-10-04                                 |
| S-11       | #12   | public-skills-density-map       | Public aggregated skills-density map                                   | done                  | Archived 2026-10-05                                 |
| S-12       | #13   | data-visibility-controls        | Per-field, per-mode data visibility controls                           | done                  | Archived 2026-10-19                                 |
| S-13       | #14   | pause-availability              | Pause and resume availability                                          | done                  | Archived 2026-10-06                                 |
| S-14       | #15   | unregister-and-erase            | Unregister with immediate removal and 30-day erasure                   | done                  | Archived 2026-10-04                                 |
| S-15       | —     | profile-postcode-minimisation   | Stop storing the resident's postcode; keep only coarsened point        | done                  | Archived 2026-09-27; no issue was created           |
| S-16       | #103  | email-delivery                  | Own sending domain, custom SMTP and Polish confirmation email          | done                  | Archived 2026-10-25                                 |
| S-17       | —     | neighbour-courses               | Neighbour courses: offer a free course, neighbours sign up             | done                  | Archived 2026-10-20; no issue was created           |
| S-18       | —     | interface-language-switch       | Language switcher (PL, EN, UK) and translated public and sign-in pages | yes                   | Carries the message catalogues the next three use   |
| S-19       | —     | resident-area-translations      | Resident area, taxonomy and legal texts in English and Ukrainian       | no                    | Waits on S-18                                       |
| S-20       | —     | coordinator-area-translations   | Coordinator area and crisis mode in English and Ukrainian              | no                    | Waits on S-18 and S-19                              |
| S-21       | —     | emails-in-chosen-language       | Emails in the resident's chosen language                               | no                    | Waits on S-18                                       |
| S-22       | —     | everyday-help-skills            | Everyday-help skills: a seventh taxonomy category with no level        | yes                   | Run `/10x-plan everyday-help-skills`                |
| S-23       | —     | content-reports-and-rules       | Report a course; operator hides or restores; community rules page      | yes                   | Run `/10x-plan content-reports-and-rules`           |
| S-24       | —     | neighbour-help-requests         | Help requests matched to skills; offers and hand-over of details       | no                    | Waits on S-22 and S-23                              |
| S-25       | —     | help-request-notifications      | Opt-in emails about matching help requests and new offers              | no                    | Waits on S-21, S-24 and the Workers Paid plan       |
| S-26       | —     | help-confirmation-and-history   | Confirm help; private history; counts of help on the map               | no                    | Waits on S-24                                       |
| S-27       | —     | remote-help                     | Mark a help request or a course as possible remotely                   | no                    | Waits on S-24                                       |

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
10. **When does production move to the Workers Paid plan?** It is a human-only change, and it must happen before the first deploy that carries crisis alerts. On 2026-11-28 the owner confirmed the move; the date is open. — Owner: user. Block: S-07, S-25.
11. ~~**Which own domain and email-sending provider back sign-up verification?**~~ Resolved 2026-10-24: `skillnet.org.pl` with Resend (eu-west-1). Open follow-up: the pilot council's DPO on Resend's US-hosted logs (see 12).
12. **What will the pilot council's data-protection officer accept for where phone numbers and locations are processed?** The Supabase region is fixed, but Workers process requests at any edge location. — Owner: user. Block: pilot launch (S-07, S-08, S-09 with real data).
13. **Who checks the Ukrainian (and English) text before it reaches production?** Crisis instructions and the consent need a native reader, not only a machine translation. — Owner: user. Block: promoting S-18 to S-21 to production with Ukrainian switched on.
14. **In which languages do the crisis SMS and its YES/NO replies go out?** A Cyrillic SMS holds 70 characters per part instead of 160. — Owner: user. Block: S-07.
15. **Do the everyday-help slices reach production before the pilot, and with how many consent versions?** S-23, S-24, S-25 and S-26 each change the privacy notice, and a changed notice means a new consent version, which sends every resident through the consent page again. Before the pilot that costs almost nothing; after it starts, each new version interrupts every resident. — Owner: user. Block: promoting S-23 to S-26 to production (not planning). Default: one consent version per promotion, with all four on production before the pilot starts.
16. **Who reads content reports once real residents use the app, and how fast?** The operator is the product owner today; a help request from a vulnerable person should not wait days for a decision. — Owner: user. Block: pilot launch with S-24 on production.

## Parked

- **Live map of confirmed volunteers (FR-013)** — Why parked: nice-to-have; PRD §Non-Goals says the MVP ends at the operational list.
- **Ad-hoc search "skill X within Y km of Z" (FR-016)** — Why parked: nice-to-have, and it bypasses crisis mode (directory access without an incident).
- **In-product editing of the taxonomy and crisis matrix (FR-018)** — Why parked: nice-to-have; v1 matrix and weights are fixed and change only through a release.
- **Skill verification (diplomas, certificates)** — Why parked: PRD §Non-Goals; self-declaration and trust.
- **Payments for services** — Why parked: PRD §Non-Goals; volunteering only.
- **Open exchange board, chat between residents, public profiles, exchange of goods or food, wanted-skills list** — Why parked: PRD §Non-Goals, narrowed on 2026-11-28; everyday mode is the aggregated map, neighbour courses (FR-020) and help requests matched to skills (FR-024).
- **Organisation accounts with volunteer shifts, a council information page usable offline, a confirmed-identity badge** — Why parked: ideas from the Commu comparison of 2026-11-24 that no PRD requirement covers yet; organisations bear on the cold-start question (Open Roadmap Question 3).

## Milestone History

## Done

- **S-01: a signed-in resident can pick skills from the predefined taxonomy (medical, technical, logistics, language, military/reserve, tools/equipment) with a self-declared level of 1–3, and set an approximate location by postcode or map pin, in a Polish interface that works on a phone.** — Archived 2026-09-27 → `context/archive/2026-09-27-resident-skills-profile/`. Lesson: Public cache headers on routes that pass through the auth middleware.
- **S-15: when a resident sets their location by postcode, only the coarsened 500 m point and `location_source = 'postcode'` are stored; the typed postcode is discarded, and `/profil` shows "Ustawiono z kodu pocztowego" instead of the code.** — Archived 2026-09-27 → `context/archive/2026-09-27-profile-postcode-minimisation/`. Lesson: —.
- **S-02: the operator can grant a registered user the coordinator role; a coordinator sees a coordinator-only area that residents and anonymous visitors cannot open.** — Archived 2026-09-28 → `context/archive/2026-09-28-coordinator-role-grant/`. Lesson: —.
- **S-03: a coordinator can activate crisis mode by choosing the incident type, location and radius, and within 3 seconds sees residents matched to that crisis type, ranked by the weighted score (distance, skill match, skill level, availability confirmation), even when optional external services are down.** — Archived 2026-10-02 → `context/archive/2026-10-01-crisis-activation-ranked-list/`. Lesson: —.
- **S-04: a coordinator can deactivate crisis mode, and the app returns to everyday mode.** — Archived 2026-10-02 → `context/archive/2026-10-02-crisis-deactivation/`. Lesson: —.
- **S-06: a resident can add an optional phone number (hidden by default) and declare availability days and hours, shown to the coordinator as information only. A resident without a phone appears on the aggregated map but gets no alerts and no operational-list presence.** — Archived 2026-10-03 → `context/archive/2026-10-03-resident-phone-and-availability/`. Lesson: —.
- **S-09: a coordinator can deliberately reveal the contact details of everyone matched (break-glass: an emergency override of the default privacy rule, used when nobody has confirmed, for example because the mobile network is down). The reveal is recorded in an append-only audit trail.** — Archived 2026-10-04 → `context/archive/2026-10-04-break-glass-contact-reveal/`. Lesson: —.
- **S-10: a coordinator can ask for teams assembled from predefined templates (for example, an evacuation team is a medic, a physically strong person and a driver with a vehicle), built on the current ranking.** — Archived 2026-10-04 → `context/archive/2026-10-04-crisis-team-templates/`. Lesson: —.
- **S-14: a resident can unregister at any time. They disappear from searches, the map and alerts immediately, and their personal data is fully removed within 30 days.** — Archived 2026-10-04 → `context/archive/2026-10-04-unregister-and-erase/`. Lesson: —.
- **S-11: an anonymous visitor or a resident can see the density of skills in their area on a map, with no personal data.** — Archived 2026-10-05 → `context/archive/2026-10-05-public-skills-density-map/`. Lesson: —.
- **S-13: a resident can pause their availability without deleting the account, and resume it later.** — Archived 2026-10-06 → `context/archive/2026-10-06-pause-availability/`. Lesson: —.
- **S-12: a resident can choose which of their data is visible, and whether it is visible in everyday mode, crisis mode or both.** — Archived 2026-10-19 → `context/archive/2026-10-19-data-visibility-controls/`. Lesson: —.
- **S-05: a resident can sign up in Polish, verify their email, and give explicit consent to data processing, with the consent recorded in an audit trail that is not platform logs.** — Archived 2026-10-06 → `context/archive/2026-10-06-verified-sign-up-with-consent/`. Lesson: —.
- **S-17: a resident can offer a free course tied to one of their skills (title, description, duration); signed-in residents see the courses offered in their area, with no organiser name or contact and the place only as the 2 km square of the public map, and sign up in the app; the organiser sees how many people signed up and gives them the meeting place and time.** — Archived 2026-10-20 → `context/archive/2026-10-20-neighbour-courses/`. Lesson: —.
- **S-16: a resident with any email address can sign up on production, receive the Polish confirmation email from SkillNet's own sending domain, and confirm the account through the link, which signs them in and opens `/profil`.** — Archived 2026-10-25 → `context/archive/2026-10-06-email-delivery/`. Lesson: Supabase dashboard settings drift (production had `mailer_autoconfirm` back on true); verify auth config through the Management API, not memory.
- **S-18: a visitor can switch the interface between Polish, English and Ukrainian with a switcher in the header; the first visit follows the browser's language, the choice is remembered in a cookie, and the landing page, the public map, sign-in, sign-up, the confirmation pages and the error pages follow it, at the same addresses.** — Archived 2026-11-27 → `context/archive/2026-11-26-interface-language-switch/`. Lesson: —.
- **S-19: a signed-in resident can use `/profil`, `/kursy`, `/zgoda` and `/prywatnosc` in English or Ukrainian, with skill and category names, validation messages, dates and numbers in that language; the consent and the privacy policy carry a note that they are a courtesy translation and the Polish text is binding.** — Archived 2026-11-27 → `context/archive/2026-11-27-resident-area-translations/`. Lesson: —.
- **S-20: a coordinator can use the coordinator area and crisis mode (activation, ranked list, coverage, teams, contacts, ending a crisis) in English or Ukrainian, with crisis types, team templates and role names in that language.** — Archived 2026-11-28 → `context/archive/2026-11-27-coordinator-area-translations/`. Lesson: Astro drops the whitespace between two `{expr}` on separate lines; write `{" "}` when replacing literal text with expressions.
