# Neighbour Courses Implementation Plan

## Overview

Roadmap S-17 (FR-020). A resident can offer a free course tied to one of their skills. Signed-in neighbours see the courses in their area without the organiser's identity. Each course shows its place only as the 2 km square of the public map, and neighbours sign up in the app. The organiser sees how many people signed up. The organiser gives the meeting place and time through a field that only active sign-ups can read.

## Current State Analysis

- **Grid and anonymity.**
  - The public map uses 2 km squares in EPSG:2180: `floor(x/2000)`, `floor(y/2000)`. The expression is inlined in each density function (`supabase/migrations/20261019120000_data_visibility_controls.sql:159-167`) and has no helper.
  - The map serves a daily snapshot `skills_density_cells (category, sx, sy, band, cell)`.
    - A square enters the all-skills view (`category = ''`) only with ≥ 5 distinct eligible residents, plus salted noise that can only hide.
    - Eligible means `profile_counts_on_map`, a confirmed email and an account ≥ 14 days old.
  - The snapshot is refreshed lazily inside `get_skills_density` (`20261011130000_density_k_anonymity.sql:143-176`). Nothing refreshes it if nobody opens the map.
- **Resident location.** `profiles.location` is always the coarsened 500 m cell centre (`20260927150000`), so it falls in exactly one 2 km square.
- **Skills.**
  - Skills are in `profile_skills (user_id, skill_slug, level, use_in_crisis)`.
  - `save_my_profile` **deletes and re-inserts every skill on each save** (`20261019120000_data_visibility_controls.sql:717-719`). Residents can also write `profile_skills` directly (`20261010170000_narrow_table_grants.sql:41`).
- **Pause.** `pause_active(paused_at, paused_until, now())` is evaluated when data is read (`20261006120000_pause_availability.sql:38-47`).
- **Erasure.** It is immediate: `delete from auth.users` cascades to `profiles` and everything below (`20261004150000_unregister_and_erase.sql`).
- **No channel to residents.** No in-app message or notification channel exists, and a chat was rejected during shaping (`docs/shape_not.md:147`).
- **Conventions.**
  - Rate limits use an advisory lock plus a per-hour count (`activate_crisis`, `20261020120000_crisis_exercises.sql:103`).
  - The free-text normaliser is `check_reason` (`20261011120000_meaningful_reasons.sql:22`), mirrored in `src/lib/reason.ts`.
  - Form POSTs redirect with a flash error (`src/lib/flash.ts:44`, `src/pages/api/profile/pause.ts`).
  - zod parse results look like `src/lib/validation/profile.ts:109`.
  - DB codes map to Polish as in `src/lib/services/profile.ts:15-28`.
  - New tables start with no client privileges, enforced by `supabase/tests/narrow_table_grants_test.sql`.

## Desired End State

- **`/kursy`** is protected and linked as "Kursy" in the signed-in header. It has three sections:
  - **W okolicy:** open courses whose square lies in the viewer's 3×3 block of squares, shown on one small map and in a list. A row shows the skill and category name, title, description, duration and free places. It never shows the organiser, the skill level or the creation date. A row offers "Zapisz się" or "Wypisz się".
  - **Moje zapisy:** the courses the viewer is signed up to, with the organiser's "Szczegóły spotkania".
  - **Moje kursy:** create, edit, close, reopen, renew and delete. Each course shows its sign-up count, its expiry date and why it is hidden, if it is.
- **Visibility rule**, evaluated when data is read. A course appears in someone's "W okolicy" only when all of these hold:
  - it is open and was opened or renewed within 90 days;
  - its organiser is not paused, still holds the skill and has a location that has not changed in the last 7 days;
  - its square (from the organiser's **current** location) is in today's all-skills snapshot;
  - the viewer is eligible and is not the organiser;
  - the square is at most one square away from the viewer's square in both axes.
- **Eligibility to view, create and sign up:** a location unchanged for ≥ 7 days, a confirmed email, an account ≥ 14 days old and a consent row. The 7-day rule stops a resident from moving their pin around to browse other areas' courses square by square (plan review F1).
- **Limits and text rules:**
  - Limits: 3 open, unexpired courses per organiser; 10 sign-ups per hour per resident; an optional capacity of 1–50 that blocks sign-ups when full.
  - Title, description and meeting details reject phone numbers and email addresses.
- **No client table privileges.** The new tables grant nothing to clients; every read and write goes through security-definer RPCs that execute only for `authenticated`.
- **Lifecycle.** Unregistering removes the resident's courses and sign-ups. Saving the profile never touches courses.
- **Privacy notice and consent.** `/prywatnosc` describes courses, and a new consent version is published.

Verify with `npm run test:db`, `npm run test:unit`, `npm run lint`, `npx astro check`, `npm run smoke`, and a manual walk-through with two seeded residents in neighbouring squares.

### Key Discoveries:

- **Skill cascade.** A foreign key from a course to `profile_skills` with `on delete cascade` would wipe every course on each profile save (`20261019120000_data_visibility_controls.sql:717`). The course references `skills(slug)`, and "still holds the skill" is checked when data is read.
- **Organiser id.** A course row carries the organiser's id. Any client `SELECT` grant, even under RLS for others, would expose who organises what. Hence RPC-only access, which also removes the F-07 need to duplicate rules in triggers (`20261010140000_direct_write_rules.sql`).
- **Stale snapshot.** The lazy refresh lives inside `get_skills_density`, so a course list read on a day nobody opened the map would use yesterday's snapshot. The refresh is factored into a helper that both callers use.
- **Location moves.** A resident can change their location in `/profil` as often as they like, so a block computed from the current location alone could be moved anywhere. `profiles` has no "location changed at" timestamp. The server-owned timestamps live in the `profiles_server_timestamps` trigger (`20261010140000_direct_write_rules.sql:47-70`). Before-triggers fire in name order, so it runs after `profiles_resolve_and_coarsen` and sees the final coarsened point.
- **Consent order.** `src/lib/consent.ts:5-7` requires the new consent version to be in production before the constant changes, or every sign-up fails with `consent_required`.

## What We're NOT Doing

- No e-mail or push notification to sign-ups. They read the meeting details in the app. An e-mail can follow S-16.
- No moderation, "report course" button or operator UI. The operator removes abusive courses in Studio.
- No list of sign-ups' identities or pseudonyms for the organiser, only a count.
- No browsing courses around an arbitrary place or postcode, only the viewer's own 3×3 block.
- No structured date and time fields, recurring courses or calendars. "Szczegóły spotkania" is free text.
- No paid courses (PRD non-goal), no ratings or reviews, no skill level shown.
- No change to the map, crisis matching or the S-12 switches. `show_on_map` does not hide courses (decision D5: one switch, one effect).
- No coordinator access to courses.

## Implementation Approach

Build in three phases. The database comes first, because the privacy rules live there and are tested with pgTAP before any UI exists. Next comes the organiser side, which can be verified alone through "Moje kursy". The neighbour side comes last: the list, sign-up and meeting details, plus the notice and consent. Phase 1 is one expand-only migration. It adds new tables, new functions, one nullable column on `profiles` and a new consent version row, and replaces two function bodies with unchanged signatures. The code on `master` keeps working with it.

## Critical Implementation Details

**Timing & lifecycle.** The migration inserts a new `consent_versions` row, and Phase 3 changes `CURRENT_CONSENT_VERSION`. Run `npx supabase db push` to production **before** merging the PR. This is safe because the migration is expand-only. After the merge, sign-ups send the new version and existing residents pass `/zgoda` once.

**State sequencing.**

- `sign_up_for_course` must lock the course row (`select … for update`) before counting active sign-ups against the capacity. Otherwise two neighbours can take the last place.
- The per-hour limit uses the advisory-lock pattern of `activate_crisis`. Withdrawing sets `withdrawn_at` rather than deleting the row. Signing up again clears it and resets `signed_up_at`, so a sign-up/withdraw loop cannot dodge the 10-per-hour limit and harvest meeting details.

## Phase 1: Database

### Overview

One migration with the data model, the shared visibility predicate, the RPCs and a new consent version, plus a pgTAP suite that pins every privacy rule.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/20261021120000_neighbour_courses.sql`

**Intent**: Add courses and sign-ups, readable and writable only through security-definer RPCs that enforce eligibility, the 3×3 block, the k = 5 square rule, pause, expiry, capacity, rate limits and the text rules.

**Contract**:

- **`courses` table.** It is RLS-enabled, with **no policies and no grants** to anon or authenticated, like `skills_density_cells`.
  - Columns:
    - `id uuid pk default gen_random_uuid()`
    - `organiser_id uuid not null references profiles(user_id) on delete cascade`, indexed
    - `skill_slug text not null references skills(slug)`
    - `title text`
    - `description text`
    - `duration_minutes integer` (check 15–480, a multiple of 15)
    - `capacity integer null` (check 1–50)
    - `meeting_details text null`
    - `is_open boolean not null default true`
    - `opened_at timestamptz not null default now()`
    - `created_at timestamptz not null default now()`
  - There is no foreign key to `profile_skills`, on purpose (see Key Discoveries).
- **`profiles.location_changed_at timestamptz null`.** A new column, owned by the server.
  - `profiles_server_timestamps` is replaced (`create or replace`, same trigger). It sets the column to `now()` on insert when a location is given. On update it sets `now()` when the coarsened location differs from the old one (compare `st_asewkb`, since geography `=` compares bounding boxes), and otherwise keeps the old value. A client cannot write it directly.
  - Backfill: existing rows with a location get `location_changed_at = created_at`, so current residents are not locked out.
- **`course_signups` table.** RLS-enabled, with no policies and no grants.
  - Columns: `course_id uuid references courses on delete cascade`, `user_id uuid references profiles(user_id) on delete cascade`, `signed_up_at timestamptz not null`, `withdrawn_at timestamptz null`.
  - Primary key `(course_id, user_id)`. An index on `(user_id, signed_up_at)` serves the rate limit.
- **`check_course_text(p_text text, p_min int, p_max int, p_field text) returns text`.**
  - It is immutable. It normalises whitespace and invisible characters exactly like `check_reason` and enforces the length bounds.
  - It rejects an email (`\S+@\S+\.\S+`) and a phone number. A phone number is a run of at least 9 digits in which digits are separated by at most one space or dash, with an optional leading `+48` or `(+48)`. A dot, a colon or any other character ends the run. So dates and times such as "sobota 21.10.2026, 10:00-12:00" pass, while "600 100 200", "600-100-200" and "+48600100200" are rejected. Accepted cost: "600.100.200" with dots passes (plan review F2).
  - Errors are `<field>_invalid` and `<field>_contact`, with field ∈ `title` (5–80), `description` (20–1000), `meeting` (0–500, null allowed).
- **`density_square(p_location geography) returns table (sx integer, sy integer)`.** Immutable. It holds the single copy of the `floor(st_x(st_transform(…,2180))/2000)` expression. The density functions keep their inline copy, which is not touched here.
- **`ensure_skills_density_fresh(p_category text)`.** It contains the lazy, once-per-Warsaw-day, try-advisory-lock refresh that `get_skills_density` has today. `get_skills_density` is replaced (`create or replace`, same signature and grants) to call it. Execute is revoked from clients.
- **`course_resident_eligible(p_user_id uuid) returns text`.** It returns `'ok' | 'no_location' | 'recent_move' | 'too_new' | 'unconfirmed' | 'no_consent'`. It reads `auth.users.email_confirmed_at`, `created_at <= now() - interval '14 days'`, `profiles.location`, `profiles.location_changed_at <= now() - interval '7 days'` and `consent_events`.
- **`course_visible_to(p_course courses, p_viewer uuid) returns boolean`.** It is the one predicate behind the visibility rule in Desired End State, used by the list, sign-up and the organiser's "hidden because" status. It is `stable` and never refreshes the snapshot. Every RPC that uses it (`get_nearby_courses`, `sign_up_for_course`, `get_my_courses`, `get_my_course_signups`) is volatile and calls `ensure_skills_density_fresh(null)` once, before its query (plan review F7).
- **Helper privileges.** Supabase grants execute on new functions to anon and authenticated by default. Each helper above gets `owner to postgres` and `revoke execute … from public, anon, authenticated`, following `20261011130000_density_k_anonymity.sql:178-185`. Called directly, `course_visible_to` would answer "can resident Y see course X", and `course_resident_eligible` would tell whether any uuid has a confirmed email (plan review F3).
- **Organiser RPCs.** All are security definer, `set search_path = ''`, owned by postgres, execute for `authenticated` only, and act on `auth.uid()`. Errors are snake_case codes.
  - `create_course(p_skill_slug, p_title, p_description, p_duration_minutes, p_capacity, p_meeting_details) returns uuid`:
    - requires eligibility `ok` and the skill in `profile_skills` (`course_skill_not_held`);
    - allows at most 3 open, unexpired courses (`course_limit_reached`), under an advisory lock per organiser.
  - `update_course(p_id, p_title, p_description, p_duration_minutes, p_capacity, p_meeting_details)`:
    - the skill is fixed;
    - fails with `course_capacity_below_signups` when the new capacity is under the active count.
  - `set_course_open(p_id, p_open boolean)`: reopening checks the 3-open limit.
  - `renew_course(p_id)`: sets `opened_at = now()` and checks the limit when the course was expired.
  - `delete_course(p_id)`.
  - `get_my_courses()`: returns `id, skill_slug, title, description, duration_minutes, capacity, meeting_details, is_open, expires_on date, signup_count` (active sign-ups only) and `hidden_reason text`.
    - `hidden_reason` is one of `null | 'closed' | 'expired' | 'paused' | 'skill_removed' | 'no_location' | 'recent_move' | 'square_hidden'`, checked in that order.
  - Every function on another user's course raises `course_not_found`, never a distinct "not yours".
- **Neighbour RPCs.**
  - `get_course_area()`: returns `eligibility text` and `block jsonb`, the GeoJSON polygon of the viewer's 3×3 block, or null when not eligible.
  - `get_nearby_courses()`: returns `id, skill_name, category_name, title, description, duration_minutes, places_left integer null, is_full boolean, signed_up boolean, cell jsonb` for courses passing `course_visible_to`.
    - The output has no organiser id, level, creation date or meeting details.
    - It is ordered by square, then title, then id, so every reader sees the same order.
  - `sign_up_for_course(p_id)`:
    - requires eligibility `ok` and `course_visible_to`, otherwise `course_not_found`;
    - also checks `course_own` (no sign-up to one's own course), `course_full` (row lock first), `course_signup_rate_limited` (10 per rolling hour, counted on `signed_up_at`) and `course_already_signed_up`;
    - it upserts, clearing `withdrawn_at`.
  - `withdraw_from_course(p_id)`: sets `withdrawn_at = now()` on the caller's active sign-up.
  - `get_my_course_signups()`: returns, for the caller's active sign-ups, the course fields from `get_nearby_courses` plus `meeting_details`, `cell` and `available boolean`.
    - `available` is false when the course is closed, expired, paused, its skill was removed or its square is hidden.
    - The meeting details are still shown, because the sign-up has already seen them.
- **Consent.** `insert into consent_versions (version) values ('2026-10-21')`, the migration's date.

#### 2. Generated types

**File**: `src/db/database.types.ts`

**Intent**: Regenerate after the migration with `npm run db:types` so the services get typed RPCs.

**Contract**: The new function signatures appear under `Functions`. No hand edits.

#### 3. pgTAP suite

**File**: `supabase/tests/neighbour_courses_test.sql`

**Intent**: Pin every privacy and lifecycle rule. Fixtures follow `density_k_anonymity_test.sql`: residents with backdated `auth.users.created_at` and confirmed emails, placed in chosen squares.

**Contract**: The named tests are:

- **Privileges:**
  - `no_client_table_privileges`: anon and authenticated hold nothing on `courses` or `course_signups`. The existing `set_eq` lists in `narrow_table_grants_test.sql` stay unchanged and keep passing.
  - `rpcs_authenticated_only`: anon cannot execute any course RPC.
  - `helpers_not_executable_by_clients`: neither anon nor authenticated can execute `check_course_text`, `density_square`, `ensure_skills_density_fresh`, `course_resident_eligible` or `course_visible_to`.
- **Creation:** `create_requires_held_skill`, `create_requires_eligibility` (one case per eligibility code), `open_course_limit` (the 4th open course fails; a closed or expired one does not count), `text_rejects_phone` (`"zadzwoń 600 100 200"`, `"600-100-200"`, `"+48600100200"`, `"(+48) 600 100 200"`), `text_allows_dates_and_times` (`"sobota 21.10.2026, 10:00-12:00"`, `"2 x 90 min, 10-12 osób"`), `text_rejects_email`, `text_normalises_whitespace`.
- **Visibility:**
  - `nearby_same_square`, `nearby_adjacent_square` (one away diagonally is visible), `nearby_two_away_hidden`;
  - `square_below_k_hidden` (4 eligible residents: the course is hidden and `get_my_courses` says `square_hidden`);
  - `paused_organiser_hidden`, then visible again after resume;
  - `expired_hidden` (`opened_at` 91 days ago), visible again after renew;
  - `closed_hidden`, `own_course_excluded`, `skill_removed_hidden`;
  - `recent_move_hides`:
    - a viewer who moved 6 days ago gets `recent_move` and an empty list;
    - an organiser who moved 6 days ago has the course hidden with `recent_move`;
    - both pass at 8 days;
  - `location_changed_at_server_owned`:
    - a direct update cannot set it;
    - a save with the same location keeps it;
    - a new location resets it;
    - existing rows were backfilled to `created_at`;
  - `nearby_has_no_organiser_column`: the result column names are compared to the allowed list.
- **Sign-up:**
  - `signup_not_visible_is_not_found` (a course two squares away gives `course_not_found`);
  - `signup_own_course`, `signup_capacity_full`, `signup_rate_limit` (the 11th within an hour fails, and a withdraw/re-sign loop still counts);
  - `resignup_after_withdraw`, `signup_count_excludes_withdrawn`.
- **Meeting details:** `meeting_details_only_for_active_signups` (absent from `get_nearby_courses`, present in `get_my_course_signups`, gone after withdrawing).
- **Other residents' courses:** `foreign_course_not_found` (update, delete, close and renew on another resident's course all raise `course_not_found`).
- **Lifecycle:**
  - `profile_save_keeps_courses`: calling `save_my_profile` with the same skills leaves courses and sign-ups intact, which guards against the cascade gotcha;
  - `erase_removes_courses_and_signups`: `unregister_me`, with the 5-minute re-authentication claim, removes both.
- **Density:** `get_skills_density_unchanged`. The existing density suites pass unmodified.

### Success Criteria:

#### Automated Verification:

- The migration applies to a fresh local database: `npx supabase db reset`
- The new suite and all existing suites pass: `npm run test:db`
- Types regenerate cleanly: `npm run db:types`, then `npx astro check`
- Lint passes: `npm run lint`

#### Manual Verification:

- In Studio, `courses` and `course_signups` show RLS enabled with no policies, and the SQL editor as `authenticated` cannot select from them.

**Implementation Note**: After this phase passes automated verification, pause for manual confirmation before Phase 2.

---

## Phase 2: Organiser — "Moje kursy"

### Overview

The `/kursy` page with the organiser's section, its endpoints and validation, and the header link and route protection.

### Changes Required:

#### 1. Text rules in TypeScript

**File**: `src/lib/course-text.ts`, `src/lib/course-text.test.ts`

**Intent**: Mirror `check_course_text` so the form rejects contacts and bad lengths before the round trip. The SQL stays the authority, as with `reason.ts`.

**Contract**: The module exports `normaliseCourseText` and `checkCourseText(text, field) → { ok: true, text } | { ok: false, message }`, plus the length bounds per field. It uses relative imports only (`node:test`). The tests are the same cases as the SQL ones: a phone with spaces, dashes or `+48`, an email, invisible characters, and the bounds.

#### 2. Validation

**File**: `src/lib/validation/courses.ts`

**Intent**: zod schemas for the create, update and id-only forms, in the `ParseResult` shape of `validation/profile.ts`, with Polish messages.

**Contract**:

- `duration_minutes` must be one of `30, 45, 60, 90, 120, 180, 240, 360, 480`.
- `capacity` is empty or 1–50.
- `skill_slug` matches `/^[a-z-]{1,40}$/`.
- Text fields go through `checkCourseText`.

#### 3. Service

**File**: `src/lib/services/courses.ts`, `src/types.ts`

**Intent**: Typed wrappers over the organiser RPCs. zod parses the RPC output into DTOs (`MyCourse`), and DB error codes map to Polish messages following `services/profile.ts`.

**Contract**:

- Functions: `getMyCourses`, `createCourse`, `updateCourse`, `setCourseOpen`, `renewCourse`, `deleteCourse`, each returning `{ ok: true, … } | { ok: false, message }`.
- The `COURSE_ERROR_MESSAGES` map covers every code from Phase 1. Two examples: `course_limit_reached` → "Możesz mieć najwyżej 3 otwarte kursy.", `title_contact` → "Tytuł nie może zawierać telefonu ani adresu e-mail."
- Each `hidden_reason` gets a Polish label, for example:
  - `square_hidden` → "Ukryty: w Twojej okolicy mieszka jeszcze za mało osób, żeby pokazać kurs bez wskazywania Ciebie. Może się to zmieniać z dnia na dzień." The daily snapshot noise makes squares near the threshold appear and disappear (plan review F6).
  - `recent_move` → "Ukryty do <data>: lokalizacja zmieniona w ostatnich 7 dniach."

#### 4. Endpoints

**File**: `src/pages/api/kursy/{utworz,edytuj,zamknij,otworz,odnow,usun}.ts`

**Intent**: Form POST handlers in the pattern of `api/profile/pause.ts`. Each checks `locals.user`, builds the client, parses with zod, calls the service, and redirects to `/kursy` with a flash error or a success param.

**Contract**: The success params are `?utworzono=1`, `?zapisano=1`, `?zamknieto=1`, `?otwarto=1`, `?odnowiono=1` and `?usunieto=1`.

#### 5. Page and components

**File**: `src/pages/kursy.astro`, `src/components/courses/MyCourses.astro`, `src/components/courses/CourseForm.astro`

**Intent**: A server-rendered page (`Cache-Control: private`) in the `/profil` style.

- The page reads flash and success params like `profil.astro:15-23`.
- The "Moje kursy" section lists courses with their status, expiry, sign-up count and hidden reason, and the edit, close or reopen, renew and delete forms.
- The create form offers only the resident's own skills, read from `get_my_profile`.
- When the resident is not eligible, the section explains why: no location links to `/profil`, while a too-new account and a recent move give the date the resident becomes eligible.

**Contract**: Plain HTML forms, no React island. The delete form has a required checkbox "Usuwam kurs i wszystkie zapisy". The zod schema for delete requires it, and a missing tick returns a flash error. `DeleteAccount.astro` has no second step to copy (plan review F5). The layout works at phone width with no horizontal scroll.

#### 6. Routing and navigation

**File**: `src/middleware.ts`, `src/components/SiteHeader.astro`

**Intent**: Protect the new routes and link them.

**Contract**:

- Add `/kursy` and `/api/kursy` to `PROTECTED_ROUTES`. The consent gate applies automatically.
- Add `navLink("/kursy")` "Kursy" between "Mapa" and "Mój profil", for signed-in users only.

### Success Criteria:

#### Automated Verification:

- Unit tests pass, including `course-text.test.ts`: `npm run test:unit`
- Type check passes: `npx astro check`
- Lint passes: `npm run lint`
- Build passes: `npm run build -- --outDir <scratch dir>` (keeps `dist/` free for other sessions)

#### Manual Verification:

- On localhost as a seeded eligible resident: create a course, edit it, close it, reopen it, renew it and delete it. Each step shows the right flash and state.
- A 4th open course shows the limit message. A title with a phone number shows the contact message.
- A course in a sparse square shows the "Ukryty: …" reason.
- A too-new account and an account without a location see the explanation instead of the form.
- Phone viewport: no horizontal scroll, and the "Kursy" header link wraps cleanly.

**Implementation Note**: Pause for manual confirmation before Phase 3.

---

## Phase 3: Neighbour — "W okolicy" and "Moje zapisy"; notice and consent

### Overview

The list with a small map, sign-up and withdraw, meeting details for sign-ups, the privacy notice, the consent bump and the smoke checks.

### Changes Required:

#### 1. Service and endpoints

**File**: `src/lib/services/courses.ts`, `src/types.ts`, `src/pages/api/kursy/{zapisz,wypisz}.ts`

**Intent**: Add `getCourseArea`, `getNearbyCourses`, `signUpForCourse`, `withdrawFromCourse` and `getMyCourseSignups` with DTOs (`NearbyCourse`, `MyCourseSignup`), plus their error messages. The endpoints follow the Phase 2 pattern.

**Contract**:

- Success params are `?zapisano-na-kurs=1` and `?wypisano=1`.
- `course_signup_rate_limited` → "Zapisałeś się na zbyt wiele kursów w ciągu godziny. Spróbuj później."

#### 2. Map island and sections

**File**: `src/components/courses/CoursesMap.tsx`, `src/components/courses/NearbyCourses.astro`, `src/components/courses/MySignups.astro`, `src/pages/kursy.astro`

**Intent**: One small react-leaflet map (`client:only="react"`) that reuses `map/map-view.ts` and the tile layer of `DensityMap.tsx`.

- The map draws the viewer's 3×3 block outline and each course square with a letter label (A, B, …).
- The list rows carry the matching letter, so the map never needs per-row maps.
- "Moje zapisy" shows each signed-up course with "Szczegóły spotkania", or "Organizator jeszcze nie podał szczegółów". It shows "Kurs chwilowo niedostępny" when `available` is false, plus a withdraw form.

**Contract**:

- The map gets only the GeoJSON polygons and letters as props. No course text or ids go into island props beyond what the page already prints.
- Labels are assigned in the RPC order: square, then title, then id.

#### 3. Privacy notice and consent

**File**: `src/pages/prywatnosc.astro`, `src/lib/consent.ts`

**Intent**: Describe the courses and bump the consent version.

- In "Jakie dane przetwarzamy" and "W jakim celu": what a course shows to which neighbours (skill, text, 2 km square, never your name, contact or level), that meeting details go to sign-ups only, that sign-ups are counted, not named, and that everything is removed when the account is removed.
- Bump the consent version published in Phase 1.

**Contract**:

- `CURRENT_CONSENT_VERSION = "2026-10-21"`.
- `CONSENT_LABEL` adds "oraz kursów sąsiedzkich" to the purpose.

#### 4. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Assert that the new routes are protected.

**Contract**: Add `["kursy redirects anonymous user", () => request("/kursy"), { status: 302, location: "/auth/signin" }]`, and the same for `POST /api/kursy/zapisz`.

### Success Criteria:

#### Automated Verification:

- `npm run test:unit`, `npm run test:db`, `npx astro check`, `npm run lint` all pass
- Smoke passes against the local dev server: `npm run smoke`
- Build passes: `npm run build -- --outDir <scratch dir>`

#### Manual Verification:

- **Two residents in diagonal neighbouring squares, both with a ≥ 5-resident square:**
  - B sees A's course with the right letter on the map and no name or level;
  - B signs up and sees the meeting details under "Moje zapisy";
  - A sees the count go to 1; B withdraws and A sees 0.
- **Hidden cases:**
  - a resident two squares away does not see the course;
  - when A pauses, the course disappears from B's list and B's sign-up shows "Kurs chwilowo niedostępny";
  - when A resumes, the course is back.
- **Capacity 1:** a third resident sees "brak miejsc" after B signs up.
- **Consent:** an existing resident is sent to `/zgoda` once after the consent bump, and sign-up of a new account works.
- **Phone viewport:** the map and list fit with no horizontal scroll.

---

## Testing Strategy

### Unit Tests:

- `course-text.test.ts`, with the same cases as the SQL suite:
  - rejected phones: spaces, dashes, brackets, `+48`, zero-width characters inside the number;
  - allowed: dates and times (`21.10.2026`, `10:00-12:00`), short counts (`10-12 osób`), and `600.100.200` with dots (accepted cost);
  - email, bounds per field, null meeting details.

### Integration Tests:

- `supabase/tests/neighbour_courses_test.sql`, with the named tests listed in Phase 1. The existing suites guard the density refactor and the grants list.

### Manual Testing Steps:

1. Create residents A, B and C through `/auth/signup` on localhost. The 500 seeded residents have no password and cannot sign in (`supabase/seed.sql:6`). They are 30 days old and confirmed, so they provide k = 5 around the seed centre. Then:
   - In SQL, set the three accounts' `auth.users.created_at` to 15 days ago and their `profiles.location_changed_at` to 8 days ago.
   - Put A's pin in square `(283, 121)` (EPSG:2180, `floor(x/2000)`), B's in its diagonal neighbour `(284, 122)` and C's two squares away.
   - Check that both A's and B's squares appear on `/mapa`.
2. Walk the Phase 2 and Phase 3 manual checks in order.
3. Pause A, then remove A's skill in `/profil`. Check the hidden reasons on A's "Moje kursy" and B's view.
4. Unregister B and confirm that A's count drops.

## Performance Considerations

- `get_nearby_courses` filters by the viewer's 3×3 block, joins organisers' profiles, and does one primary-key lookup in `skills_density_cells` per candidate. That is cheap at pilot scale.
- The snapshot freshness check runs once per call, not per row.
- `/kursy` is never cached publicly. It runs the auth middleware, so `Cache-Control: private` applies (lesson "Public cache headers").

## Migration Notes

- The migration is expand-only:
  - the only change to an existing table is the nullable `profiles.location_changed_at`, backfilled to `created_at`;
  - `profiles_server_timestamps` and `get_skills_density` are replaced with unchanged signatures.
- Push it to production with `npx supabase migration list --linked`, then `npx supabase db push`, **before** merging. The consent constant in Phase 3 depends on the new `consent_versions` row (lesson "Push migrations to production right after merge"; here, earlier because of the consent order).
- Rollback: the Worker can roll back freely. The tables and functions are unused by older code.

## References

- PRD FR-020: `context/foundation/prd.md:96-97`
- Roadmap S-17: `context/foundation/roadmap.md`
- Map anonymity: `context/archive/2026-10-05-public-skills-density-map/plan-brief.md`, `supabase/migrations/20261011130000_density_k_anonymity.sql`
- Visibility matrix D1–D8: `context/archive/2026-10-19-data-visibility-controls/visibility-matrix-proposal.md`
- Pause: `supabase/migrations/20261006120000_pause_availability.sql`; erase: `supabase/migrations/20261004150000_unregister_and_erase.sql`
- Rate-limit pattern: `supabase/migrations/20261020120000_crisis_exercises.sql:103`
- Form pattern: `src/pages/api/profile/pause.ts`, `src/lib/flash.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Database

#### Automated

- [x] 1.1 The migration applies to a fresh local database: `npx supabase db reset`
- [x] 1.2 The new suite and all existing suites pass: `npm run test:db` — 0077eac
- [x] 1.3 Types regenerate cleanly: `npm run db:types`, then `npx astro check` — 0077eac
- [x] 1.4 Lint passes: `npm run lint` — 0077eac

#### Manual

- [x] 1.5 Studio shows both tables with RLS on, no policies, and no client select — 0077eac

### Phase 2: Organiser — "Moje kursy"

#### Automated

- [x] 2.1 Unit tests pass, including `course-text.test.ts`: `npm run test:unit` — 96dfef1
- [x] 2.2 Type check passes: `npx astro check` — 96dfef1
- [x] 2.3 Lint passes: `npm run lint` — 96dfef1
- [x] 2.4 Build passes to a scratch outDir — 96dfef1

#### Manual

- [x] 2.5 Create, edit, close, reopen, renew and delete work with the right flashes — 96dfef1
- [x] 2.6 Limit and contact messages show — 96dfef1
- [x] 2.7 The sparse-square course shows the "Ukryty" reason — 96dfef1
- [x] 2.8 Ineligible residents see the explanation — 96dfef1
- [x] 2.9 Phone viewport has no horizontal scroll — 96dfef1

### Phase 3: Neighbour — "W okolicy" and "Moje zapisy"; notice and consent

#### Automated

- [x] 3.1 Unit, db, type check and lint pass — adaff91
- [x] 3.2 Smoke passes against the local dev server — adaff91
- [x] 3.3 Build passes to a scratch outDir — adaff91

#### Manual

- [x] 3.4 Neighbour sees, signs up, reads meeting details; organiser sees the count change — adaff91
- [x] 3.5 Two-away, paused and resumed cases behave as specified — adaff91
- [x] 3.6 Capacity 1 shows "brak miejsc" — adaff91
- [x] 3.7 The consent bump sends existing residents to `/zgoda` once, and new sign-up works — adaff91
- [x] 3.8 Phone viewport fits the map and list — adaff91
