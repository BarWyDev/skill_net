# Profile Postcode Minimisation Implementation Plan

## Overview

Roadmap slice S-15 (FR-003, the "exact location hidden" guardrail), from S-01 implementation review F1 (Fix A). When a resident sets their location by postcode, the database keeps only the coarsened 500 m point and `location_source = 'postcode'`, and it discards the typed postcode. `/profil` shows "Ustawiono z kodu pocztowego" instead of the code. This must land before S-03, whose security-definer ranking RPC will be the first reader that can see other residents' rows.

## Current State Analysis

- `profiles.postcode` stores the typed code whenever `location_source = 'postcode'`, and two checks require it (`supabase/migrations/20260927120000_resident_profile_schema.sql:41,47-48`). 981 of the 20,561 postcodes cover a single PRG address, and 3,217 cover 5 or fewer. `public.postcodes` is readable by anon, with raw centroids and `address_count`. So a stored postcode can point to a building.
- The `profiles_resolve_and_coarsen` trigger (`:95-130`) reads `new.postcode` as its input and resolves it through `public.postcodes`. This is what makes every write path, including a direct PostgREST PATCH that RLS allows, turn a postcode into a table centroid.
- `save_my_profile` (`:186-226`) upserts with `INSERT … ON CONFLICT DO UPDATE`, which writes `postcode = excluded.postcode`. `get_my_profile` (`:236-237`) returns a `postcode` key.
- App side:
  - `MyProfileDTO.postcode` (`src/types.ts:24`) and the zod read schema (`src/lib/services/profile.ts:46,62`) carry the postcode back to the page.
  - `ProfileForm` pre-fills the field from it (`src/components/profile/ProfileForm.tsx:20`).
  - The island props are serialised into the `/profil` HTML.
- The form validation requires a well-formed code whenever `location_source = 'postcode'`. It checks this on the client (`ProfileForm.tsx:49`) and on the server (`src/lib/validation/profile.ts:41-48`).
- Clearing the postcode field sets `source: null` (`src/components/profile/LocationPicker.tsx:75-77`), and saving then removes the location.
- pgTAP cases `postcode_resolves` and `pin_clears_postcode` (`supabase/tests/resident_profile_test.sql:176-209`) assert the old behaviour. `select plan(30)` is at `:8`.

## Desired End State

- `profiles.postcode` is null on every row, enforced by `check (postcode is null)`. The column is only a write-time input: the trigger resolves it, then nulls it. No reader, whether RLS owner, security definer, backup taken after the migration or admin, can see a typed postcode.
- `get_my_profile()` has no `postcode` key. `/profil` never contains the resident's postcode.
- A resident who set their location by postcode can reload `/profil`, change only skills and save. Their location and `location_source = 'postcode'` stay unchanged.
- Typing into the postcode field and clearing it again goes back to the location loaded with the page. It never removes the location.
- Existing production rows keep their coarsened point and source. Only the postcode is nulled.

Verify with `npm run test:db`, `npm run smoke` against local Supabase, and a manual pass through `/profil`.

### Key Discoveries:

- The trigger is the only enforcement point for "a postcode location comes from the `postcodes` table". Keeping `postcode` as a write-only input preserves it for every write path (`20260927120000_resident_profile_schema.sql:103-107`).
- `ON CONFLICT DO UPDATE` runs the `BEFORE INSERT` trigger on the proposed row first, so `excluded.*` holds post-trigger values (`:205-218`). See Critical Implementation Details.
- `coarsen_point` is idempotent (`:67-69`), so keeping `old.location` and passing it through coarsening again is safe.
- The smoke script's `request()` returns only status and location (`scripts/smoke.mjs:26-39`). A body assertion needs a small extension.
- CI's smoke job runs against a local Supabase with all migrations applied, so the real PRG postcode `31-001` exists there. `00-950` does not (review F4).
- Lesson "Public cache headers on routes that pass through the auth middleware" does not apply: this change touches no `Cache-Control`.

## What We're NOT Doing

- A "Usuń lokalizację" control. Removing a location entirely stays out of this change. After it, clearing the field reverts instead of removing, so there is no UI path to remove a location until S-14 (erasure) or a follow-up adds one.
- Dropping the column, or moving profile writes to a security-definer RPC. We chose the write-only column.
- Changing `public.postcodes` visibility or `address_count`. That is reference data with no link to a person.
- Scrubbing old postcodes from Supabase backups or WAL. See Open Risks in the brief.
- Touching `/api/kody-pocztowe/[kod]`, its preview flow, or the centroid outliers (review F3).
- Editing the archived S-01 plan or its already applied migration. The new migration supersedes the header claim.

## Implementation Approach

1. **Schema first, proven by pgTAP.** One new migration makes the invariant true in the database, then migrates existing rows. The trigger keeps the old point when a postcode-source write carries no code, so "keep unchanged" works for the RPC and for direct PATCHes alike.
2. **App follows the contract.** An empty postcode with `location_source = postcode` means "keep". The DTO loses `postcode`. The island shows a status line instead of the code and goes back to the loaded location when the field is cleared. The smoke test proves the page never echoes the code.

## Critical Implementation Details

- **Upsert ordering.** With the new trigger, `INSERT … ON CONFLICT DO UPDATE` breaks in two ways:
  - The `BEFORE INSERT` trigger nulls `postcode` on the proposed row, so the update branch receives `excluded.postcode = null` and treats a newly typed code as "keep the old point".
  - A keep-save raises in the insert trigger before the conflict is detected.

  `save_my_profile` must instead run `insert (user_id) values (uid) on conflict do nothing` (source null, so the trigger passes), then a plain `UPDATE`. Every location write then goes through the update trigger, where `old` is available. A raise rolls back the empty insert too.
- **Migration order.** The data update has to run under the new trigger, after the old checks are dropped and before the new check is added:
  1. drop the checks;
  2. replace the trigger;
  3. `update … set postcode = null where postcode is not null`;
  4. add the check.

  The trigger's keep branch preserves each row's point. `updated_at` bumps on those rows, which is harmless.
- **Deploy ordering: code first, then `db push`.** Nothing applies Supabase migrations automatically. The current production code parses `get_my_profile` with a zod schema that *requires* the `postcode` key (`src/lib/services/profile.ts:46`), so pushing the migration first would break `/profil` for everyone. The new code works against the old database: zod `z.object` strips the extra key. The only exception is a keep-save, which the old trigger rejects with the `unknown_postcode` message. So:
  1. merge the PR;
  2. wait for Workers Builds to deploy;
  3. run `npx supabase db push --dry-run`, then `npx supabase db push`, straight away.

  This is a human step.

## Phase 1: Schema — postcode never stored

### Overview

Make "no stored postcode" a database invariant, keep every write path resolving through `public.postcodes`, add the "keep unchanged" rule, and migrate existing rows.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/20260927150000_profile_postcode_never_stored.sql`

**Intent**: Turn `profiles.postcode` into a write-only input and stop every function from writing or returning it. The header comment states the corrected invariant, which supersedes the S-01 migration's header.

**Contract**, in this order:

- Drop constraints `profiles_postcode_source_has_postcode` and `profiles_pin_source_has_no_postcode`.
- `create or replace function public.profiles_resolve_and_coarsen()`. When `new.location_source = 'postcode'`:
  - if `new.postcode` is not null, resolve it as today (raise `unknown_postcode` if not found);
  - else if `TG_OP = 'UPDATE'` and `old.location_source = 'postcode'`, set `new.location := old.location`, ignoring any supplied location so a direct PATCH cannot relabel an arbitrary point as `postcode`;
  - else raise `postcode_required`.

  In every branch, `new.postcode := null` before returning. The pin, null-source, coarsening and `updated_at` logic stays unchanged.
- `update public.profiles set postcode = null where postcode is not null;`
- Add `constraint profiles_postcode_never_stored check (postcode is null)`. Add `comment on column public.profiles.postcode` explaining it is a write-only input that the trigger resolves and discards.
- `create or replace function public.save_my_profile(...)`, same signature and grants: `insert … (user_id) … on conflict (user_id) do nothing`, then `update public.profiles set location_source, postcode, location … where user_id = v_user_id`, then the existing skill replace.
- `create or replace function public.get_my_profile()`: same shape without the `postcode` key.

#### 2. pgTAP cases

**File**: `supabase/tests/resident_profile_test.sql`

**Intent**: Prove the invariant and the keep rule at the database level. Update the plan count.

**Contract**. Named cases:

- `postcode_resolves` (changed): stores the coarsened centroid, and `postcode is null`.
- `postcode_not_returned`: `get_my_profile() ? 'postcode'` is false.
- `resave_keeps_location`: after a postcode save, `save_my_profile('postcode', null, null, null, …)` leaves `location` and `location_source` unchanged and replaces the skills.
- `patch_cannot_move_postcode_location`: a direct `update profiles set location = <pin_input>` while the source is `postcode` and no code is sent leaves `location` unchanged.
- `patch_with_postcode_resolves`: a direct `update profiles set postcode = '00-950', location_source = 'postcode'` stores the centroid and a null postcode.
- `keep_without_prior_raises`: a user with no profile, or with a pin location, calling `save_my_profile('postcode', null, …)` raises `postcode_required`, and the previous state is intact.
- `postcode_never_stored_check`: `col_has_check('public', 'profiles', 'postcode')`.
- `pin_clears_postcode`: kept, still asserts null.

#### 3. Generated types

**File**: `src/db/database.types.ts`

**Intent**: Regenerate with `npm run db:types` against local Supabase. No functional diff is expected, because the column and RPC signatures are unchanged. Commit whatever it produces.

### Success Criteria:

#### Automated Verification:

- Migrations apply cleanly on a fresh local database: `npx supabase db reset`
- pgTAP passes, including the new named cases: `npm run test:db`
- Type check passes: `npx astro check`

#### Manual Verification:

- In Studio (http://localhost:54323), `select count(*) from profiles where postcode is not null` returns 0 after saving a profile by postcode.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: App — form, island, smoke

### Overview

Make the form and page follow the new contract: no postcode is read back, an empty code with a postcode source means "keep", clearing the field goes back to the loaded location, and the smoke test proves the page never echoes the code.

### Changes Required:

#### 1. Types and read service

**File**: `src/types.ts`, `src/lib/services/profile.ts`

**Intent**: Remove `postcode` from `MyProfileDTO` and from `myProfileSchema` and `getMyProfile`. Map the new `postcode_required` DB error to "Podaj kod pocztowy w formacie 00-000." in `DB_ERROR_MESSAGES`.

**Contract**: `MyProfileDTO` = `{ locationSource, lat, lng, skills, matchable }`. In `SaveProfileInput.postcode`, null together with `locationSource: "postcode"` means "keep the stored location".

#### 2. Form validation

**File**: `src/lib/validation/profile.ts`

**Intent**: In the `postcode` branch, accept an empty or whitespace postcode as `null` ("keep"). Normalise a non-empty value or reject it with the existing Polish message.

**Contract**: `parseProfileForm` with `location_source=postcode&postcode=` returns `{ locationSource: "postcode", postcode: null, lat: null, lng: null, … }`.

#### 3. Profile islands

**File**: `src/components/profile/ProfileForm.tsx`, `src/components/profile/LocationPicker.tsx`

**Intent**:

- The postcode field always starts empty. `LocationPicker` receives the location loaded with the page, as a new `initial: LocationValue` prop.
- When the field is empty and `source === "postcode"`, the status line shows "Ustawiono z kodu pocztowego" in a neutral colour, not the error colour.
- Clearing the field restores `initial`, including its point and a map recentre, instead of setting `source: null`.
- The client submit check allows an empty postcode when the source is `postcode`, and still rejects a non-empty malformed code.

**Contract**: `LocationPicker` props = `{ value, initial, onChange }`. An empty field never yields `source: null` unless `initial.source` is null.

#### 4. Smoke steps

**File**: `scripts/smoke.mjs`

**Intent**: Prove the end-to-end promise over HTTP.

**Contract**:

- `request()` also returns the response `body` text.
- A step may set `bodyExcludes: "<text>"`.
- New write steps after "profile save accepts pin and skill":
  1. "profile save accepts postcode": `location_source=postcode&postcode=31-001&skill=elektryk:2` → `302 /profil?zapisano=1` (exact).
  2. "profil does not echo the postcode": `GET /profil` → 200, body excludes `31-001`.
  3. "profile re-save keeps postcode location": `location_source=postcode&postcode=&skill=elektryk:3` → `302 /profil?zapisano=1` (exact).

  The existing "signin redirects complete user home" step then also proves the kept location still counts as matchable.
- `SMOKE_READONLY` steps are unchanged.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Type check passes: `npx astro check`
- Build succeeds: `npm run build`
- Smoke passes against local Supabase, including the 3 new steps: `npm run smoke` (dev or preview server pointed at local Supabase)

#### Manual Verification:

- On `/profil`, save by postcode `31-001`. After the redirect, the field is empty, the status shows "Ustawiono z kodu pocztowego", the map shows the coarsened point, and view-source contains no `31-001`.
- Change only a skill level and save. The location and status are unchanged, and the page shows "Profil kompletny".
- Type `3` into the empty field, then delete it. The status and point return to the stored location. Saving keeps it.
- Type a new valid postcode and save. The point moves to the new centroid.
- Click the map to set a pin and save. The status line no longer shows "Ustawiono z kodu pocztowego".
- Works at phone width.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- No unit runner exists yet (Module 3). The database guarantees are covered by the pgTAP cases named in Phase 1.

### Integration Tests:

- Smoke: save by postcode, the page never echoes the code, re-save keeps the location, and a complete profile still signs in to `/`.

### Manual Testing Steps:

1. Save by postcode, reload, and confirm the field is empty with the status line showing and no code in the page source.
2. Re-save with only skills changed, and confirm the location is kept.
3. Type then clear the field, and confirm it goes back to the stored location, not a removed one.
4. Switch to a pin, then back to a new postcode, and confirm last edit wins each time.

## Performance Considerations

None. The trigger does the same single primary-key lookup, or none in the keep branch.

## Migration Notes

- On production, the migration nulls postcodes on existing rows and keeps their points. A human pushes it with `npx supabase db push` *after* the code deploy (see Critical Implementation Details). Rolling back the Worker does not restore postcodes, and should not. A Worker rolled back to the S-01 build would break `/profil` against the new schema, so roll forward instead.
- The migration is forward-only. Reverting it would need a new migration that drops `profiles_postcode_never_stored`. The discarded codes cannot be recovered, which is intended.

## References

- Review finding: `context/archive/2026-09-27-resident-skills-profile/reviews/impl-review.md` (F1)
- Queued fix: `context/archive/2026-09-27-resident-skills-profile/follow-ups/review-fixes.md`
- S-01 schema: `supabase/migrations/20260927120000_resident_profile_schema.sql:39-130,186-253`
- Roadmap: `context/foundation/roadmap.md` (S-15)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schema — postcode never stored

#### Automated

- [x] 1.1 Migrations apply cleanly on a fresh local database — 8dec4cf
- [x] 1.2 pgTAP passes, including the new named cases — 8dec4cf
- [x] 1.3 Type check passes — 8dec4cf

#### Manual

- [x] 1.4 No profile row holds a postcode after a postcode save — 8dec4cf

### Phase 2: App — form, island, smoke

#### Automated

- [x] 2.1 Lint passes — d5c1cf9
- [x] 2.2 Type check passes — d5c1cf9
- [x] 2.3 Build succeeds — d5c1cf9
- [x] 2.4 Smoke passes against local Supabase, including the 3 new steps — d5c1cf9

#### Manual

- [x] 2.5 Postcode save shows status line, coarsened point, no code in page source — d5c1cf9
- [x] 2.6 Skills-only re-save keeps the location — d5c1cf9
- [x] 2.7 Typing then clearing the field reverts to the stored location — d5c1cf9
- [x] 2.8 New postcode moves the point — d5c1cf9
- [x] 2.9 Pin save replaces the postcode status — d5c1cf9
- [x] 2.10 Works at phone width — d5c1cf9
