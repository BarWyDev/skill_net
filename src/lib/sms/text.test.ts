// SMS texts (S-07). Run with `npm run test:unit`.

import assert from "node:assert/strict";
import { test } from "node:test";

import { SMS_MAX_LENGTH, alertText, codeText, endedText, foldDiacritics, isGsm7, toGsm7, unclearText } from "./text.ts";

test("foldDiacritics folds every Polish diacritic, both cases", () => {
  assert.equal(foldDiacritics("ąćęłńóśźż"), "acelnoszz");
  assert.equal(foldDiacritics("ĄĆĘŁŃÓŚŹŻ"), "ACELNOSZZ");
  assert.equal(foldDiacritics("Zażółć gęślą jaźń"), "Zazolc gesla jazn");
});

test("foldDiacritics turns typographic punctuation into ASCII", () => {
  assert.equal(foldDiacritics("„tak” – może…"), '"tak" - moze...');
});

test("isGsm7 accepts plain text and refuses diacritics, emoji and extension characters", () => {
  assert.equal(isGsm7("SkillNet: Powodz w Twojej okolicy (00-950). Odpisz TAK lub NIE."), true);
  assert.equal(isGsm7(""), true);
  for (const char of "ąćęłńóśźżĄĆĘŁŃÓŚŹŻ") {
    assert.equal(isGsm7(`a${char}b`), false, char);
  }
  assert.equal(isGsm7("ok 👍"), false);
  assert.equal(isGsm7("5 €"), false);
  assert.equal(isGsm7("[x]"), false);
});

test("toGsm7 folds what it can and replaces the rest", () => {
  assert.equal(toGsm7("Pożar 🔥"), "Pozar ?");
  assert.equal(isGsm7(toGsm7("Skażenie chemiczne – „strefa” €")), true);
});

test("alertText names the type and the postcode", () => {
  assert.equal(
    alertText({ crisisTypeLabel: "Powódź", postcode: "00-950" }),
    "SkillNet: Powodz w Twojej okolicy (00-950). Koordynator prosi o pomoc. Odpisz TAK jesli mozesz pomoc lub NIE.",
  );
});

test("alertText drops the brackets when the crisis has no postcode", () => {
  assert.equal(
    alertText({ crisisTypeLabel: "Zdarzenie masowe", postcode: null }),
    "SkillNet: Zdarzenie masowe w Twojej okolicy. Koordynator prosi o pomoc. Odpisz TAK jesli mozesz pomoc lub NIE.",
  );
});

test("alertText stays within one segment at the 160-character boundary", () => {
  const fixed = alertText({ crisisTypeLabel: "", postcode: "00-950" }).length;
  const room = SMS_MAX_LENGTH - fixed;

  const exact = alertText({ crisisTypeLabel: "x".repeat(room), postcode: "00-950" });
  assert.equal(exact.length, SMS_MAX_LENGTH);
  assert.ok(exact.includes("x".repeat(room)));

  const over = alertText({ crisisTypeLabel: "x".repeat(room + 1), postcode: "00-950" });
  assert.equal(over.length, SMS_MAX_LENGTH);
  assert.ok(over.endsWith("Odpisz TAK jesli mozesz pomoc lub NIE."));

  const long = alertText({ crisisTypeLabel: "Długotrwała awaria ".repeat(20), postcode: null });
  assert.ok(long.length <= SMS_MAX_LENGTH);
  assert.equal(isGsm7(long), true);
});

test("every fixed text is GSM-7 and fits one segment", () => {
  const texts = [
    alertText({ crisisTypeLabel: "Zażółć gęślą jaźń", postcode: "31-001" }),
    codeText("123456"),
    endedText(),
    unclearText(),
  ];
  for (const text of texts) {
    assert.equal(isGsm7(text), true, text);
    assert.ok(text.length <= SMS_MAX_LENGTH, text);
  }
});

test("codeText carries the code", () => {
  assert.ok(codeText("048213").includes("048213"));
});
