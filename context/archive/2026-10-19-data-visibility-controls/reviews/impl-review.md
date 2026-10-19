<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Data Visibility Controls

- **Plan**: context/changes/data-visibility-controls/plan.md
- **Scope**: Phases 1–2 of 2 (full plan)
- **Date**: 2026-10-19
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 1 warning, 5 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

Automated checks re-run on 2026-10-19 on branch `feat/data-visibility-controls`:
- `npm run test:unit`: 77/77 pass.
- `npm run test:db`: 20 files, 563 tests, PASS.
- `npm run lint`: clean.
- `npx astro check`: 0 errors.
- `astro build` into a scratch outDir: complete.

`npx supabase db reset` was not re-run because the local database is shared with other sessions; it passed at 34c45b0. Smoke was not re-run. Its sign-in assertion ("new user → /profil", `scripts/smoke.mjs:243`) still holds under the new rule. Production already has migration 20261019120000, so the deploy-order risk is resolved.

Every replaced SQL function body was diffed against its previous definition. The only differences are the ones the plan asks for. Neither reviewer found a way around V4 (no number revealed or logged), V2 (no hidden resident shown in the list, teams, reveal or counts) or V3 (`available_now` and ordering don't leak).

## Findings

### F1 — Code rollback silently re-enables hidden skills

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261019120000_data_visibility_controls.sql:717-721
- **Detail**: `save_my_profile` deletes and re-inserts `profile_skills`. A skill sent without a `crisis` key becomes `use_in_crisis = true`. The code on master before this PR sends no `crisis` keys. If the app is rolled back (`wrangler rollback`, or a revert) while the migration stays, every profile save turns all of that resident's hidden skills back on. Nothing tells the resident, and those skills reappear in new crises. V1/V3/V4 are safe, because null keeps the stored value. Only V2 is affected.
- **Fix A ⭐ Recommended**: Document it in the plan's Migration Notes and the PR description: a code rollback is not V2-safe; roll forward instead.
  - Strength: No new SQL. A rollback is a rare, deliberate act, so a runbook note reaches the person doing it.
  - Tradeoff: The hazard remains. It depends on someone reading the note.
  - Confidence: MED — it fits how this repo handles other rollback caveats (CLAUDE.md "doesn't undo migrations").
  - Blind spot: Any future client that omits `crisis` keys (S-07/S-08 tooling) would hit the same reset.
- **Fix B**: Make a missing key mean "keep the stored value": read the existing `use_in_crisis` before the delete and fall back to it, and to true only for new skills.
  - Strength: Removes the hazard at the source and matches the "null = unchanged" rule already used for the three profile switches.
  - Tradeoff: A new migration, because 20261019120000 is already on production, plus pgTAP cases. A skill removed and re-added in one save keeps its old flag.
  - Confidence: HIGH — a small, local change inside one function.
  - Blind spot: The migration has to be pushed to production again before merge.
- **Decision**: FIXED (Fix A): rollback caveat added to the plan's Migration Notes and the PR #93 description

### F2 — Declined positions are inferable, so the code comment overstates D3

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/koordynator/kryzys/[id]/kontakty.astro:81
- **Detail**: The comment says "Declined (V4) is a count only: never who, never a position". But the crisis list shows `hasPhone` for each position ("ma telefon", per plan V4), and the reveal returns the positions it revealed. Comparing the two gives the "Osoba #N" positions of the residents who declined. Positions are pseudonymous, so no identity leaks. The plan's matrix itself keeps "ma telefon" on the list, so this is a property of the design, not of the implementation.
- **Fix**: Correct the comment to "count only: never who". Record in the change notes that positions can be derived from the list's phone marker, so the owner can confirm D3 accepts it.
  - Strength: The code describes the real guarantee, and the decision stays with the owner.
  - Tradeoff: If the owner rejects it, hiding "ma telefon" for V4-off residents is a separate change.
  - Confidence: HIGH — both data sources were checked.
  - Blind spot: The exact wording of D3 in visibility-matrix-proposal.md has not been re-read against this case.
- **Decision**: FIXED: comment corrected in kontakty.astro; inference noted in change.md for owner confirmation under D3

### F3 — Test-coverage gaps beyond the plan's minimum

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: supabase/tests/data_visibility_controls_test.sql:331-340, 362-380
- **Detail**: Every bullet in §7 is covered. Still missing:
  - After V2 is turned back on, only the list is re-checked. Teams and reveal are not.
  - No test shows that `reveal_declined_count` excludes residents without a phone, paused residents and V2-hidden residents.
  - The privilege test does not check `anon` on `crisis_visible_skills` and `profile_counts_on_map`.
  - The teams case relies on `narzedzia-reczne` mapping to a role without asserting it.
- **Fix**: Add those assertions to the suite and bump `plan()`.
- **Decision**: FIXED: suite now plan(57). It covers teams and reveal after V2/V4 are restored (this also asserts the hand-tools role mapping), `reveal_declined_count` excluding hidden, phoneless and paused residents who declined, and anon on both helpers. `npm run test:db` passes

### F4 — `crisis_visible_skills` evaluated per snapshot row

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261019120000_data_visibility_controls.sql:394, 473, 625, 656
- **Detail**: The function has `set search_path`, so Postgres doesn't inline it. It runs once per row: in the `get_crisis_matches` WHERE clause, before the limit, and again in `visible_match_count` and `reveal_declined_count` for every crisis that `CRISIS_COLUMNS` selects. That is two full snapshot scans per crisis on list pages. The cost stays in the database, not in Worker CPU, and is fine at the expected size (a few thousand rows). The plan's performance note assumed 200 rows, but the count functions scan the whole snapshot.
- **Fix**: Accept for now. If crisis pages slow down, replace it with a lateral join on `ps.use_in_crisis`, or compute both counts in one pass.
- **Decision**: ACCEPTED: recorded as a known cost in change.md, with the optimisation path

### F5 — Privacy-notice placement, wording and copy extras

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence / Scope Discipline
- **Location**: src/pages/prywatnosc.astro:64-89; src/pages/koordynator/kryzys/[id]/kontakty.astro:133-138, 198-202
- **Detail**:
  - The plan said to edit the "W jakim celu" and phone paragraphs. The choices went into a new "Co możesz wyłączyć" section instead, and "W jakim celu" was left as is.
  - The sentence about sharing a number after "TAK" is in the present tense, but S-08 isn't built. The plan asked for the sentence, but the legal review should know it describes a future feature.
  - Small additions beyond the plan's copy: "Ich numerów nie zobaczysz.", a different empty-state message when some residents declined, a help line in the skills heading, and a second line in the banner.
  - All of it fits the plan's intent.
- **Fix**: Note the placement, the extras and the future-tense caveat in change.md, so the legal review of the draft notice sees them.
- **Decision**: FIXED: placement, present-tense TAK caveat and copy extras noted in change.md for the legal review

### F6 — `database.types.ts` hand-edited instead of regenerated

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/db/database.types.ts
- **Detail**: The plan says to run `npm run db:types`. Supabase CLI 2.120 rewrites the whole file in a new format, with semantic changes unrelated to this change, so the edits were made by hand and documented in the 34c45b0 commit. The result matches the schema. The new `reveal_declined_count` Functions entry has the same error-shaped type that `visible_match_count` already has.
- **Fix**: Accept. Regenerating with the new CLI format belongs in its own change.
- **Decision**: ACCEPTED: hand-edited types documented in 34c45b0; regenerating in the CLI 2.120 format is a separate change
