---
project: SkillNet
created: 2026-09-26
updated: 2026-09-26
source: context/foundation/roadmap.md
milestone_id: pilot-ready-crisis-matching
tracker: GitHub Issues (BarWyDev/skill_net)
---

# GitHub Tasks: SkillNet

> How `context/foundation/roadmap.md` maps onto GitHub Issues, and how to keep the two in sync.
> Edit-in-place when the tracker format changes or a new milestone is migrated.

## Summary

On 2026-09-26, milestone M-1 from `roadmap.md` became **26 GitHub issues** in https://github.com/BarWyDev/skill_net:

- **14 slice issues** (`[S-01]` … `[S-14]`): #2 – #15
- **12 open-question issues** (`[Q-01]` … `[Q-12]`): #16 – #27
- all 26 in the milestone **M-1: Pilot-ready crisis matching** (https://github.com/BarWyDev/skill_net/milestone/1)
- **18 native "Blocked by" relationships** between them

Numbering starts at #2 because #1 is an earlier PR ("Test: Workers Builds preview").

`roadmap.md` stays the source of truth for scope, ordering and rationale. GitHub is where the work is tracked day to day. The link runs both ways: each issue cites its roadmap ID, and the roadmap's **Backlog Handoff** table has an `Issue` column.

## Decisions

| Decision              | Choice                                   | Why                                                                                                                                                    |
| --------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tracker               | GitHub Issues + milestone + labels       | Works with the existing `gh` token (`repo` scope).                                                                                                     |
| GitHub Project board  | **Not created**                          | The token lacks the `project` scope. Adding it needs `gh auth refresh -s project`, run by a human in their own terminal (it requires a browser login). |
| What becomes an issue | Slices **and** open roadmap questions    | Open questions are real work items (decisions) and several of them block slices.                                                                       |
| Parked items          | **Not migrated**                         | They stay in the roadmap's `## Parked` section; they are out of the milestone scope.                                                                   |
| External blockers     | Kept as text, not separate issues        | Workers Paid upgrade and the SMS provider account are human-only actions; they are tracked through Q-10 and Q-04 and each slice's **Blockers** field.  |
| Dependencies          | GitHub native "Blocked by" relationships | They appear in each issue's sidebar and survive body edits. Bodies also carry `#N` cross-links for readability.                                        |
| Language              | English                                  | Same as `roadmap.md`.                                                                                                                                  |

## Format

### Milestone

- **Title:** `M-1: Pilot-ready crisis matching`
- **Description:** the milestone Intent from the roadmap, "Done when: every S-NN issue in this milestone is closed", the scope anchors, and the source path.
- The milestone is done when all slice issues are closed. Question issues belong to it too, but they don't gate it.

### Labels

| Label                       | Colour    | Applied to                                |
| --------------------------- | --------- | ----------------------------------------- |
| `slice`                     | `#1d76db` | every S-NN issue                          |
| `status:ready`              | `#0e8a16` | slices whose roadmap status is `ready`    |
| `status:proposed`           | `#bfd4f2` | slices whose roadmap status is `proposed` |
| `status:blocked`            | `#b60205` | slices whose roadmap status is `blocked`  |
| `stream:A-crisis-core`      | `#5319e7` | Stream A: S-01, S-02, S-03, S-04, S-10    |
| `stream:B-alerts`           | `#8a63d2` | Stream B: S-06, S-07, S-08, S-09          |
| `stream:C-resident-control` | `#c5b3f0` | Stream C: S-05, S-11, S-12, S-13, S-14    |
| `north-star`                | `#fbca04` | S-03 only                                 |
| `question` (GitHub default) | —         | every Q-NN issue                          |

Each slice gets its stream from the first chain in the roadmap's **Streams** table that lists it. S-01 therefore sits in Stream A, even though Stream C also starts from it.

### Slice issue

- **Title:** `[S-NN] <Suggested issue title from the Backlog Handoff table>`
- **Body** (text copied verbatim from the roadmap slice):

```markdown
> <slice heading from roadmap>

**Outcome:** …

**Change ID:** `<change-id>`
**PRD refs:** …
**Stream:** <A|B|C> — <theme>
**Prerequisites:** S-0x (#N), …, plus any external prerequisite as text
**Blocked by open questions:** Q-NN (#N) (only where applicable)
**Parallel with:** S-0x (#N), …
**Blockers:** …

### Unknowns

- [ ] <unknown> — Owner: user. Block: yes|no.

### Risk

…

### Next step

Ready for `/10x-plan`: **yes** — run `/10x-plan <change-id>`.
(or) Ready for `/10x-plan`: **no** — <Notes from the Backlog Handoff table>.

---

Source: `context/foundation/roadmap.md` (M-1, S-NN). Roadmap status at migration: `<status>`.
```

### Question issue

- **Title:** `[Q-NN] <question>`. Backticks are stripped, because issue titles don't render markdown.
- **Body:** the question, its context sentence, the `Owner` and `Block` lines, **Blocks:** (the slices it formally blocks), **Related slices:** (other slices it mentions), a note to update `roadmap.md` (and the PRD, if scope changes) once it is answered, and the source reference.

## Issue map

### Slices

| Roadmap ID | Issue | Change ID                       | Labels                                                   | Blocked by                       | Ready for `/10x-plan` |
| ---------- | ----- | ------------------------------- | -------------------------------------------------------- | -------------------------------- | --------------------- |
| S-01       | #2    | resident-skills-profile         | slice, status:ready, stream:A-crisis-core                | —                                | yes                   |
| S-02       | #3    | coordinator-role-grant          | slice, status:ready, stream:A-crisis-core                | —                                | yes                   |
| S-03       | #4    | crisis-activation-ranked-list   | slice, status:proposed, stream:A-crisis-core, north-star | #2 (S-01), #3 (S-02), #17 (Q-02) | no                    |
| S-04       | #5    | crisis-deactivation             | slice, status:proposed, stream:A-crisis-core             | #4 (S-03)                        | no                    |
| S-05       | #6    | verified-sign-up-with-consent   | slice, status:ready, stream:C-resident-control           | #26 (Q-11)                       | yes                   |
| S-06       | #7    | resident-phone-and-availability | slice, status:proposed, stream:B-alerts                  | #2 (S-01)                        | no                    |
| S-07       | #8    | crisis-sms-alert-confirmation   | slice, status:blocked, stream:B-alerts                   | #4, #7, #19 (Q-04), #25 (Q-10)   | no                    |
| S-08       | #9    | live-operational-list           | slice, status:proposed, stream:B-alerts                  | #8 (S-07)                        | no                    |
| S-09       | #10   | break-glass-contact-reveal      | slice, status:proposed, stream:B-alerts                  | #4 (S-03), #7 (S-06)             | no                    |
| S-10       | #11   | crisis-team-templates           | slice, status:proposed, stream:A-crisis-core             | #4 (S-03)                        | no                    |
| S-11       | #12   | public-skills-density-map       | slice, status:proposed, stream:C-resident-control        | #2 (S-01)                        | no                    |
| S-12       | #13   | data-visibility-controls        | slice, status:blocked, stream:C-resident-control         | #7 (S-06)                        | no                    |
| S-13       | #14   | pause-availability              | slice, status:proposed, stream:C-resident-control        | #2 (S-01)                        | no                    |
| S-14       | #15   | unregister-and-erase            | slice, status:proposed, stream:C-resident-control        | #2 (S-01)                        | no                    |

S-12 is `status:blocked` by an undecided visibility matrix (an unknown inside the slice), not by another issue, so its only "Blocked by" link is S-06.

### Open questions

| Roadmap Q | Issue | Question (short)                                         | Formally blocks | Related slices               |
| --------- | ----- | -------------------------------------------------------- | --------------- | ---------------------------- |
| Q-01      | #16   | MVP timeline budget (`mvp_weeks`)                        | —               | —                            |
| Q-02      | #17   | N in the Primary success criterion                       | S-03 (#4)       | —                            |
| Q-03      | #18   | Cold start                                               | —               | S-03                         |
| Q-04      | #19   | Target scale (`qps`, `data_volume`)                      | S-07 (#8)       | —                            |
| Q-05      | #20   | User stories for resident and operator flows             | —               | S-05, S-06, S-12, S-13, S-14 |
| Q-06      | #21   | What an unauthenticated visitor sees at a gated route    | —               | S-02                         |
| Q-07      | #22   | Additional non-goals                                     | —               | —                            |
| Q-08      | #23   | Shaping quality cross-check never ran                    | —               | —                            |
| Q-09      | #24   | Parallel incidents, alert limits, per-municipality rules | —               | —                            |
| Q-10      | #25   | When production moves to Workers Paid                    | S-07 (#8)       | —                            |
| Q-11      | #26   | Own domain and email-sending provider                    | S-05 (#6)       | —                            |
| Q-12      | #27   | What the pilot council's DPO accepts for data processing | —               | S-07, S-08, S-09             |

Only questions whose roadmap `Block:` field names a slice's planning or acceptance got a formal "Blocked by" link. The rest (Q-03, Q-05, Q-06 and Q-12) block the pilot or feedback sessions rather than implementation, so they only list related slices in their body.

## Where to start

- **Plannable now:** S-01 (#2) and S-02 (#3). They are the entry to the north star, S-03 (#4).
- **Start the lead time early:** S-05 (#6) is plannable, but it needs Q-11 (#26), an own domain and email provider, answered before real users can sign up.
- **Decisions needed:** Q-02 (#17) before S-03 acceptance; Q-04 (#19) and Q-10 (#25) before S-07; and the SMS-provider unknown inside S-07 (#8).

## Keeping GitHub and the roadmap in sync

| Event                                   | In GitHub                                                               | In `roadmap.md`                                                                    |
| --------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| A slice's prerequisites close           | Swap `status:proposed` / `status:blocked` for `status:ready`            | Set the slice's **Status** to `ready`; update Backlog Handoff                      |
| A slice starts (`/10x-new <change-id>`) | Reference the issue from the change folder and the PR (`Closes #N`)     | —                                                                                  |
| A slice ships                           | The PR merge closes the issue                                           | Set **Status** to `done`                                                           |
| A question is answered                  | Record the answer in a comment, then close the issue                    | Remove or resolve it under Open Roadmap Questions; update the PRD if scope changes |
| A new slice or question appears         | Create it with the same title prefix, labels, milestone and body format | Add it to the roadmap first; the roadmap stays the source of truth                 |
| All slice issues are closed             | Close milestone M-1                                                     | Close the milestone via `/10x-roadmap`                                             |

Status labels don't update themselves. Changing a slice's status means editing the label by hand:

```bash
gh issue edit 4 --remove-label status:proposed --add-label status:ready
```

## How the migration was run

This is for reference and for re-running it on the next milestone. The script lived in the session scratchpad (`migrate-roadmap.mjs`), which is temporary; it is **not** in the repo.

1. **Inspected the repo:** `gh auth status` (logged in as BarWyDev with `repo`, `workflow`, `gist`, `read:org` scopes), `gh label list` (defaults only), no milestones, no issues. `gh project list` failed without the `read:project` scope.
2. **Parsed `roadmap.md`** (a Node script, no hand-copied text) into a model:
   - the `### S-NN` sections, reading each `- **Field:** value` line and the nested unknowns
   - the Backlog Handoff table (titles, ready flag, notes)
   - the Streams table (stream per slice)
   - the Open Roadmap Questions list (question, context, `Owner`, `Block`)
   - The script aborts unless it finds exactly 14 slices and 12 questions.
3. **Dry run:** rendered every title, label set and body to a file and reviewed it. This caught three parsing bugs, all fixed before anything was written to GitHub:
   - Q-02 lost its Owner/Block split.
   - `US-01` was mis-read as the slice `S-01`.
   - A blank line was missing before "Related slices".
4. **Created the labels** with `gh label create … --force` (idempotent) and the milestone with `gh api repos/BarWyDev/skill_net/milestones` (skipped if it already exists).
5. **Pass 1:** created the issues in roadmap order with `gh issue create --title --body-file --label --milestone`. Any issue whose `[S-NN]`/`[Q-NN]` title prefix already existed was skipped. The script saved each roadmap ID with its issue number and numeric issue `id`.
6. **Pass 2:**
   - Re-rendered every body with `S-NN (#N)` cross-links (`gh issue edit --body-file`).
   - Added the "Blocked by" relationships through the REST API, skipping any that already existed:

   ```bash
   gh api -X POST repos/BarWyDev/skill_net/issues/<blocked-number>/dependencies/blocked_by -F issue_id=<blocker-numeric-id>
   ```

   The API needs the blocker's numeric `id` (from `gh api repos/BarWyDev/skill_net/issues/<n> --jq .id`), not its issue number.

7. **Updated `roadmap.md`:** added the `Issue` column to the Backlog Handoff table and formatted the file with Prettier.

## Verification (2026-09-26)

- `gh issue list --milestone "M-1: Pilot-ready crisis matching" --limit 50` returned 26 issues.
- `gh issue list --label status:blocked` returned S-07 and S-12; `--label north-star` returned S-03.
- `gh api repos/BarWyDev/skill_net/issues/4/dependencies/blocked_by --jq '.[].title'` returned S-01, S-02 and Q-02.
- S-07 (#8) looked right in the browser: body, labels, milestone, `#N` links and "Blocked by 4" in the sidebar.

## Useful commands

```bash
gh issue list --milestone "M-1: Pilot-ready crisis matching"
```

```bash
gh issue list --label status:ready --label slice
```

```bash
gh issue list --label question --state open
```

```bash
gh api repos/BarWyDev/skill_net/issues/8/dependencies/blocked_by --jq '.[].title'
```

## Possible next steps

- Add a Project board: first run `gh auth refresh -s project`, then add the 26 issues to a board with Status and Stream fields.
- Save the migration script under `scripts/` if later milestones should be migrated the same way.
