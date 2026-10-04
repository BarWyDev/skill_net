// Team assembly rules (roadmap S-10), one case per planning decision.
// Run with `npm run test:unit`.

import assert from "node:assert/strict";
import { test } from "node:test";

import { assembleTeams, type AssembledTeam, type TeamCandidateInput, type TeamRoleSpec } from "./team-assembly.ts";

const EVACUATION: TeamRoleSpec[] = [
  { slug: "medyk", slots: 1 },
  { slug: "osoba-silna", slots: 1 },
  { slug: "kierowca", slots: 1 },
];
const MEDICAL_POINT: TeamRoleSpec[] = [
  { slug: "medyk", slots: 2 },
  { slug: "logistyk", slots: 1 },
];
const AB: TeamRoleSpec[] = [
  { slug: "A", slots: 1 },
  { slug: "B", slots: 1 },
];

function person(position: number, ...roles: string[]): TeamCandidateInput {
  return { position, roles };
}

/** Each team as `role:#position` per slot, `role:-` for an empty slot, with a `*` for a partial team. */
function layout(teams: AssembledTeam<TeamCandidateInput>[]): string[] {
  return teams.map(
    (team) =>
      (team.complete ? "" : "*") +
      team.slots.map((slot) => `${slot.role}:${slot.candidate ? `#${slot.candidate.position}` : "-"}`).join(" "),
  );
}

test("multi-skilled person: takes the role only they can fill", () => {
  const result = assembleTeams(
    EVACUATION,
    [person(1, "medyk", "kierowca"), person(2, "medyk"), person(3, "osoba-silna")],
    1,
  );

  assert.equal(result.completeCount, 1);
  assert.deepEqual(layout(result.teams), ["medyk:#2 osoba-silna:#3 kierowca:#1"]);
});

test("global beats team by team: two complete teams where a greedy first team leaves the second short", () => {
  const result = assembleTeams(AB, [person(1, "A", "B"), person(2, "A", "B"), person(3, "A"), person(4, "A")], 2);

  assert.equal(result.completeCount, 2);
  assert.ok(result.teams.every((team) => team.complete));
  assert.deepEqual(layout(result.teams), ["A:#3 B:#1", "A:#4 B:#2"]);
});

test("partial: the complete teams come first, then one partial team with its missing role empty", () => {
  const pool = [
    person(1, "medyk"),
    person(2, "medyk"),
    person(3, "medyk"),
    person(4, "osoba-silna"),
    person(5, "osoba-silna"),
    person(6, "kierowca"),
    person(7, "kierowca"),
    person(8, "kierowca"),
  ];
  const result = assembleTeams(EVACUATION, pool, 3);

  assert.equal(result.completeCount, 2);
  assert.deepEqual(layout(result.teams), [
    "medyk:#1 osoba-silna:#4 kierowca:#6",
    "medyk:#2 osoba-silna:#5 kierowca:#7",
    "*medyk:#3 osoba-silna:- kierowca:#8",
  ]);
});

test("no partial when the request is met: exactly the requested complete teams", () => {
  const pool = [1, 2, 3].flatMap((i) => [
    person(i, "medyk"),
    person(10 + i, "osoba-silna"),
    person(20 + i, "kierowca"),
  ]);
  const result = assembleTeams(EVACUATION, pool, 2);

  assert.equal(result.completeCount, 2);
  assert.equal(result.teams.length, 2);
  assert.ok(result.teams.every((team) => team.complete));
});

test("empty or useless pool: no teams at all", () => {
  assert.deepEqual(assembleTeams(EVACUATION, [], 3), { teams: [], completeCount: 0 });
  assert.deepEqual(assembleTeams(EVACUATION, [person(1, "elektryk"), person(2, "logistyk")], 3), {
    teams: [],
    completeCount: 0,
  });
});

test("multi-slot role: a medical point gets two distinct medics", () => {
  const result = assembleTeams(MEDICAL_POINT, [person(1, "medyk"), person(2, "medyk"), person(3, "logistyk")], 1);

  assert.equal(result.completeCount, 1);
  assert.deepEqual(layout(result.teams), ["medyk:#1 medyk:#2 logistyk:#3"]);
});

test("uniqueness: no candidate fills two slots across all teams", () => {
  // A fixed pseudo-random pool: each person holds one to three of the evacuation roles.
  let seed = 7;
  const next = () => (seed = (seed * 48271) % 2147483647);
  const pool = Array.from({ length: 40 }, (_, i) =>
    person(i + 1, ...EVACUATION.map((role) => role.slug).filter((_, r) => next() % 3 === 0 || r === i % 3)),
  );
  const result = assembleTeams(EVACUATION, pool, 10);
  const members = result.teams.flatMap((team) =>
    team.slots.flatMap((slot) => (slot.candidate ? [slot.candidate] : [])),
  );

  assert.ok(result.completeCount > 0);
  assert.equal(new Set(members).size, members.length);
  for (const team of result.teams) {
    for (const slot of team.slots) {
      if (slot.candidate) assert.ok(slot.candidate.roles.includes(slot.role));
    }
  }
});

test("rank preference: of two complete splits, the lower sum of positions wins", () => {
  // Filling A with its best person (#1) leaves only #5 for B (sum 6); #2 on A and #1 on B is 3.
  const result = assembleTeams(AB, [person(1, "A", "B"), person(2, "A"), person(5, "B")], 1);

  assert.deepEqual(layout(result.teams), ["A:#2 B:#1"]);
});

test("rank preference: team 1 holds the best-positioned person of every role", () => {
  const pool = [person(9, "kierowca"), person(3, "medyk"), person(1, "osoba-silna"), person(2, "kierowca")];
  pool.push(person(4, "medyk"), person(8, "osoba-silna"));
  const result = assembleTeams(EVACUATION, pool, 2);

  assert.deepEqual(layout(result.teams), [
    "medyk:#3 osoba-silna:#1 kierowca:#2",
    "medyk:#4 osoba-silna:#8 kierowca:#9",
  ]);
});

test("determinism: the same input gives the same teams, whatever the input order", () => {
  const pool = [
    person(1, "medyk", "kierowca"),
    person(2, "medyk", "osoba-silna"),
    person(3, "osoba-silna", "kierowca"),
    person(4, "medyk", "osoba-silna", "kierowca"),
    person(5, "kierowca"),
  ];
  const first = assembleTeams(EVACUATION, pool, 2);

  assert.deepEqual(assembleTeams(EVACUATION, pool, 2), first);
  assert.deepEqual(assembleTeams(EVACUATION, [...pool].reverse(), 2), first);
});
