// Data visibility controls (roadmap S-12). Run with `npm run test:unit`.

import assert from "node:assert/strict";
import { test } from "node:test";

import { declinedVerb, parseSwitch, revealCounts, withCrisisUse } from "./visibility.ts";

test("a switch is on for 1, off for 0, unchanged when missing and invalid otherwise", () => {
  assert.equal(parseSwitch("1"), true);
  assert.equal(parseSwitch("0"), false);
  assert.equal(parseSwitch(null), null);
  assert.equal(parseSwitch("on"), undefined);
  assert.equal(parseSwitch(""), undefined);
});

test("skills listed as crisis-off are marked, the rest stay in crisis use", () => {
  const skills = [
    { slug: "elektryk", level: 2 },
    { slug: "agregat-pradotworczy", level: null },
  ];
  assert.deepEqual(withCrisisUse(skills, ["agregat-pradotworczy"]), [
    { slug: "elektryk", level: 2, crisis: true },
    { slug: "agregat-pradotworczy", level: null, crisis: false },
  ]);
  assert.deepEqual(withCrisisUse(skills, []), [
    { slug: "elektryk", level: 2, crisis: true },
    { slug: "agregat-pradotworczy", level: null, crisis: true },
  ]);
});

test("a crisis-off skill that was not submitted is rejected", () => {
  assert.equal(withCrisisUse([{ slug: "elektryk" }], ["lekarz"]), null);
});

test("after a reveal the counts add up to the match count", () => {
  assert.deepEqual(revealCounts(10, 6, 3), { declined: 3, withoutPhone: 1 });
  assert.deepEqual(revealCounts(5, 5, 0), { declined: 0, withoutPhone: 0 });
});

test("the counts are floored at 0 when the count and the reveal disagree", () => {
  assert.deepEqual(revealCounts(4, 5, 0), { declined: 0, withoutPhone: 0 });
  assert.deepEqual(revealCounts(5, 4, 3), { declined: 1, withoutPhone: 0 });
});

test("the declined verb agrees with the Polish plural", () => {
  assert.equal(declinedVerb(1), "nie zgodziła się");
  assert.equal(declinedVerb(2), "nie zgodziły się");
  assert.equal(declinedVerb(4), "nie zgodziły się");
  assert.equal(declinedVerb(5), "nie zgodziło się");
  assert.equal(declinedVerb(12), "nie zgodziło się");
  assert.equal(declinedVerb(22), "nie zgodziły się");
});
