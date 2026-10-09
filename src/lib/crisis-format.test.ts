// Crisis display formatting. Run with `npm run test:unit`.

import assert from "node:assert/strict";
import { test } from "node:test";

import { formatCrisisTitle, formatPeople, matchedWord } from "./crisis-format.ts";

test("the adjective agrees with the number (QA-025)", () => {
  const phrase = (n: number) => `${formatPeople(n)} ${matchedWord(n)}`;
  assert.equal(phrase(0), "0 osób dopasowanych");
  assert.equal(phrase(1), "1 osoba dopasowana");
  assert.equal(phrase(2), "2 osoby dopasowane");
  assert.equal(phrase(5), "5 osób dopasowanych");
  assert.equal(phrase(12), "12 osób dopasowanych");
  assert.equal(phrase(22), "22 osoby dopasowane");
  assert.equal(phrase(34), "34 osoby dopasowane");
  assert.equal(phrase(62), "62 osoby dopasowane");
  assert.equal(phrase(112), "112 osób dopasowanych");
});

test("the crisis title names the place when it is known (QA-026)", () => {
  assert.equal(
    formatCrisisTitle({ typeName: "Awaria prądu", radiusKm: 5, epicentrePostcode: "31-001" }),
    "Awaria prądu · 5 km · okolice 31-001",
  );
  assert.equal(formatCrisisTitle({ typeName: "Powódź", radiusKm: 2, epicentrePostcode: null }), "Powódź · 2 km");
});
