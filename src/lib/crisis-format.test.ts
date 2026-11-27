// Crisis display formatting. Run with `npm run test:unit`.

import assert from "node:assert/strict";
import { test } from "node:test";

import { ALL_SLOTS_MASK, slotBit, slotsToMask } from "./availability.ts";
import {
  availabilityStatus,
  formatActiveFor,
  formatArea,
  formatAvailabilitySummary,
  formatCrisisTitle,
  formatDistanceKm,
  formatPeople,
  matchedWord,
} from "./crisis-format.ts";

test("the adjective agrees with the number (QA-025)", () => {
  const phrase = (n: number) => `${formatPeople("pl", n)} ${matchedWord("pl", n)}`;
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

test("people counts follow each language's plural rule", () => {
  assert.deepEqual(
    [0, 1, 2, 5, 22].map((n) => formatPeople("en", n)),
    ["0 people", "1 person", "2 people", "5 people", "22 people"],
  );
  assert.deepEqual(
    [0, 1, 2, 5, 11, 22].map((n) => `${formatPeople("uk", n)} ${matchedWord("uk", n)}`),
    [
      "0 осіб дібраних",
      "1 особа дібрана",
      "2 особи дібрані",
      "5 осіб дібраних",
      "11 осіб дібраних",
      "22 особи дібрані",
    ],
  );
});

test("the crisis title names the place when it is known (QA-026)", () => {
  assert.equal(
    formatCrisisTitle("pl", { typeName: "Awaria prądu", radiusKm: 5, epicentrePostcode: "31-001" }),
    "Awaria prądu · 5 km · okolice 31-001",
  );
  assert.equal(formatCrisisTitle("pl", { typeName: "Powódź", radiusKm: 2, epicentrePostcode: null }), "Powódź · 2 km");
  assert.equal(
    formatCrisisTitle("en", { typeName: "Power outage", radiusKm: 5, epicentrePostcode: "31-001" }),
    "Power outage · 5 km · near 31-001",
  );
  assert.equal(formatCrisisTitle("uk", { typeName: "Пожежа", radiusKm: 2, epicentrePostcode: null }), "Пожежа · 2 км");
});

test("an area is the radius and, when known, the place", () => {
  assert.equal(formatArea("pl", 2, "30-552"), "2 km, okolice 30-552");
  assert.equal(formatArea("pl", 10, null), "10 km");
  assert.equal(formatArea("en", 2, "30-552"), "2 km, near 30-552");
  assert.equal(formatArea("uk", 2, "30-552"), "2 км, поблизу 30-552");
});

test("distances use the language's decimal mark", () => {
  assert.equal(formatDistanceKm("pl", 0), "< 0,5 km");
  assert.equal(formatDistanceKm("pl", 2.5), "2,5 km");
  assert.equal(formatDistanceKm("en", 0), "< 0.5 km");
  assert.equal(formatDistanceKm("en", 3), "3.0 km");
  assert.equal(formatDistanceKm("uk", 1.5), "1,5 км");
});

test("how long a crisis has been active", () => {
  const now = new Date("2026-11-27T12:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
  const minutes = (n: number) => n * 60_000;
  const hours = (n: number) => n * 3_600_000;
  const days = (n: number) => n * 86_400_000;
  assert.equal(formatActiveFor("pl", ago(10_000), now), "aktywny od chwili");
  assert.equal(formatActiveFor("pl", ago(minutes(25)), now), "aktywny od 25 min");
  assert.equal(formatActiveFor("pl", ago(hours(3)), now), "aktywny od 3 godz.");
  assert.equal(formatActiveFor("pl", ago(days(1)), now), "aktywny od 1 dnia");
  assert.equal(formatActiveFor("pl", ago(days(2)), now), "aktywny od 2 dni");
  assert.equal(formatActiveFor("pl", ago(days(5)), now), "aktywny od 5 dni");
  assert.equal(formatActiveFor("en", ago(days(1)), now), "active for 1 day");
  assert.equal(formatActiveFor("en", ago(days(2)), now), "active for 2 days");
  assert.equal(formatActiveFor("uk", ago(days(1)), now), "триває 1 день");
  assert.equal(formatActiveFor("uk", ago(days(3)), now), "триває 3 дні");
  assert.equal(formatActiveFor("uk", ago(days(5)), now), "триває 5 днів");
});

test("availability is a status with words, not colour alone", () => {
  assert.deepEqual(availabilityStatus("pl", true), { label: "Deklaruje dostępność teraz", tone: "done" });
  assert.deepEqual(availabilityStatus("pl", false), { label: "Teraz poza deklarowaną dostępnością", tone: "neutral" });
  assert.deepEqual(availabilityStatus("pl", null), { label: "Dostępności nie podano", tone: "neutral" });
  assert.deepEqual(availabilityStatus("en", true), { label: "Declared available now", tone: "done" });
});

test("the availability summary groups days and names slots in each language", () => {
  const weekdayEvenings = [0, 1, 2, 3, 4].map((day) => slotBit(day, 3));
  const weekendAllDay = [5, 6].flatMap((day) => [0, 1, 2, 3].map((slot) => slotBit(day, slot)));
  const mask = slotsToMask([...weekdayEvenings, ...weekendAllDay]);
  assert.equal(formatAvailabilitySummary("pl", mask), "pn–pt: wieczór; sb–nd: cały dzień");
  assert.equal(formatAvailabilitySummary("en", mask), "Mo–Fr: evening; Sa–Su: all day");
  assert.equal(formatAvailabilitySummary("uk", mask), "пн–пт: вечір; сб–нд: увесь день");
  assert.equal(formatAvailabilitySummary("pl", slotsToMask([slotBit(2, 1), slotBit(2, 2)])), "śr: rano, popołudnie");
  assert.equal(formatAvailabilitySummary("pl", ALL_SLOTS_MASK), "zawsze");
  assert.equal(formatAvailabilitySummary("en", ALL_SLOTS_MASK), "always");
  assert.equal(formatAvailabilitySummary("pl", null), "");
});
