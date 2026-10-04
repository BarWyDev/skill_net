---
change_id: crisis-team-templates
title: Crisis team templates
status: archived
created: 2026-10-04
updated: 2026-10-04
archived_at: 2026-10-04T15:50:13Z
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

Roadmap S-10 (FR-014). Templates come from docs/shape_not.md:103-112.

Additions not in the plan (review F1):

- `eslint.config.js`: a `testsConfig` block turns off `@typescript-eslint/no-floating-promises` for `**/*.test.ts`, because `node:test`'s `test()` returns a promise that the runner tracks itself.
- `.claude/launch.json`: an `astro-preview` config on port 4322, so the production preview can run while another session's dev server holds 4321.

Contract narrowed from the plan (review F2):

- `get_team_candidates.role_skills` lists only the roles for which the member is within that role's top `p_teams × S` by position, not every role they qualify for. The teams are the same either way: a complete assignment uses at most `p_teams × S` people, so a role never needs anyone outside its top `p_teams × S`. The narrower rule makes the pgTAP bound test unambiguous. The function's header comment documents it.
