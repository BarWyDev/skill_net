// Pause date helpers (roadmap S-13). Run with `npm run test:unit`.

import assert from "node:assert/strict";
import { test } from "node:test";

import { formatPauseUntil, pauseDateBounds, warsawToday } from "./pause.ts";

test("Warsaw today is already tomorrow just before UTC midnight", () => {
  // 23:30 UTC on 31 October is 00:30 CET on 1 November.
  assert.equal(warsawToday(new Date("2026-10-31T23:30:00Z")), "2026-11-01");
  // In summer (CEST, UTC+2) the day changes at 22:00 UTC.
  assert.equal(warsawToday(new Date("2026-06-30T21:59:00Z")), "2026-06-30");
  assert.equal(warsawToday(new Date("2026-06-30T22:00:00Z")), "2026-07-01");
});

test("Warsaw today is still today just after UTC midnight", () => {
  assert.equal(warsawToday(new Date("2026-12-31T00:30:00Z")), "2026-12-31");
});

test("the bounds run from Warsaw today to 365 days later", () => {
  assert.deepEqual(pauseDateBounds(new Date("2026-10-06T10:00:00Z")), { min: "2026-10-06", max: "2027-10-06" });
});

test("+365 days across a 29 February lands one calendar day short of a year", () => {
  assert.deepEqual(pauseDateBounds(new Date("2027-12-01T10:00:00Z")), { min: "2027-12-01", max: "2028-11-30" });
  assert.deepEqual(pauseDateBounds(new Date("2028-02-29T10:00:00Z")), { min: "2028-02-29", max: "2029-02-28" });
});

test("the bounds use the Warsaw date at UTC midnight", () => {
  assert.deepEqual(pauseDateBounds(new Date("2026-12-31T23:30:00Z")), { min: "2027-01-01", max: "2028-01-01" });
});

test("formats the end date as DD.MM.YYYY", () => {
  assert.equal(formatPauseUntil("2026-10-15"), "15.10.2026");
  assert.equal(formatPauseUntil("2027-01-05"), "05.01.2027");
});
