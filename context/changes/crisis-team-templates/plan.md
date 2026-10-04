# Crisis Team Templates Implementation Plan

## Overview

Roadmap S-10 (FR-014). On an active crisis, a coordinator picks a predefined team template (evacuation, technical, care, medical point) and a team count (1–10), and gets teams assembled from the crisis's ranked snapshot. The rule maximises the number of **complete** teams, then prefers better-ranked people. At most one partial team follows, with its missing roles marked. Nothing is stored: the teams are computed on each request from the snapshot and the residents' current skills.

## Current State Analysis

- **Templates exist only as prose** in `docs/shape_not.md:103-112`. The four templates are evacuation (medic + physically strong person + driver with a vehicle), technical (electrician + person with tools + driver), care (medic or carer + driver + volunteer with premises) and medical point (2 medics or rescuers + logistician). The example request is "złóż mi 3 zespoły ewakuacyjne w promieniu 5 km". There is no template table and no template code.
- **The snapshot holds matrix skills only.** `crisis_matches.matched_skills` lists only the skills in the crisis type's matrix (`supabase/migrations/20261001120000_crisis_matching.sql:145-157`). `osoba-silna-fizycznie` is in no type's matrix (`20261001120100_seed_crisis_matrix.sql:10-11`), and `narzedzia-reczne` and `lokal-ogrzewany-klimatyzowany` are each in one type only. Template roles therefore can't be filled from `matched_skills`.
- **`profile_skills` is owner-only under RLS** (`20260927120000_resident_profile_schema.sql:309-317`). Reading another resident's skills means a security-definer RPC, the same pattern as `get_crisis_matches`.
- **Pseudonymity:** the coordinator sees `Osoba #<position>`. `position` is unique per crisis, with a hash tiebreak that favours no one by id or registration time. No `user_id`, score or raw distance leaves the database. `end_crisis` deletes the snapshot (`20261002120000_crisis_deactivation.sql:61`).
- **Availability:** `get_crisis_matches` returns `has_phone`, `availability_slots` and `available_now`, which are display-only and never reorder anything (S-06 decision, `20261003120000_resident_phone_and_availability.sql:11-13`). Confirmed availability (S-07) doesn't exist yet.
- **No unit-test runner.** Tests are pgTAP (`supabase/tests/*.sql`, `npm run test:db`) plus the HTTP smoke test. Locally Node is 25.9 (it strips TypeScript natively). CI uses `node-version: 22` in `.github/workflows/ci.yml`.
- **Routes:** the middleware gates `/koordynator` to coordinators and sends `Cache-Control: private, no-store` (`src/middleware.ts:5-7`). The S-09 `kontakty` page set the pattern for a crisis sub-page.

## Desired End State

On `/koordynator/kryzys/<id>`, an active crisis shows a "Złóż zespoły" link to `/koordynator/kryzys/<id>/zespoly`. That page:

- has a GET form with a template select (the 4 seeded templates, each with its roles listed) and a team count from 1 to 10;
- after submitting (`?szablon=ewakuacyjny&liczba=3`), shows a summary ("Pełne zespoły: 2 z 3"), the complete teams numbered 1..k, then at most one partial team with a "niepełny" badge and "brak" in each empty role slot;
- shows each member as `Osoba #N` with rank, distance, the skills that qualify them for their role (with level), the availability badge and "bez telefonu" when relevant, just like the main list;
- never puts a person in two slots;
- for an ended crisis, says the list was deleted and shows no form;
- shows a Polish message for an invalid template or count, and keeps the form.

Verification: the pgTAP suite and `npm run test:unit` pass. With the local seed, requesting 3 evacuation teams on a flood crisis shows complete teams first and the partial team last.

### Key Discoveries:

- The ranking RPC is the model for access checks and output shape: `supabase/migrations/20261001120000_crisis_matching.sql:81-210`. The latest version of `get_crisis_matches` is in `20261003120000_resident_phone_and_availability.sql:166-205`.
- Reference-data RLS and the revoke pattern: `20261001120000_crisis_matching.sql:243-282`.
- Error mapping in the service, and zod parsing of RPC jsonb: `src/lib/services/crisis.ts:15-27, 134-160`.
- Member rendering to mirror: `src/pages/koordynator/kryzys/[id].astro:126-180`.
- Fixture setup for the pgTAP suite: `supabase/tests/break_glass_contact_reveal_test.sql:1-60`.
- `position` is unique per crisis, so `position` alone is a total, unbiased order. Use it as the solver's cost.

## What We're NOT Doing

- **Saving teams** or a stored roster, and any editing or locking of teams.
- **Coordinator-defined templates, editing templates in the product, or tying templates to crisis types.** Every crisis can use all 4.
- **Pulling people from outside the snapshot.** A resident in the radius with no matrix skill (for example only `osoba-silna-fizycznie`) is never on a team.
- **Using availability to choose people.** Declarations are shown as badges only. Confirmed availability (S-07) plugs in later.
- **A minimum level or a stricter "medyk".** A first-aid course counts as a medic, as in the crisis matrix.
- **A new "own vehicle" skill.** A licence (`kierowca-kat-b/c`) counts as "kierowca z pojazdem".
- **Geographic compactness of a team, mixing templates in one request, contacting team members** (that's S-07/S-08/S-09), **and pagination.**
- **A unit-test framework dependency.** We use the built-in `node:test` only.

## Implementation Approach

The split mirrors the existing boundary. **The database decides who may be considered and what they qualify for. The app decides how to arrange them.**

1. A security-definer RPC, `get_team_candidates`, returns the snapshot members who qualify for at least one role of the template, based on their **current** `profile_skills`. For each role it keeps only the first `p_teams × S` qualifying members by `position`, where S is the template's total slots per team. That bound is exact: any slot filled by a member outside a role's top `p_teams × S` can be swapped for an unused member inside it, at no loss of fill and no higher cost. So the payload stays small (at most 10 × 4 × 3 rows) without changing the answer.
2. A pure TypeScript solver, `assembleTeams`, models the problem as a flow network:
   - it finds k\*, the largest k ≤ requested for which k complete teams can be filled at once;
   - it takes the min-cost assignment at k\* (cost = `position`);
   - it deals the people out to teams by rank;
   - from the people left over, it builds at most one partial team (max fill, then min cost), and only when k\* is below the request.
3. An Astro page renders the result server-side. It needs no JS.

## Critical Implementation Details

- **Why team by team is wrong.** Take roles A and B, two teams, and the pool #1{A,B}, #2{A,B}, #3{A}, #4{A}. Picking the cheapest team first gives {#1 A, #2 B}, which leaves #3 and #4 with no B, so team 2 is partial. The global rule gives {#3 A, #1 B} and {#4 A, #2 B}: two complete teams. The solver must search over k with the role capacities scaled to k teams. It must not build teams one at a time.
- **Dealing to teams.** k identical teams make any saturating assignment valid. To make it deterministic, sort each role's assigned people by `position` and give team i the slice `[i·slots_r, (i+1)·slots_r)`. Team 1 then gets the best-ranked person in every role.
- **Determinism.** Feed candidates sorted by `position` and break shortest-path ties by node order, so the same input always gives the same teams. The page is a GET URL, and reloading must not reshuffle the teams.

## Phase 1: Database

### Overview

Template reference data, the candidate RPC with its access guarantees, a pgTAP suite and regenerated types.

### Changes Required:

#### 1. Schema and RPC

**File**: `supabase/migrations/20261004140000_crisis_team_templates.sql`

**Intent**: Add the template reference tables and `get_team_candidates`, the only path from a crisis snapshot to role eligibility. Write a header comment in the style of the earlier crisis migrations that states the guarantees: coordinator only, active crisis only, snapshot members only, current skills, the per-role bound, and no `user_id`.

**Contract**:

- `team_templates (slug text pk, name_pl text not null, sort smallint not null)`
- `team_template_roles (template_slug → team_templates, role_slug text, name_pl text not null, slots smallint not null check (slots between 1 and 3), sort smallint not null, pk (template_slug, role_slug))`
- `team_role_skills (template_slug, role_slug, skill_slug → skills, pk (template_slug, role_slug, skill_slug), fk (template_slug, role_slug) → team_template_roles)`
- RLS on all three: separate `select` policies for `anon` and for `authenticated`, and no write policies. Revoke insert, update, delete, truncate, references and trigger from anon and authenticated, as for `crisis_types`.
- `get_team_candidates(p_crisis_id uuid, p_template text, p_teams integer) returns table (rank integer, "position" integer, distance_km_rounded numeric, role_skills jsonb, has_phone boolean, availability_slots integer, available_now boolean)`. It is `stable security definer set search_path = ''`, owned by postgres, revoked from public and anon, and granted to authenticated.
  - Exceptions, checked in this order: `not_coordinator`, `unknown_crisis`, `crisis_not_active`, `unknown_template`, `invalid_team_count` (null, or outside 1..10).
  - `role_skills`: `{"<role_slug>": [{"slug": text, "level": int | null}], …}`. It includes only the roles the member qualifies for, and lists the qualifying skills best level first, then by slug.
  - Rows: members of `crisis_matches` for the crisis that hold at least one role skill in their current `profile_skills`, and that rank within the first `p_teams × S` by `position` for at least one role. Ordered by `position`.
  - Distance, phone and availability columns are computed exactly as in `get_crisis_matches`.

#### 2. Template seed

**File**: `supabase/migrations/20261004140100_seed_team_templates.sql`

**Intent**: Seed the 4 templates from `docs/shape_not.md:103-112`, mapping roles to skills the way the crisis matrix maps them. A header comment states the mapping rules and that templates change only by migration.

**Contract** (template → role (slots): skills):

- `ewakuacyjny` "Zespół ewakuacyjny":
  - `medyk` (1): ratownik-medyczny, lekarz, pielegniarka, pierwsza-pomoc
  - `osoba-silna` (1): osoba-silna-fizycznie
  - `kierowca` (1): kierowca-kat-b, kierowca-kat-c
- `techniczny` "Zespół techniczny":
  - `elektryk` (1): elektryk
  - `narzedzia` (1): narzedzia-reczne, pila-lancuchowa
  - `kierowca` (1): kierowca-kat-b, kierowca-kat-c
- `opiekunczy` "Zespół opiekuńczy (upały/mrozy)":
  - `medyk-opiekun` (1): the 4 medic skills + opiekun-osob-starszych
  - `kierowca` (1): kierowca-kat-b, kierowca-kat-c
  - `lokal` (1): lokal-ogrzewany-klimatyzowany
- `punkt-medyczny` "Punkt medyczny":
  - `medyk` (2): the 4 medic skills
  - `logistyk` (1): logistyk

#### 3. pgTAP suite

**File**: `supabase/tests/crisis_team_templates_test.sql`

**Intent**: Lock down the access boundary, the pool and the bound. Follow the fixture and isolation style of `break_glass_contact_reveal_test.sql`.

**Contract**: assertions cover:

- **Access:**
  - anon has no execute on the RPC;
  - a resident gets `not_coordinator`;
  - unknown crisis, ended crisis, unknown template, count 0 and count 11 each raise their exception.
- **Seed:** the 4 templates exist with the roles and slots above.
- **Pool:**
  - a snapshot member with `osoba-silna-fizycznie` (not in the matrix) appears with that role;
  - a resident inside the radius but outside the snapshot does not appear;
  - a skill removed from a member after activation no longer qualifies them.
- **Bound:** with `p_teams = 1` and S = 3, a role with 5 qualifying members returns only the first 3 by position for that role.
- **Shape:**
  - the result has no `user_id` column;
  - the rows are ordered by position.
- **Reference tables:** they are readable by anon and authenticated, and writes fail.

#### 4. Generated types

**File**: `src/db/database.types.ts`

**Intent**: Regenerate with `npm run db:types` so the new RPC and tables are typed.

### Success Criteria:

#### Automated Verification:

- Migrations apply cleanly: `npx supabase db reset`
- The pgTAP suites pass, the new one and all existing ones: `npm run test:db`
- Types regenerated and type check passes: `npm run db:types && npx astro check`

#### Manual Verification:

- In Studio, the 4 templates and their role skills match `docs/shape_not.md:103-112` and the mapping above.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Solver

### Overview

A pure, dependency-free assembly function and its unit tests, run with Node's built-in test runner and wired into CI.

### Changes Required:

#### 1. Assembly solver

**File**: `src/lib/team-assembly.ts`

**Intent**: Turn template roles and candidates into teams under the agreed rule: maximise complete teams, then minimise the sum of positions, then add at most one partial team. Keep it free of imports other than `import type` and of `@/` aliases, so `node --test` can run it with no build step.

**Contract**:

```ts
export interface TeamRoleSpec { slug: string; slots: number }
export interface TeamCandidateInput { position: number; roles: readonly string[] }
export interface AssembledTeam<C> {
  complete: boolean;
  /** One entry per slot, in template role order; `candidate` is null for an unfilled slot. */
  slots: { role: string; candidate: C | null }[];
}
export function assembleTeams<C extends TeamCandidateInput>(
  roles: readonly TeamRoleSpec[],
  candidates: readonly C[],
  requested: number,
): { teams: AssembledTeam<C>[]; completeCount: number };
```

The method is min-cost max-flow by successive shortest paths (Bellman-Ford or SPFA is enough at this size):

- Edges run source → role (capacity k·slots_r) → candidate (capacity 1, cost = position) → sink (capacity 1).
- Find k\* by testing k from `requested` down to 0, taking the first k whose max flow equals k·S.
- Deal the people out to teams as described in Critical Implementation Details.
- If k\* < requested and the leftover people fill at least one slot of a single team (capacity slots_r), append that team with `complete: false`.

`completeCount` = k\*.

#### 2. Unit tests

**File**: `src/lib/team-assembly.test.ts`

**Intent**: Pin the decisions made in planning as executable cases.

**Contract**: one `node:test` case per item:

- **Multi-skilled person:** #1{medyk, kierowca}, #2{medyk}, #3{osoba-silna}. Evacuation × 1 gives one complete team, with #1 as driver and #2 as medic.
- **Global beats team by team:** roles A and B, two teams, pool #1{A,B}, #2{A,B}, #3{A}, #4{A}. Expect 2 complete teams.
- **Partial:** evacuation × 3, with the pool able to fill 2 and a medic and a driver left over. Expect 2 complete teams, then 1 partial team with the `osoba-silna` slot null.
- **No partial when the request is met:** the pool is big enough. Expect exactly `requested` complete teams and no partial team.
- **Empty or useless pool:** no candidates, or none matching any role. Expect `teams: []`.
- **Multi-slot role:** medical point × 1 gets two distinct medics.
- **Uniqueness:** across all teams and slots, no candidate appears twice.
- **Rank preference:**
  - when two complete splits exist, the one with the lower sum of positions wins;
  - team 1 holds the best-positioned person of every role.
- **Determinism:** the same input run twice gives deep-equal output.

#### 3. Test command and CI

**Files**: `package.json`, `.github/workflows/ci.yml`

**Intent**: Make the unit tests runnable locally and enforced in CI.

**Contract**:

- `package.json`: a `"test:unit": "node --test \"src/**/*.test.ts\""` script.
- `ci` job: set the Node version to one that strips TypeScript by default (≥ 22.18; use `24` to be safe), and add `- run: npm run test:unit` after lint.
- Check that ESLint and `astro check` accept the test file (it imports `node:test` and `node:assert/strict`).
- Update the "Commands" section of `CLAUDE.md` to name `test:db` and `test:unit` as tests, alongside smoke.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test:unit`
- Lint passes: `npm run lint`
- Type check passes: `npx astro check`

#### Manual Verification:

- The test names read as the planning decisions; the cases are not tautological, because each was seen to fail when the rule was broken (for example, swapping in a team-by-team approach fails "global beats team by team").

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: App

### Overview

Service, DTOs, validation, the `zespoly` page, the entry link and smoke checks.

### Changes Required:

#### 1. DTOs

**File**: `src/types.ts`

**Intent**: Add display-ready types with no identity, in the same style as `CrisisMatchDTO`.

**Contract**:

- `TeamTemplateDTO { slug; name; roles: { slug; name; slots }[] }`
- `TeamMemberDTO`: rank, position, distanceKm, the role's qualifying `skills: { slug; name; level }[]`, hasPhone, availabilitySlots, availableNow
- `CrisisTeamDTO { number; complete; slots: { roleSlug; roleName; member: TeamMemberDTO | null }[] }`

#### 2. Validation

**File**: `src/lib/validation/crisis.ts`

**Intent**: Parse the page's query string.

**Contract**: `teamRequestSchema`:

- `szablon`: a slug matching `^[a-z-]{1,40}$`;
- `liczba`: an integer from 1 to 10, coerced from a string;
- errors carry Polish messages.

#### 3. Service

**File**: `src/lib/services/crisis.ts`

**Intent**: Read the templates, call the RPC, parse `role_skills` with zod, run `assembleTeams`, attach skill and role names, and map DB errors to Polish messages, following `activateErrorMessage` and `REVEAL_DB_ERRORS`.

**Contract**:

- `getTeamTemplates(supabase): Promise<TeamTemplateDTO[]>`, sorted by `sort` at both levels.
- `assembleCrisisTeams(supabase, crisisId, template: TeamTemplateDTO, count): Promise<{ ok: true; teams: CrisisTeamDTO[]; completeCount: number } | { ok: false; message: string; status: number; ended?: true }>`.
- Error messages:
  - `crisis_not_active` → ended;
  - `unknown_template` / `invalid_team_count` → 422;
  - `not_coordinator` → 403;
  - `unknown_crisis` → 404;
  - anything else → 500 with a generic message.
- Log no input values.

#### 4. Teams page

**File**: `src/pages/koordynator/kryzys/[id]/zespoly.astro`

**Intent**: A server-rendered GET page: the form, then the result, with the visual style of `[id].astro`. It is Astro only, with no React island, because nothing on it needs client-side interaction.

**Contract**:

- **Route and states.** The route is `/koordynator/kryzys/<uuid>/zespoly?szablon=&liczba=`. States:
  - not found (404);
  - ended (the list was deleted, no form);
  - active with no query (form only);
  - invalid query (form with a message, status 422);
  - result.
- **Result content.**
  - The header gives the template name and the count of complete teams out of the number requested.
  - The partial team, if any, is labelled "niepełny" and lists the missing roles.
  - Each member shows the same badges as the main list.
  - A short note: teams come from this crisis's list and from the residents' current skills, and declared availability does not affect who is chosen.
- **Empty result.** With zero teams, say that nobody on the list fits this template.
- **Back link.** The page links back to the crisis.

#### 5. Entry link

**File**: `src/pages/koordynator/kryzys/[id].astro`

**Intent**: Add a "Złóż zespoły" link for an active crisis, near the header, next to the break-glass block.

**Contract**: the link goes to `/koordynator/kryzys/<id>/zespoly`. Show it only when the crisis is active.

#### 6. Smoke checks

**File**: `scripts/smoke.mjs`

**Intent**: Add gate checks for the new route, mirroring the existing crisis-page checks.

**Contract**: `TEAMS_PATH = "/koordynator/kryzys/00000000-0000-0000-0000-000000000000/zespoly"`.
- An anonymous request gets 302 to `/auth/signin`.
- A resident gets the same denial as the existing "crisis page" resident check.
- Both checks also run under `SMOKE_READONLY=1` only if the existing equivalents do.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Type check passes: `npx astro check`
- Build succeeds: `npm run build`
- Unit and DB tests still pass: `npm run test:unit && npm run test:db`
- Smoke passes against the local preview: `npm run smoke`

#### Manual Verification:

- Activate a flood crisis on the local seed:
  - 3 evacuation teams give complete teams first and at most one partial team, with "brak" in each empty slot;
  - no `Osoba #N` appears twice.
- Medical point × 1 shows two different medics.
- A member's role skills shown come from their current profile. After you remove the skill on `/profil`, a re-request drops them from that role.
- An invalid `liczba=0` or `szablon=xyz` keeps the form and shows a Polish message.
- After ending the crisis, `/zespoly` shows the ended state.
- The page is usable at phone width.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- Solver cases in `src/lib/team-assembly.test.ts` (Phase 2): the multi-skilled person, global beating team by team, the partial team, no partial team, an empty pool, a multi-slot role, uniqueness, rank preference, determinism.

### Integration Tests:

- pgTAP `crisis_team_templates_test.sql`: access, exceptions, seed shape, the snapshot-only pool, current skills, the per-role bound, no `user_id`, and read-only reference tables.
- Smoke: route gating for anonymous users and residents.

### Manual Testing Steps:

1. `npx supabase db reset`, then `npm run dev`, then sign in as the seeded coordinator.
2. Activate a flood crisis in Kraków at 10 km and open "Złóż zespoły".
3. Request 3 evacuation teams, then 10. Check the complete and partial structure, and that each person appears once.
4. Request one medical point team. Check that it has two distinct medics.
5. Edit a member's skills and re-request. End the crisis and reload `/zespoly`.

## Performance Considerations

The RPC reads one crisis's `crisis_matches` (PK prefix `crisis_id`) joined to `profile_skills` and `team_role_skills`, and returns at most 120 rows. The solver runs on a graph of at most about 125 nodes, well inside the Workers Free 10 ms CPU budget. No caching: the route is `private, no-store`.

## Migration Notes

The changes are additive: new tables, seed data and one function, with no changes to existing objects. Push the Phase 1 migrations to production before the Phase 3 PR merges, the same ordering as S-09. Rolling back the Worker leaves the unused tables in place, which is harmless.

## References

- Seed spec templates: `docs/shape_not.md:103-112`
- PRD: `context/foundation/prd.md:109` (FR-014)
- Ranking RPC: `supabase/migrations/20261001120000_crisis_matching.sql:81-210`
- Current `get_crisis_matches`: `supabase/migrations/20261003120000_resident_phone_and_availability.sql:166-205`
- Prior sub-page pattern: `context/archive/2026-10-04-break-glass-contact-reveal/plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Database

#### Automated

- [x] 1.1 Migrations apply cleanly: `npx supabase db reset`
- [x] 1.2 The pgTAP suites pass, the new one and all existing ones: `npm run test:db`
- [x] 1.3 Types regenerated and type check passes: `npm run db:types && npx astro check`

#### Manual

- [x] 1.4 In Studio, the 4 templates and their role skills match `docs/shape_not.md:103-112` and the mapping above

### Phase 2: Solver

#### Automated

- [ ] 2.1 Unit tests pass: `npm run test:unit`
- [ ] 2.2 Lint passes: `npm run lint`
- [ ] 2.3 Type check passes: `npx astro check`

#### Manual

- [ ] 2.4 The test names read as the planning decisions; the cases are not tautological, because each was seen to fail when the rule was broken

### Phase 3: App

#### Automated

- [ ] 3.1 Lint passes: `npm run lint`
- [ ] 3.2 Type check passes: `npx astro check`
- [ ] 3.3 Build succeeds: `npm run build`
- [ ] 3.4 Unit and DB tests still pass: `npm run test:unit && npm run test:db`
- [ ] 3.5 Smoke passes against the local preview: `npm run smoke`

#### Manual

- [ ] 3.6 Flood crisis: 3 evacuation teams give complete teams first, at most one partial team, no duplicate `Osoba #N`
- [ ] 3.7 Medical point × 1 shows two different medics
- [ ] 3.8 Role skills come from the current profile; removing a skill drops the member from that role
- [ ] 3.9 Invalid `liczba`/`szablon` keeps the form with a Polish message
- [ ] 3.10 An ended crisis shows the ended state on `/zespoly`
- [ ] 3.11 The page is usable at phone width
