// The coordinator reason rule (security audit F-05). Run with `npm run test:unit`.
// Invisible characters are built from code points, so none of them hides in this file.

import assert from "node:assert/strict";
import { test } from "node:test";

import { REASON_REQUIRED_MESSAGE, REASON_TOO_LONG_MESSAGE, normaliseReason, reasonProblem } from "./reason.ts";

const cp = (...points: number[]) => String.fromCodePoint(...points);
const ZWSP = cp(0x200b);

const check = (raw: string) => reasonProblem(normaliseReason(raw));

test("whitespace and invisible characters collapse to one space and are trimmed", () => {
  assert.equal(normaliseReason("  Pożar w bloku, brak prądu  "), "Pożar w bloku, brak prądu");
  assert.equal(normaliseReason(`Pożar${ZWSP}${ZWSP}  w\tbloku,${cp(0xa0)}brak\nprądu`), "Pożar w bloku, brak prądu");
  assert.equal(
    normaliseReason(`${cp(0xfeff)}Brak${cp(0x200d)} potwierdzeń${cp(0x202e)} od rana${cp(0x2060)}`),
    "Brak potwierdzeń od rana",
  );
  assert.equal(normaliseReason(`Pożar${cp(0x3000)}domu${cp(0x2028)}teraz`), "Pożar domu teraz");
});

test("Polish letters, capitals and punctuation are kept", () => {
  assert.equal(normaliseReason("ŻÓŁTY ALARM: ewakuacja szkoły"), "ŻÓŁTY ALARM: ewakuacja szkoły");
  assert.equal(check("ŻÓŁTY ALARM: ewakuacja szkoły"), null);
});

test("invisible or padded reasons are refused (the audit reproduction)", () => {
  assert.equal(check(ZWSP.repeat(10)), REASON_REQUIRED_MESSAGE);
  assert.equal(check(`ab${ZWSP.repeat(7)}cd`), REASON_REQUIRED_MESSAGE);
  assert.equal(check(""), REASON_REQUIRED_MESSAGE);
  assert.equal(check("          "), REASON_REQUIRED_MESSAGE);
});

test("junk without two real words is refused", () => {
  for (const junk of ["aaaaaaaaaa", "aaa aaa aaa", "1234567890 !!!", "Pożarrrrrr", "ab cd ef gh ij"]) {
    assert.equal(check(junk), REASON_REQUIRED_MESSAGE, junk);
  }
});

test("the length bounds apply to the visible text", () => {
  assert.equal(check("Pożar domu ".repeat(46)), REASON_TOO_LONG_MESSAGE);
  assert.equal(check(`Pożar domu${ZWSP} `.repeat(45)), null);
  assert.equal(check("Pożar domu"), null);
});

test("the messages name both requirements", () => {
  assert.match(REASON_REQUIRED_MESSAGE, /10 znaków/);
  assert.match(REASON_REQUIRED_MESSAGE, /dwa słowa/);
  assert.match(REASON_TOO_LONG_MESSAGE, /500 znaków/);
});
