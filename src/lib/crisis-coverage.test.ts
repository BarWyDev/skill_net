// Crisis skill coverage summary. Run with `npm run test:unit`.

import assert from "node:assert/strict";
import { test } from "node:test";
import { joinNames, summariseCoverage } from "./crisis-coverage.ts";

test("summary: counts covered priority skills and lists the missing ones in order", () => {
  const summary = summariseCoverage([
    { name: "Sternik", tier: "priority", people: 0 },
    { name: "Łódź", tier: "priority", people: 2 },
    { name: "Pompa", tier: "priority", people: 0 },
    { name: "Elektryk", tier: "supporting", people: 0 },
    { name: "Logistyk", tier: "supporting", people: 3 },
  ]);
  assert.deepEqual(summary, {
    priorityTotal: 3,
    priorityCovered: 1,
    missingPriority: ["Sternik", "Pompa"],
    missingSupporting: ["Elektryk"],
  });
});

test("summary: an empty matrix has nothing missing", () => {
  assert.deepEqual(summariseCoverage([]), {
    priorityTotal: 0,
    priorityCovered: 0,
    missingPriority: [],
    missingSupporting: [],
  });
});

test("joinNames: one, two and three names", () => {
  assert.equal(joinNames("pl", []), "");
  assert.equal(joinNames("pl", ["sternik"]), "sternik");
  assert.equal(joinNames("pl", ["sternik", "łódź"]), "sternik i łódź");
  assert.equal(joinNames("pl", ["sternik", "łódź", "pompa"]), "sternik, łódź i pompa");
});

test("joinNames: the final word follows the language", () => {
  assert.equal(joinNames("en", ["boatman", "boat", "pump"]), "boatman, boat and pump");
  assert.equal(joinNames("uk", ["стерновий", "човен", "помпа"]), "стерновий, човен і помпа");
});
