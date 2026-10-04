<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Break-glass Contact Reveal

- **Plan**: context/changes/break-glass-contact-reveal/plan.md
- **Scope**: Full plan (Phases 1–2 of 2)
- **Date**: 2026-10-04
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 4 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | FAIL    |

Notes: the security core holds. The RPC is hardened (`security definer`, `search_path = ''`, its own `is_coordinator()` check). The audit tables have no client access. Every refusal is raised before the audit insert. `FOR SHARE` serialises the reveal against `end_crisis`. Astro 7.3.2's default `checkOrigin` covers the POST to the `.astro` page. There is no `console.*` and no `Cache-Control` override. Handling the POST inside the `.astro` page is justified: an API route would have to redirect and so leak the numbers. The benign extras are the `ended` flag on the result, the "Anuluj" link and the per-row "zweryfikowany" label; all serve the plan's intent. `astro check`, `lint` and `build` pass. `test:db` fails (see F1). Smoke passed before the commits, and no code changed after it.

## Findings

### F1 — pgTAP reveal suite not isolated from existing audit rows

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: supabase/tests/break_glass_contact_reveal_test.sql:15-17, 160-163, 219-223
- **Detail**: `npm run test:db` now fails: tests 11 and 19 fail, and line 233 errors with "more than one row returned". The suite asserts global counts on `contact_reveal_events` and `contact_reveal_subjects`. It clears `profiles` from the seed but not the audit tables. The plan's own manual step 2.8 left one audit event in the local database, so the suite stops passing after the very manual check the plan prescribes. CI resets the database, so CI still passes.
- **Fix**: Delete both audit tables in the fixtures, next to `delete from public.profiles` (rolled back with the test).
- **Decision**: FIXED — fixtures now clear both audit tables; `npm run test:db` passes again

### F2 — A zod parse failure after a logged reveal hides the numbers and invites a duplicate reveal

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/crisis.ts:203-217, src/pages/koordynator/kryzys/[id]/kontakty.astro:65
- **Detail**: Once the RPC returns, the reveal is already logged. `toSkills` (`matchedSkillsSchema.parse`) and the two availability `.parse` calls can still throw. The page's `catch` then shows "Spróbuj ponownie" ("try again"). The coordinator sees no numbers, and a retry writes a second audit event. The code already guards the skill-name lookup for exactly this reason, but not the parses.
- **Fix**: Use `safeParse` with fallbacks (`skills: []`, `availabilitySlots: null`, `availableNow: null`), so that a logged reveal always renders its numbers.
- **Decision**: FIXED — `revealCrisisContacts` uses `safeParse` with fallbacks (skills `[]`, availability `null`) after the RPC

### F3 — The audit can overstate what was shown (two reads of `profile_contacts`)

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261004120000_break_glass_contact_reveal.sql:102-128
- **Detail**: The subjects insert and the return query are separate statements under READ COMMITTED, so each takes its own snapshot of `profile_contacts`. If a resident deletes their phone between the two, they are logged and counted in `revealed_count` but not shown. If they change it, the newer number is shown. What is returned is always a subset of what is logged, so no number escapes the log. The log can still overstate the exposure by a race window of milliseconds.
- **Fix A ⭐ Recommended**: Read the matches and phones once, in a single data-modifying CTE (`with rows as (select …), ins as (insert … select from rows) select … from rows`), and return from it.
  - Strength: The logged set equals the shown set exactly, including the phone value. This is the plan's own invariant ("the log never disagrees with what was shown").
  - Tradeoff: It restructures the function body and needs a migration edit. That is fine, since the migration is unreleased beyond the pushed production DB. A pushed migration can't be edited, so this needs a follow-up `create or replace` migration.
  - Confidence: MED — the CTE pattern is standard; whether production has the migration needs confirming.
  - Blind spot: Production was already pushed in Phase 1 (1.7), so a new migration file is required, not an edit.
- **Fix B**: Accept it and document the overstatement in the migration header.
  - Strength: No code change. The error direction is conservative: the log may overstate exposure but never understate it.
  - Tradeoff: `revealed_count` and the subject rows can exceed what the coordinator saw.
  - Confidence: HIGH — the window is tiny and the direction is safe.
  - Blind spot: How a DPO would read an overstated access log.
- **Decision**: FIXED via Fix A — follow-up migration `20261004130000_reveal_contacts_single_snapshot.sql` reads matches and numbers once in one CTE that drives the subject insert, `revealed_count` and the returned rows. Applied locally; `test:db` passes; grants and owner unchanged; generated types unchanged. **Must be pushed to production (`npx supabase db push`) before the PR merges.**

### F4 — An unbounded reveal can exceed the Workers Free CPU limit after it is logged

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/koordynator/kryzys/[id]/kontakty.astro:44, migration :113
- **Detail**: The result has no cap by design, as the plan decided. Each row renders a full card. On the Workers Free plan (10 ms CPU), a dense crisis with 1000+ numbers could fail during render after the audit row is written, giving the same "logged but not seen" outcome as F2. The plan's Performance section mentions page size but not the CPU limit.
- **Fix**: Add this to the plan's risks and the plan brief's Open Risks, and tie it to the existing "upgrade to Paid before crisis mode" item. Leave the code unchanged.
  - Strength: The Paid upgrade is already a pre-pilot requirement (CLAUDE.md, roadmap Q10). It removes the limit without weakening the "all matched" decision.
  - Tradeoff: Documentation only; the risk stays real until the upgrade happens.
  - Confidence: MED — the 10 ms budget for rendering ~1000 rows is not measured.
  - Blind spot: There is no render benchmark at 1000+ rows.
- **Decision**: FIXED — risk documented in plan.md (Performance Considerations) and plan-brief.md (Open Risks), tied to the Paid-plan prerequisite; no code change

### F5 — The test privilege matrix is incomplete

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: supabase/tests/break_glass_contact_reveal_test.sql:278-308
- **Detail**: The plan asks for select, insert, update and delete on both tables. The tests skip events delete, subjects insert and subjects update. `revoke all` covers these anyway.
- **Fix**: Add the three missing `throws_ok … '42501'` cases and bump `plan()`.
- **Decision**: FIXED — added events delete, subjects insert and subjects update `throws_ok 42501` cases; `plan(37)`; `test:db` passes

### F6 — The crisis page info sentence drifted from the plan

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/pages/koordynator/kryzys/[id].astro:111-112
- **Detail**: The plan wanted the info box to say that numbers can be revealed only through the logged break-glass action. The sentence now says only "domyślnie ukryte" ("hidden by default"), and the logging point lives in the new red callout directly below it. The meaning is preserved and only the placement differs.
- **Fix**: Accept it as an equivalent implementation (no change).
- **Decision**: ACCEPTED — meaning preserved: the logged-reveal point is in the red callout directly below the info sentence

### F7 — Non-field reveal errors return status 200

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/koordynator/kryzys/[id]/kontakty.astro:62-68
- **Detail**: A generic RPC failure, `not_coordinator` or `unknown_crisis`, re-renders the form with status 200. A 4xx or 5xx status would make failed reveals visible in Workers logs and `wrangler tail --status error` without logging any personal data.
- **Fix**: Set 500 for the generic failure and the `catch` branch, 403 for `not_coordinator`, and 404 for `unknown_crisis`.
- **Decision**: FIXED — reveal failures carry an HTTP status: 403 not_coordinator, 404 unknown_crisis, 422 reason errors, 500 generic or thrown; the ended note stays 200

### F8 — `aria-label` on a plain span is ignored

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/koordynator/kryzys/[id]/kontakty.astro:203 (copied from src/pages/koordynator/kryzys/[id].astro)
- **Detail**: Most screen readers ignore `aria-label` on a `<span>` with no role, so "Miejsce N" ("place N") is never announced. The crisis page has the same pattern, which predates this change.
- **Fix**: Use an `sr-only` span ("Miejsce ") before the visible number, in both pages.
- **Decision**: FIXED — `aria-label` on the rank span replaced with an `sr-only` "Miejsce " prefix in kontakty.astro and [id].astro
