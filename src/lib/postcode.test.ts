// Postcode input helpers. Run with `npm run test:unit`.

import assert from "node:assert/strict";
import { test } from "node:test";

import { checkPostcodeInput, normalisePostcode } from "./postcode.ts";

test("both accepted spellings normalise to NN-NNN", () => {
  assert.equal(normalisePostcode("31-001"), "31-001");
  assert.equal(normalisePostcode("31001"), "31-001");
  assert.equal(normalisePostcode(" 31-001 "), "31-001");
  assert.equal(normalisePostcode("31-0011"), null);
  assert.equal(normalisePostcode("3-1001"), null);
});

test("an empty field is neither valid nor an error", () => {
  assert.deepEqual(checkPostcodeInput(""), { kind: "empty" });
  assert.deepEqual(checkPostcodeInput("   "), { kind: "empty" });
});

test("a complete code is valid and normalised", () => {
  assert.deepEqual(checkPostcodeInput("31001"), { kind: "valid", postcode: "31-001" });
  assert.deepEqual(checkPostcodeInput("31-001"), { kind: "valid", postcode: "31-001" });
});

test("an unfinished code is partial while it can still become valid", () => {
  for (const raw of ["3", "31", "31-", "31-0", "31-00", "310", "3100"]) {
    assert.deepEqual(checkPostcodeInput(raw), { kind: "partial" }, raw);
  }
});

test("anything that can never become a code is invalid at once", () => {
  for (const raw of ["abc", "3a", "31a", "-31", "3-1", "31--0", "31-00a", "31 001"]) {
    assert.deepEqual(checkPostcodeInput(raw), { kind: "invalid" }, raw);
  }
});
