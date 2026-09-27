# Profile Postcode Minimisation — Plan Brief

> Full plan: `context/changes/profile-postcode-minimisation/plan.md`

## What & Why

When a resident sets their location by postcode, SkillNet stores only the coarsened 500 m point and `location_source = 'postcode'`, and never the typed code. 981 Polish postcodes cover a single address, and 3,217 cover 5 or fewer, so a stored code can identify a building. S-03's security-definer ranking RPC would be the first reader able to see other residents' rows, so this must land before S-03 (S-01 review F1, Fix A).

## Starting Point

S-01 stores `profiles.postcode`, and two table checks require it. `get_my_profile` returns it, and `/profil` pre-fills the postcode field from it. The `profiles_resolve_and_coarsen` trigger uses the column as its input, which is what makes every write path resolve a postcode through the local `postcodes` table.

## Desired End State

Every `profiles.postcode` is null, enforced by `check (postcode is null)`. `get_my_profile` and the `/profil` HTML never contain a postcode. A postcode-set resident sees "Ustawiono z kodu pocztowego" and can edit only their skills and save without losing their location. Typing into the empty field and clearing it again goes back to the stored location.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Column strategy | Keep `postcode` as a write-only input; the trigger resolves it, then nulls it; `check (postcode is null)` | Keeps every write path (RPC and direct PATCH) resolving through `postcodes`, and makes "never stored" a database invariant. |
| Skills-only re-save | Postcode source with no code = keep the stored location | Editing skills should never touch the location; the trigger keeps `old.location` and ignores any supplied point. |
| No prior postcode location | Raise `postcode_required` | Nothing to keep, so the resident must type a code. |
| Clearing the field | Revert to the location loaded with the page | A stray keystroke must not silently make a resident unmatchable. |
| Existing production rows | Null the postcode, keep point and source | The point is already coarsened; residents stay matchable. |
| Upsert shape | `insert (user_id) on conflict do nothing`, then `UPDATE` | `ON CONFLICT DO UPDATE` sees post-trigger `excluded.*`, which would drop a newly typed code. |
| Proof | pgTAP cases, plus a smoke step that asserts `/profil` HTML excludes `31-001` | Proves it both in the database and in what the browser actually receives. |

## Scope

**In scope:**

- New migration: trigger, checks, data update, `save_my_profile`, `get_my_profile`
- pgTAP updates
- `MyProfileDTO` and read service
- Form validation "keep" rule
- `LocationPicker` status line and revert on clear
- 3 smoke steps

**Out of scope:**

- A "Usuń lokalizację" control. After this change the UI has no way to remove a location.
- Dropping the column, or making profile writes RPC-only
- `postcodes` visibility and `address_count`
- Centroid outliers (F3)
- Scrubbing backups

## Architecture / Approach

Everything is enforced in the database. The trigger is the single place that turns a postcode into a point: resolve it, or keep the old point, or raise, then always null the code. The RPC always writes through `UPDATE`, so the trigger can see `old`. The app only follows the contract: an empty code with a postcode source means "keep", and nothing reads a postcode back.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Schema: postcode never stored | Migration and pgTAP proving the invariant and the keep rule | Upsert or trigger interaction silently ignoring a new code (covered by named cases) |
| 2. App: form, island, smoke | DTO, validation, status line, revert on clear, 3 smoke steps | The island's revert logic fighting the "last edit wins" pin and postcode flow |

**Prerequisites:** S-01 merged (done). Local Supabase running for `test:db`, `db:types` and smoke.
**Estimated effort:** about 1 session across 2 phases.

## Open Risks & Assumptions

- **Deploy ordering.** Nothing applies migrations automatically. Merge the code first, then a human runs `npx supabase db push`. The reverse order breaks `/profil`, because the old zod schema requires the `postcode` key.
- Postcodes stored before the migration persist in Supabase backups and WAL until retention expires. Code can't fix that. Accepted.
- No UI path removes a location after this change. Deletion is left to S-14 or a follow-up.

## Success Criteria (Summary)

- No `profiles` row, RPC response or `/profil` page ever contains a resident's postcode.
- Postcode-set residents keep their location and matchability across skills-only edits.
- `npm run test:db` and `npm run smoke` pass locally and in CI.
