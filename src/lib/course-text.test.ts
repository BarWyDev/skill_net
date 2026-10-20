// The neighbour course text rule, the same cases as neighbour_courses_test.sql. Run with
// `npm run test:unit`. Invisible characters are built from code points, so none of them hides here.

import assert from "node:assert/strict";
import { test } from "node:test";

import { COURSE_TEXT_MESSAGES, checkCourseText, normaliseCourseText } from "./course-text.ts";

const cp = (...points: number[]) => String.fromCodePoint(...points);
const ZWSP = cp(0x200b);

const DESCRIPTION = "Pokażę, jak bezpiecznie obsługiwać agregat prądotwórczy.";

test("phone numbers are refused, with spaces, dashes, brackets or +48", () => {
  for (const text of [
    "zadzwoń 600 100 200",
    "600-100-200",
    "+48600100200",
    "(+48) 600 100 200",
    "tel. 600100200",
    `600${ZWSP}100${ZWSP}200`,
  ]) {
    assert.deepEqual(checkCourseText(`${DESCRIPTION} ${text}`, "description"), {
      ok: false,
      message: COURSE_TEXT_MESSAGES.description_contact,
    });
  }
  assert.deepEqual(checkCourseText("Kurs 600 100 200", "title"), {
    ok: false,
    message: COURSE_TEXT_MESSAGES.title_contact,
  });
});

test("dates, times and short counts pass", () => {
  for (const text of ["sobota 21.10.2026, 10:00-12:00", "2 x 90 min, 10-12 osób", "600.100.200"]) {
    assert.deepEqual(checkCourseText(text, "meeting"), { ok: true, text });
  }
});

test("email addresses are refused", () => {
  assert.deepEqual(checkCourseText("Pisz na jan.kowalski@example.pl po szczegóły", "meeting"), {
    ok: false,
    message: COURSE_TEXT_MESSAGES.meeting_contact,
  });
  assert.deepEqual(checkCourseText("Spotkanie przy @rynku, wejście od podwórza", "meeting").ok, true);
});

test("whitespace and invisible characters are folded before the bounds", () => {
  assert.equal(normaliseCourseText(`  Pierwsza${ZWSP}${ZWSP} pomoc\n\tdla   dzieci `), "Pierwsza pomoc dla dzieci");
  assert.deepEqual(checkCourseText(`${cp(0xfeff)}Szycie${cp(0xa0)} ręczne `, "title"), {
    ok: true,
    text: "Szycie ręczne",
  });
  assert.deepEqual(checkCourseText(`ab${ZWSP.repeat(10)}`, "title"), {
    ok: false,
    message: COURSE_TEXT_MESSAGES.title_invalid,
  });
});

test("the bounds per field", () => {
  assert.equal(checkCourseText("Kurs", "title").ok, false);
  assert.equal(checkCourseText("Kurss", "title").ok, true);
  assert.equal(checkCourseText("a".repeat(80), "title").ok, true);
  assert.equal(checkCourseText("a".repeat(81), "title").ok, false);
  assert.equal(checkCourseText("a".repeat(19), "description").ok, false);
  assert.equal(checkCourseText("a".repeat(20), "description").ok, true);
  assert.equal(checkCourseText("a".repeat(1001), "description").ok, false);
  assert.equal(checkCourseText("a".repeat(500), "meeting").ok, true);
  assert.equal(checkCourseText("a".repeat(501), "meeting").ok, false);
  // An emoji is one character, as char_length counts it.
  assert.equal(checkCourseText("🔥".repeat(80), "title").ok, true);
});

test("empty meeting details are null, an empty title is refused", () => {
  assert.deepEqual(checkCourseText(null, "meeting"), { ok: true, text: null });
  assert.deepEqual(checkCourseText(`  ${ZWSP} `, "meeting"), { ok: true, text: null });
  assert.deepEqual(checkCourseText("", "title"), { ok: false, message: COURSE_TEXT_MESSAGES.title_invalid });
});
