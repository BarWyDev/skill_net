# Crisis Deactivation Implementation Plan

## Overview

A coordinator can end an active crisis (roadmap S-04, FR-015). Ending is one database call that marks the crisis `ended`, records who ended it and when, and deletes its ranking snapshot, so after a crisis no record links a resident to the incident. The crisis keeps only its summary (type, radius, dates, number of matched people). The panel shows how long each active crisis has been running and lists the most recently ended ones.

## Current State Analysis

- `public.crises` already has `status text check (status in ('active', 'ended'))` and `ended_at timestamptz`, but nothing writes them (`supabase/migrations/20261001120000_crisis_matching.sql:40-50`).
- Clients have no write privileges on `crises` and no privileges at all on `crisis_matches` (same file, "Privileges" section). Every write goes through a security-definer RPC that checks `public.is_coordinator()` (pattern: `activate_crisis`).
- `activated_by` is a bare `uuid` with no FK to `auth.users`, on purpose: the record outlives the account (same file, comment above `create table public.crises`).
- `get_crisis_matches` returns the rows of `crisis_matches` for a crisis; with the rows deleted it returns an empty set.
- The service layer is `src/lib/services/crisis.ts` (`CRISIS_COLUMNS`, `toCrisisDTO`, `listActiveCrises`, `getCrisis`, DB-error → Polish message map).
- The activation endpoint `src/pages/api/koordynator/kryzysy.ts` is the pattern for the new endpoint: form POST, redirects with `?error=`, no JSON.
- Middleware gates `/koordynator` and `/api/koordynator` to coordinators and sets `Cache-Control: private, no-store` (`src/middleware.ts:5-7,43`).
- The panel (`src/pages/koordynator/index.astro`) lists active crises only; the crisis page (`src/pages/koordynator/kryzys/[id].astro`) always renders the ranked list.
- Multiple crises can be active at once, so "returning to everyday mode" is per crisis, not a global switch.

## Desired End State

- On an active crisis page a coordinator clicks "Zakończ kryzys", sees a native `<dialog>` with the crisis summary and a warning that the list of people will be deleted, confirms, and lands on `/koordynator?ended=1` with a success message.
- After ending: `crises.status = 'ended'`, `ended_at` and `ended_by` set, zero `crisis_matches` rows for that crisis, `match_count` unchanged.
- Any coordinator can end any active crisis. Ending an already-ended crisis is a no-op that reports "Ten kryzys został już zakończony."
- The panel shows each active crisis's age ("aktywny od 3 godz.") and highlights crises active for more than 24 h; below them a "Zakończone" section lists the last 10 ended crises (type, radius, activated / ended times, number of people).
- The page of an ended crisis shows only the summary and an "Zakończony" label, with no list and no end button.

### Key Discoveries:

- `crises.ended_at` already exists; only `ended_by` is new (`20261001120000_crisis_matching.sql:49`).
- A crisis page for an ended crisis would currently render "W tym promieniu nie ma dopasowanych mieszkańców", which is wrong once matches are deleted; it must branch on `status`.
- The smoke test cannot hold a coordinator session (the role is granted only in SQL), so it covers only the anonymous and resident denials, like S-03 (`scripts/smoke.mjs:67-75,115-126`).
- Lesson "Public cache headers": the new endpoint runs behind the auth middleware and must not set `Cache-Control: public`. The middleware already sets `private, no-store`.

## What We're NOT Doing

- No auto-expiry, lazy or scheduled (no background jobs exist yet). The age display and the 24 h highlight are the only guard against a forgotten crisis.
- No re-opening of an ended crisis. A mistaken end is fixed by activating a new crisis (a new snapshot).
- No post-crisis view of the ranked list; the snapshot is deleted by design.
- No audit table: `ended_by` + `ended_at` on the crisis row are the record. A full audit trail arrives with S-09.
- No restriction to the activating coordinator.
- No resident-facing notice that a crisis ended (no resident-facing crisis state exists before S-07).

## Implementation Approach

All guarantees live in the database, as in S-03: one security-definer RPC `end_crisis` checks the role, locks the row, flips the status and deletes the snapshot in one transaction. The app layer only calls it and renders the result. The UI stays Astro-only: the dialog is a native `<dialog>` opened by a few lines of inline script, and the confirm button is a plain form POST.

## Critical Implementation Details

**State sequencing** — `end_crisis` must select the crisis `for update` before checking its status, so two coordinators ending the same crisis at the same moment get one "ended" and one "already ended", never two deletes racing an update. Return a value that tells the caller which of the two happened rather than raising on "already ended": that is an expected outcome, not an error.

## Phase 1: Database

### Overview

Add `ended_by` and the `end_crisis` RPC, prove the guarantees with pgTAP, regenerate types.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/20261002120000_crisis_deactivation.sql`

**Intent**: Let a coordinator end a crisis and delete its ranking snapshot in one transaction, recording who did it.

**Contract**:
- `alter table public.crises add column ended_by uuid` — no FK to `auth.users`, same reason as `activated_by` (comment it).
- A check constraint tying the fields together: `status = 'active'` ⇔ `ended_at is null and ended_by is null`. Existing rows are all `active` with nulls, so it validates.
- `public.end_crisis(p_crisis_id uuid) returns boolean`, `language plpgsql security definer set search_path = ''`, owner `postgres`:
  - raises `not_coordinator` unless `public.is_coordinator()`;
  - `select … for update` the crisis; raises `unknown_crisis` when absent;
  - if already `ended` → returns `false` and changes nothing;
  - otherwise sets `status = 'ended'`, `ended_at = now()`, `ended_by = (select auth.uid())`, deletes all `crisis_matches` for the crisis, leaves `match_count` as it was, and returns `true`.
- `revoke execute … from public, anon; grant execute … to authenticated`, like the S-03 functions.
- Header comment in the S-03 style, stating the snapshot-deletion guarantee.

#### 2. pgTAP tests

**File**: `supabase/tests/crisis_deactivation_test.sql`

**Intent**: Prove the access boundary and the end-state guarantees, reusing the fixture style of `crisis_ranking_test.sql` (own fixtures, `delete from public.profiles` first, everything rolled back).

**Contract** — tests cover:
- anon cannot execute `end_crisis` (permission denied);
- a resident (authenticated, no role) gets `not_coordinator`;
- unknown id → `unknown_crisis`;
- a coordinator who did **not** activate the crisis ends it → returns `true`; status `ended`, `ended_at` not null, `ended_by` = that coordinator; zero `crisis_matches` rows for that crisis; `match_count` unchanged;
- a second call returns `false` and changes nothing (`ended_at` unchanged);
- a second, still-active crisis keeps its matches (the delete is scoped);
- `get_crisis_matches` on the ended crisis returns zero rows;
- the check constraint rejects `status = 'ended'` with `ended_at` null (as postgres);
- a resident still cannot `update public.crises` directly (permission denied).

#### 3. Types

**File**: `src/db/database.types.ts`

**Intent**: Regenerate so `end_crisis` and `ended_by` are typed.

**Contract**: generated with the project's usual command (the same one S-03 used); a second run gives no diff.

### Success Criteria:

#### Automated Verification:

- Migrations apply cleanly: `npx supabase db reset`
- pgTAP suites pass (new and existing): `npm run test:db`
- Types regenerate with no diff after a second run
- Type check passes: `npx astro check`
- Lint passes: `npm run lint`

#### Manual Verification:

- Migration pushed to the production database before Phase 2 merges (`npx supabase migration list --linked` shows it remote)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Endpoint and UI

### Overview

Wire the RPC to a form endpoint, add the end button with a confirmation dialog, render the ended state, and extend the panel.

### Changes Required:

#### 1. Service

**File**: `src/lib/services/crisis.ts`

**Intent**: Expose ending and the ended list; carry `endedAt` in the DTO.

**Contract**:
- `CRISIS_COLUMNS` gains `ended_at`; `toCrisisDTO` maps it to `endedAt: string | null`.
- `endCrisis(supabase, id): Promise<{ ok: true; ended: boolean } | { ok: false; message: string }>` — `ended: false` means it was already ended. DB errors map to Polish messages (`not_coordinator` → "Tylko koordynator może zakończyć tryb kryzysowy.", `unknown_crisis` → "Nie znaleziono kryzysu."), anything else to a generic message.
- `listRecentEndedCrises(supabase, limit = 10)`: `status = 'ended'`, ordered by `ended_at desc`.

**File**: `src/types.ts` — `CrisisDTO` gains `endedAt: string | null`.

#### 2. Format helpers

**File**: `src/lib/crisis-format.ts`

**Intent**: Show how long a crisis has run.

**Contract**: `formatActiveFor(activatedAtIso, now = new Date()): string` → "aktywny od 25 min" / "od 3 godz." / "od 2 dni" (Polish plural forms like `formatPeople`); `isStale(activatedAtIso, now)` → `true` past 24 h.

#### 3. Endpoint

**File**: `src/pages/api/koordynator/kryzysy/[id]/zakoncz.ts`

**Intent**: Form POST that ends a crisis and redirects.

**Contract**: `POST` only. Validates `id` as a UUID (invalid → redirect `/koordynator?error=…`). On `ended: true` → `/koordynator?ended=1`; on `ended: false` → `/koordynator?error=Ten kryzys został już zakończony.`; on failure → `/koordynator/kryzys/<id>?error=<message>`. Anonymous → `/auth/signin` (the middleware already does this; keep the same guard as `kryzysy.ts`). Never log the id with personal context.

Moving `kryzysy.ts` is not needed: Astro routes `src/pages/api/koordynator/kryzysy.ts` and `src/pages/api/koordynator/kryzysy/[id]/zakoncz.ts` side by side.

#### 4. Crisis page

**File**: `src/pages/koordynator/kryzys/[id].astro` (+ a new `src/components/crisis/EndCrisisDialog.astro`)

**Intent**: Let a coordinator end an active crisis after a deliberate confirmation; show only the summary for an ended one.

**Contract**:
- Active: shows `?error=` if present, the age line, and a "Zakończ kryzys" button that opens a native `<dialog>` (type, radius, number of people, warning: "Lista dopasowanych osób zostanie trwale usunięta. Tej operacji nie można cofnąć."). The dialog holds a `<form method="post" action="/api/koordynator/kryzysy/<id>/zakoncz">` with "Zakończ kryzys" and "Anuluj". The script is inline in the Astro component; without JS the button is a direct submit of the same form.
- Ended: an "Zakończony" badge, activated and ended times, number of people, the note "Lista osób została usunięta po zakończeniu kryzysu.", no list, no button; `getCrisisMatches` is not called.
- Usable at 375 px.

#### 5. Panel

**File**: `src/pages/koordynator/index.astro`

**Intent**: Confirm the end, show crisis age, list recent ended crises.

**Contract**:
- `?ended=1` → a success message "Kryzys zakończony. Lista dopasowanych osób została usunięta."
- Each active crisis line adds `formatActiveFor`; stale ones (> 24 h) get a visible warning style and the text "— sprawdź, czy nadal trwa".
- A "Zakończone" section (last 10) with type · radius, "aktywowano … · zakończono …", number of people; each links to the crisis summary page. Hidden when empty.

#### 6. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Assert the new endpoint's gates.

**Contract**: anonymous POST to `/api/koordynator/kryzysy/00000000-0000-0000-0000-000000000000/zakoncz` → 302 `/auth/signin`; the same as a resident → the middleware's resident denial (same expectation as "crisis activation denies resident"). Both steps create no accounts beyond the existing resident flow, so `SMOKE_READONLY` behaviour is unchanged.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Type check passes: `npx astro check`
- Build passes: `npm run build`
- Smoke passes against the local dev server: `npm run smoke`
- pgTAP still passes: `npm run test:db`

#### Manual Verification:

- Activate a crisis, end it through the dialog: redirect to the panel with the success message; the crisis is in "Zakończone"; its page shows only the summary
- "Anuluj" closes the dialog and nothing changes
- A second coordinator ending the same crisis afterwards sees "Ten kryzys został już zakończony."
- An active crisis older than 24 h (set `activated_at` back in local SQL) shows the stale warning
- Dialog, panel and summary usable at 375 px with no horizontal scroll

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding.

---

## Testing Strategy

### Unit Tests:

- No unit runner exists yet; the database guarantees are covered by pgTAP (Phase 1).

### Integration Tests:

- pgTAP: access boundary, end-state, idempotency, scoped delete, constraint.
- Smoke: anonymous and resident gates on the new endpoint.

### Manual Testing Steps:

1. `npx supabase db reset`, sign in as a local coordinator, activate "Awaria prądu" at 31-001, 5 km.
2. End it from the crisis page; check the panel message, the "Zakończone" entry and the summary page.
3. In Studio, confirm zero `crisis_matches` rows for that crisis and `ended_by` set.
4. Repeat the POST (browser back + resubmit) → "already ended" message.
5. Set another crisis's `activated_at` to 2 days ago → stale warning in the panel.

## Performance Considerations

Deleting a snapshot is at most a few thousand rows by primary-key prefix (`crisis_matches` PK starts with `crisis_id`), well inside one request.

## Migration Notes

Additive: one nullable column, one check constraint that all existing rows satisfy, one function. Push to production before Phase 2 merges (Workers Builds deploys `master` on merge). Rolling back the Worker leaves the column and function harmlessly unused.

## References

- S-03 plan: `context/archive/2026-10-01-crisis-activation-ranked-list/plan.md`
- Pattern RPC: `supabase/migrations/20261001120000_crisis_matching.sql` (`activate_crisis`)
- Pattern endpoint: `src/pages/api/koordynator/kryzysy.ts`
- Lessons: `context/foundation/lessons.md` (public cache headers)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Database

#### Automated

- [x] 1.1 Migrations apply cleanly: `npx supabase db reset` — 91df89c
- [x] 1.2 pgTAP suites pass (new and existing): `npm run test:db` — 91df89c
- [x] 1.3 Types regenerate with no diff after a second run — 91df89c
- [x] 1.4 Type check passes: `npx astro check` — 91df89c
- [x] 1.5 Lint passes: `npm run lint` — 91df89c

#### Manual

- [x] 1.6 Migration pushed to the production database before Phase 2 merges — 91df89c

### Phase 2: Endpoint and UI

#### Automated

- [x] 2.1 Lint passes: `npm run lint`
- [x] 2.2 Type check passes: `npx astro check`
- [x] 2.3 Build passes: `npm run build`
- [x] 2.4 Smoke passes against the local dev server: `npm run smoke`
- [x] 2.5 pgTAP still passes: `npm run test:db`

#### Manual

- [x] 2.6 End through the dialog: success message, "Zakończone" entry, summary-only page
- [x] 2.7 "Anuluj" closes the dialog and nothing changes
- [x] 2.8 A second end of the same crisis shows "already ended"
- [x] 2.9 A crisis active for more than 24 h shows the stale warning
- [x] 2.10 Dialog, panel and summary usable at 375 px with no horizontal scroll
