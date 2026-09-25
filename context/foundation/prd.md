---
project: "SkillNet"
version: 1
status: draft
created: 2026-09-22
context_type: greenfield
product_type: web-app
target_scale:
  users: large
  qps: null                  # TODO: target_scale.qps — see Open Questions
  data_volume: null          # TODO: target_scale.data_volume — see Open Questions
timeline_budget:
  mvp_weeks: null            # TODO: timeline_budget.mvp_weeks — see Open Questions
  hard_deadline: null
  after_hours_only: true
---

# PRD: SkillNet (Sieć Sąsiedzka)

## Vision & Problem Statement

In a crisis (flood, power outage, security threat), the most valuable local resource is people nearby with specific skills: a paramedic, an electrician, a driver, a reservist, someone with a first-aid course, or someone who owns a chainsaw or a generator. Today that knowledge is completely scattered. Neither the local council nor the neighbours know who can do what or where they live. Coordination starts from zero only once the crisis has begun, through Facebook groups, phone calls to friends and chaotic social-media posts. That costs valuable hours, and people with the right skills don't reach the places where they're needed most. A second, parallel problem is weak social ties in cities: people don't know their neighbours or who to turn to for everyday help.

The insight: (1) the skills directory has to exist **before** the crisis; today coordination only starts once the crisis hits. (2) Everyday use (neighbour-to-neighbour exchange) is what keeps the data fresh; without an everyday reason to open the app, the directory goes stale and is useless in a crisis. (3) The skills map only makes sense at local scale (municipality or neighbourhood), not national.

## User & Persona

**Primary persona: council crisis coordinator.** A staff member at the municipal office, the local social-welfare office (OPS) or crisis management. In a crisis they need a ready list of volunteers with the skills required, sorted by distance from the incident, instead of starting coordination from zero.

### Secondary persona

- **Volunteer resident**: a person with specific skills (paramedic, electrician, rescuer, reservist, truck driver) who wants to help neighbours and feel part of a community. The supply side of the directory.

Other personas considered during shaping (new resident, resident looking for help, uniformed services / civil defence, training organiser) are outside the primary scope.

The MVP scope covers **both** modes (dual-use: everyday + crisis), even though the primary persona serves the crisis mode.

## Success Criteria

### Primary

- A coordinator runs a simulated crisis scenario on real registrations from one area and gets ≥ N matched people.

# TODO: value of N in the Primary criterion — see Open Questions

### Secondary

- A real coordinator says they would use the tool in a real incident.

### Guardrails

- A resident's exact location and phone number are not visible to anyone outside an active crisis mode and outside the coordinator role.
- A user can unregister at any time, and their data disappears from searches.
- Crisis-type → skills matching works even when optional external services fail.
- A resident only receives alerts that match their skills and area (no notification spam).

## User Stories

### US-01: Coordinator gets a team of volunteers for a power outage

- **Given** a coordinator with the coordinator role, and registered residents whose skills match the incident within the radius
- **When** they activate crisis mode "power outage" at location X with a 5 km radius
- **Then** they see a ranked list of people with electrician/generator skills; those people receive a YES/NO notification; people who confirm land on the operational list

#### Acceptance Criteria

- From crisis activation to the list of people who confirmed availability: < 5 minutes.

# TODO: user stories for the resident-side flows (sign-up, profile, visibility, pause/unregister) and for the operator-side flows — see Open Questions

## Functional Requirements

### Registration & profile

- FR-001: Resident can create an account with email/SMS verification. Priority: must-have
  > Socrates: Counter-arguments considered: "double verification kills sign-ups" and "SMS verification costs money". Resolution: no counter-argument; stands as written.
- FR-002: Resident can pick their skills from a predefined taxonomy (medical, technical, logistics, language, military/reserve, tools/equipment) and self-declare a level for each skill on a 1–3 scale (basic course / practitioner / professional). Priority: must-have
  > Socrates: Counter-argument accepted: "free-text 'other' can't be matched; the crisis matrix works on tags, so the field only creates the illusion of being registered." Resolution: 'other' field dropped from v1; taxonomy only.
- FR-003: Resident can set an approximate location (postcode or map pin). Priority: must-have
  > Socrates: Counter-arguments considered: "postcode too imprecise for a 2–5 km radius" and "home location ≠ location in a crisis". Resolution: no counter-argument; stands as written.
- FR-004: Resident can optionally provide a phone number, hidden by default; a resident without a phone number appears on the aggregated map but receives no crisis alerts and does not appear on the operational list. Priority: must-have
  > Socrates: Counter-argument accepted: "without a phone number, SMS alerts (FR-011) and the operational list (FR-012) don't work." Resolution: phone stays optional; no phone = no alerts and no operational-list presence.
- FR-005: Resident can declare availability (days/hours) as information shown to the coordinator; it does not exclude anyone from matching. Priority: must-have
  > Socrates: Counter-argument accepted: "crises don't follow schedules; the real signal is the YES/NO confirmation." Resolution: kept as information, not a filter.
- FR-006: Resident can choose which of their data is visible, and in which mode. Priority: must-have
  > Socrates: Counter-arguments considered: "per-field × per-mode granularity is over the top" and "hidden skills undermine matching". Resolution: no counter-argument; stands as written.
- FR-007: Resident can unregister at any time, and their data disappears from searches. Priority: must-have
  > Socrates: Counter-argument accepted: "pausing is enough, not deleting; it keeps the directory filled." Resolution: deletion kept (guardrail); pausing added as a separate FR-019.
- FR-019: Resident can pause their availability without deleting the account. Priority: must-have
  > Socrates: Counter-arguments considered: "pauses get forgotten; dead profiles unless it expires" and "pausing after a YES during an active crisis". Resolution: no counter-argument; stands as written.

### Everyday mode

- FR-008: Anonymous visitor and resident can see the aggregated skills-density map for their area, without personal data. Priority: must-have
  > Socrates: Counter-arguments considered: "at low density the map reveals individual locations", "a public map = a public gap map", "looking at a map isn't an everyday reason to update your profile". Resolution: no counter-argument; stands as written.

### Crisis mode

- FR-009: Coordinator can activate crisis mode by choosing the incident type, location and radius. Priority: must-have
  > Socrates: Counter-arguments considered: "one mode = one incident; parallel crises" and "manual activation is a single point of failure". Resolution: no counter-argument; stands as written.
- FR-010: Coordinator can get a list of people matched to the incident type, ranked by weighted score. Priority: must-have
  > Socrates: Counter-arguments considered: "weights without incident data are guesswork" and "an opaque score undermines the coordinator's trust". Resolution: no counter-argument; stands as written.
- FR-011: Matched resident can receive an SMS/push notification about the crisis and confirm YES/NO. Priority: must-have
  > Socrates: Counter-arguments considered: "most expensive integration in the MVP" and "mobile networks go down in a crisis". Resolution: no counter-argument; stands as written.
- FR-012: Coordinator can see the operational list of people who confirmed availability, with their contact details; the coordinator can also deliberately reveal the contact details of all matched people (break-glass), and that action is logged. Priority: must-have
  > Socrates: Counter-argument accepted: "contact details only after YES; if nobody replies (network, night), the coordinator has no numbers at all." Resolution: break-glass for the coordinator: by default only confirmed people's contact details, with a deliberate, logged reveal of everyone matched.
- FR-013: Coordinator can see people who confirmed availability on a live map. Priority: nice-to-have
  > Socrates: Counter-arguments considered: "declared location ≠ current location" and "tracking breaks the privacy promise". Resolution: no counter-argument; stands as written (nice-to-have).
- FR-014: Coordinator can ask for teams to be assembled from predefined templates (e.g. evacuation team: medic + physically strong person + driver with vehicle). Priority: must-have
  > Socrates: Counter-arguments considered: "coordinators assemble teams themselves" and "a small pilot rarely fills a full template". Resolution: no counter-argument; stands as written.
- FR-015: Coordinator can deactivate crisis mode (return to everyday mode). Priority: must-have
  > Socrates: Counter-arguments considered: "a forgotten crisis lasts forever; auto-expiry" and "revealed contact details must be hidden again after deactivation". Resolution: no counter-argument; stands as written.
- FR-016: Coordinator can run an ad-hoc search "skill X within Y km of location Z". Priority: nice-to-have
  > Socrates: Counter-arguments considered: "bypasses crisis mode (access to the directory without an incident)" and "duplicates FR-009/010". Resolution: no counter-argument; stands as written (nice-to-have).

### Administration

- FR-017: Operator can assign the coordinator role. Priority: must-have
  > Socrates: Counter-arguments considered: "the operator is the bottleneck" and "no vetting = risk of personal data leaking". Resolution: no counter-argument; stands as written.
- FR-018: Operator can manage the skills taxonomy and the crisis-type × skills matrix from within the product. Priority: nice-to-have
  > Socrates: Counter-arguments considered: "changes break existing profiles" and "a fixed list is enough for a long time". Resolution: no counter-argument; stands as written (nice-to-have).

Note: with FR-013 nice-to-have, the live map is outside the binding MVP. FR-019 is numbered out of document order because it was added during the Socratic round.

## Non-Functional Requirements

- After activating crisis mode, the coordinator sees the ranked list of matched people within ≤ 3 seconds.
- The ranked list of matched people is available even when optional external services are unavailable.
- The interface is in Polish and usable on both a phone and a computer.
- A resident gives explicit consent to the processing of their data at sign-up; after unregistering, their data disappears from searches immediately and personal data is fully removed within ≤ 30 days.

## Business Logic

For a declared incident (type, location, radius), the app selects residents whose skills match that crisis type's needs and ranks them by a score that combines distance, skill match and availability, with weights that depend on the crisis type.

Inputs: the incident declared by the coordinator (crisis type, epicentre location, radius) and each resident's profile (skills from the taxonomy with a self-declared level of 1–3, approximate location, availability confirmation after the alert). Each crisis type has priority and supporting skills — the crisis-type × skills matrix covering flood, power outage, mass-casualty incident, fire, heat/cold, and cyberattack/blackout.

The score has four components: distance (closer = higher), skill match (priority skill > supporting skill), availability confirmation (YES raises the position), and skill level (1–3). The weights depend on the crisis type (e.g. in a flood, distance dominates; in a mass-casualty incident, medical skills dominate). In v1, the matrix and the weights are fixed, set by the product owner, and not editable from inside the product (FR-018, which would make them editable, is nice-to-have).

The coordinator encounters the rule right after activating crisis mode, as a ranked list of people; the ranking updates as people confirm availability. Team assembly from templates (FR-014) builds on this ranking.

## Access Control

Multi-user model with roles. Sign-up and sign-in by login with email/SMS verification.

| Role | How they get it | Capabilities |
| --- | --- | --- |
| Anonymous visitor | No login | Sees the public, aggregated skills map without personal data |
| Resident / volunteer | Sign-up with email/SMS verification | Registers skills, location and availability; controls the visibility of their data; can unregister at any time; sees the aggregated skills map in their area without personal data |
| Coordinator | Regular account; role assigned manually by the operator | Activates and deactivates crisis mode; searches for people by skill and distance; sees the contact details of people who confirmed availability |
| Operator / admin | Product owner | Assigns the coordinator role; manages the skills taxonomy |

No formal institutional verification of coordinators in the MVP (manual role assignment is enough for pilots).

# TODO: what an unauthenticated visitor sees when they hit a gated route (e.g. a crisis-mode URL) — see Open Questions

## Non-Goals

- **No skill verification (diplomas, certificates)** — self-declaration and trust; verification raises the entry barrier and adds complexity.
- **No payments for services** — cashless exchange and volunteering; avoids financial and tax regulation.
- **No everyday exchange board or wanted-skills list** — everyday mode in v1 is the aggregated skills map only. This was the one scope cut accepted during shaping.
- **No live map of confirmed volunteers in the binding MVP** — FR-013 is nice-to-have; the MVP ends at the operational list.

# TODO: the user's additional non-goals (left as free text in the shaping notes, never filled in) — see Open Questions

## Open Questions

1. **What is `timeline_budget.mvp_weeks`?** The user accepted a multi-week MVP (full flow estimated at 6+ weeks) but did not give a number. Owner: user. Block: no, but the downstream tech-stack step will ask.
2. **What is N in the Primary success criterion (minimum matched people in the pilot scenario)?** Owner: user. Block: yes for measuring success; the Primary criterion is unfalsifiable until N is set.
3. **How is cold start solved?** The coordinator only gets value once the directory holds residents. Options considered during shaping: a pilot in one neighbourhood, demo data, a partner organisation. Undecided. Owner: user.
4. **What are `target_scale.qps` and `target_scale.data_volume`?** Only `users: large` was captured. Crisis mode is bursty by nature (a single activation fans out to every matched resident at once), so the ballpark matters. Owner: user.
5. **Which user stories cover the resident and operator flows?** Only US-01 (coordinator, power outage) was written. The resident sign-up / profile / visibility / pause-and-unregister flow and the operator role-assignment flow have FRs but no Given/When/Then. Owner: user.
6. **What does an unauthenticated visitor see when they hit a gated route?** The role matrix defines capabilities but not the unauthenticated-access behaviour. Owner: user.
7. **What are the user's additional non-goals?** The shaping notes left a free-text non-goals slot unfilled. Owner: user.
8. **The shaping quality cross-check never ran** (`quality_check_status: pending`, `current_phase: 6` of 8). Gaps that a completed cross-check would have surfaced are not represented here. Owner: user — consider re-entering `/10x-shape` to finish phases 7–8 before locking this PRD.
9. **Parallel incidents, alert limits, and per-municipality matrices are unresolved at scale.** The shaping scale probe (~1M residents, many municipalities) named three rule extensions — reserving a person matched to two simultaneous incidents, capping how many top-ranked people get alerted, and a per-municipality crisis × skills matrix — none of which are in the v1 rule. Owner: user. Block: no for the pilot; yes before multi-municipality rollout.
