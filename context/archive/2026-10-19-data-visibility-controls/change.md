---
change_id: data-visibility-controls
title: Per-field, per-mode data visibility controls
status: archived
created: 2026-10-19
updated: 2026-10-19
archived_at: 2026-10-19T17:14:31Z
---

## Notes

Roadmap S-12 (FR-006), issue #13. Unblocked on 2026-10-19, when the owner accepted the visibility matrix (decisions D1–D8) in `visibility-matrix-proposal.md` in this folder. Plan: `plan.md`; brief: `plan-brief.md`.

Review F2 (2026-10-19): the contacts page shows only a count of residents who declined an emergency reveal (V4), never who. The crisis list still marks "ma telefon" per position, and the reveal returns the positions it revealed, so comparing the two gives the "Osoba #N" positions of those who declined. Positions are pseudonymous, so no identity leaks. The owner should confirm that D3 accepts this; otherwise hiding "ma telefon" for V4-off residents is a separate change.

Review F4 (2026-10-19), known cost: `crisis_visible_skills` runs once per snapshot row and is not inlined (`set search_path`). `visible_match_count` and `reveal_declined_count` each scan the whole snapshot for every crisis that `CRISIS_COLUMNS` selects. This is accepted at the expected scale. If crisis pages slow down, use a lateral join on `ps.use_in_crisis`, or compute both counts in one pass.

Review F5 (2026-10-19), for the legal review of the draft notice:
- The four choices are described in a new section of `/prywatnosc`, "Co możesz wyłączyć". The "W jakim celu" paragraph is unchanged.
- The sentence saying a number is always shared with the coordinator after a "TAK" is in the present tense, but that flow (S-08) is not built yet.
- The contacts page has small copy additions beyond the plan: "Ich numerów nie zobaczysz." and a different empty-state message when some residents declined.
- The profile form also has a help line in the skills heading and a second line in the banner.
