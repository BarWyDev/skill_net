# Resident Phone and Availability — Plan Brief

> Full plan: `context/changes/resident-phone-and-availability/plan.md`

## What & Why

Roadmap S-06 (FR-004, FR-005). A resident can add an optional phone number that only they can see, and declare weekly availability that the coordinator sees as information only. The phone is the most sensitive field in the product, and S-07, S-08 and S-09 will read it. This slice builds the privilege boundary they inherit, before any crisis flow touches the number.

## Starting Point

Profiles hold only a coarsened location and skills, behind owner-only RLS, saved atomically by `save_my_profile`. The S-03 ranked list shows place, "Osoba #N", skills and distance, with no contact data. No phone or availability storage exists.

## Desired End State

On `/profil` a resident enters, changes or clears a Polish mobile number (stored as `+48XXXXXXXXX`) and ticks a 7-day × 4-slot availability grid, with "any time" and "clear" buttons. On an active crisis, each ranked row shows an "available now" badge (Warsaw clock, worked out when the page is viewed), a schedule summary and a "bez telefonu" marker. The coordinator never sees the number, and the ranking order is unchanged.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Phone storage | Separate `profile_contacts` table, owner-only RLS, column-level grants | One table is one privilege boundary, and the ranking's reads of `profiles` stay contact-free. |
| Phone format | Polish mobiles only, normalised to `+48XXXXXXXXX` | The pilot is one Polish municipality, and SMS (S-07) targets PL mobiles. |
| Ownership proof | Unverified now; `phone_verified_at` column the owner can't write; S-07 verifies | No SMS provider dependency now, and S-07 doesn't need a schema change. |
| Availability model | 28-slot weekly grid (days × noc/rano/popołudnie/wieczór), stored as a bitmask | Quick to fill on a phone, no midnight-crossing ranges, easy to test against "now". |
| Empty grid | "Nie podano", distinct from "outside hours"; "Zawsze" shortcut | The coordinator never mistakes silence for unavailability or for 24/7. |
| Coordinator view | Three-state badge computed when viewed, plus a summary | It answers "can they come now?" correctly even in a multi-day crisis. |
| No-phone rows | Stay ranked, marked "bez telefonu" | FR-004 removes them only from alerts and the operational list, not the directory. |
| Demo seed | Availability for all, `+48000…` phones for about 70% | Every badge state is demoable; that prefix is never assigned, so no real person can be reached. |
| Slot semantics | Labels carry hours; start inclusive, end exclusive; "pn noc" = Mon 00–06 | Removes the everyday-speech "Monday night" ambiguity. |

## Scope

**In scope:** phone and availability schema with its guarantees; save and read RPCs; `get_crisis_matches` display columns; seed; pgTAP and smoke tests; the `/profil` sections and no-phone hint; ranked-list badges and marker.

**Out of scope:** SMS/OTP verification (S-07), showing numbers to coordinators (S-08, S-09), visibility controls (S-12), foreign or landline numbers, fine-grained hours, any effect on score, ranking or eligibility, phone encryption at rest.

## Architecture / Approach

Guarantees live in Postgres, as in S-01 and S-03. `profile_contacts` holds the phone. Column grants plus a trigger stop an owner from faking `phone_verified_at`, and the mobile-prefix rule sits in the save RPC and zod. `profiles.availability_slots` is a 28-bit mask, and the SQL helper `availability_covers(mask, ts)` evaluates it on the Europe/Warsaw clock. `get_crisis_matches` (security definer) joins both and returns only `has_phone`, `availability_slots` and `available_now`. The TS module `src/lib/availability.ts` mirrors the encoding for the form and the summary.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Database | Table, column, helper, reworked RPCs, seed, pgTAP, types | An owner able to write `phone_verified_at`; leftover RPC overloads after a signature change |
| 2. Resident profile | Phone and grid sections on `/profil`, validation, smoke steps | Echoing the typed phone in errors or logs; grid usability at 375 px |
| 3. Coordinator ranked list | Badges, summary, "bez telefonu" marker, updated privacy note | Badges computed at view time read as part of the activation snapshot (needs clear copy) |

**Prerequisites:** S-01 (done); local Supabase running.
**Estimated effort:** about 2–3 sessions across 3 phases.

## Open Risks & Assumptions

- Until S-07, nothing proves a number belongs to the resident. That's harmless because nothing sends SMS yet.
- Signature changes mean the app and the migration must ship together. A Worker rollback alone would break profile saving, so recover by rolling forward.
- Numbers starting with `+48000` are assumed never assignable in the Polish numbering plan.

## Success Criteria (Summary)

- A resident can save, see and clear their own phone and availability. Nobody else can read the number, as the pgTAP RLS and grant tests show.
- A coordinator sees for every ranked row whether the person declares availability now and whether they have a phone, with no number on the page.
- Ranking order and eligibility are identical to before.
