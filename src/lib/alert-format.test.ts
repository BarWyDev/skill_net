// Alert batch text (S-07). Run with `npm run test:unit`.

import assert from "node:assert/strict";
import { test } from "node:test";

import { batchSummary, formatCost, formatSkips, formatStatuses, parseAlertCount } from "./alert-format.ts";

test("formatSkips lists the reasons that have someone, in a fixed order", () => {
  assert.equal(formatSkips({}), null);
  assert.equal(formatSkips({ paused: 0 }), null);
  assert.equal(formatSkips({ other_crisis: 3, unverified: 5 }), "5 bez potwierdzonego numeru, 3 w innym zdarzeniu");
  assert.equal(
    formatSkips({ unverified: 1, no_phone: 2, paused: 3, hidden: 4, other_crisis: 5 }),
    "1 bez potwierdzonego numeru, 2 bez telefonu, 3 z wstrzymaną dostępnością, 4 z ukrytymi umiejętnościami, 5 w innym zdarzeniu",
  );
});

test("formatCost uses a Polish decimal comma and two places", () => {
  assert.equal(formatCost(7.14), "ok. 7,14 zł");
  assert.equal(formatCost(0.5), "ok. 0,50 zł");
});

test("batchSummary for a real batch", () => {
  assert.equal(
    batchSummary({ queued: 42, skipped: { unverified: 5, other_crisis: 3 }, simulated: false, estimatedCostPln: 7.14 }),
    "Wysłano do kolejki: 42 (ok. 7,14 zł). Pominięto: 5 bez potwierdzonego numeru, 3 w innym zdarzeniu.",
  );
  assert.equal(
    batchSummary({ queued: 1, skipped: {}, simulated: false, estimatedCostPln: 0.17 }),
    "Wysłano do kolejki: 1 (ok. 0,17 zł).",
  );
});

test("batchSummary says so when nobody could be alerted", () => {
  assert.equal(
    batchSummary({ queued: 0, skipped: { unverified: 12 }, simulated: false, estimatedCostPln: 0 }),
    "Nikt nie dostał alertu: na liście nie ma kolejnych osób, do których można go wysłać. Pominięto: 12 bez potwierdzonego numeru.",
  );
});

test("batchSummary for an exercise never claims an SMS was sent", () => {
  assert.equal(
    batchSummary({ queued: 42, skipped: {}, simulated: true, estimatedCostPln: 7.14 }),
    "Ćwiczenie: alert trafiłby do 42 osób (ok. 7,14 zł). Nikt nie dostał SMS-a.",
  );
  assert.equal(
    batchSummary({ queued: 1, skipped: { no_phone: 2 }, simulated: true, estimatedCostPln: 0.17 }),
    "Ćwiczenie: alert trafiłby do 1 osoby (ok. 0,17 zł). Nikt nie dostał SMS-a. Pominięto: 2 bez telefonu.",
  );
  assert.equal(
    batchSummary({ queued: 3, skipped: {}, simulated: true, estimatedCostPln: 0.51 }),
    "Ćwiczenie: alert trafiłby do 3 osób (ok. 0,51 zł). Nikt nie dostał SMS-a.",
  );
  assert.equal(
    batchSummary({ queued: 0, skipped: { unverified: 9 }, simulated: true, estimatedCostPln: 0 }),
    "Ćwiczenie: alert trafiłby do nikogo. Nikt nie dostał SMS-a. Pominięto: 9 bez potwierdzonego numeru.",
  );
});

test("formatStatuses lists the statuses that have alerts", () => {
  assert.equal(formatStatuses({}), null);
  assert.equal(formatStatuses({ sent: 39, queued: 3 }), "w kolejce: 3, wysłano: 39");
  assert.equal(
    formatStatuses({ failed: 1, delivered: 2, undelivered: 4 }),
    "dostarczono: 2, nie doręczono: 4, nie wysłano: 1",
  );
});

test("parseAlertCount accepts 1 to 200 only", () => {
  assert.equal(parseAlertCount("1"), 1);
  assert.equal(parseAlertCount(" 50 "), 50);
  assert.equal(parseAlertCount("200"), 200);
  for (const raw of ["0", "201", "-1", "1.5", "abc", "", "1000", null, undefined, 5]) {
    assert.equal(parseAlertCount(raw), null, String(raw));
  }
});
