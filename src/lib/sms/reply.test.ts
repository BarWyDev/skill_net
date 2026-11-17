// Reply parsing (S-07). Run with `npm run test:unit`.

import assert from "node:assert/strict";
import { test } from "node:test";

import { parseReply } from "./reply.ts";

test("parseReply reads TAK in its usual shapes", () => {
  for (const text of ["TAK", "tak", "Tak!", " t ", "T", "yes", "Tak.", "tak, będę", "TAK będę za 10 min", "tak\n"]) {
    assert.equal(parseReply(text), "yes", JSON.stringify(text));
  }
});

test("parseReply reads NIE in its usual shapes", () => {
  for (const text of ["NIE", "nie", "NIE.", " n ", "N", "no", "Nie mogę", "nie, jestem w pracy"]) {
    assert.equal(parseReply(text), "no", JSON.stringify(text));
  }
});

test("parseReply refuses anything it cannot be sure about", () => {
  for (const text of [
    "",
    "   ",
    "ok",
    "moze",
    "?",
    "123",
    "będę",
    "tak nie",
    "Nie wiem, może tak",
    "takt",
    "niestety",
  ]) {
    assert.equal(parseReply(text), null, JSON.stringify(text));
  }
});

test("parseReply reads what phones really send", () => {
  // Autocorrect, signatures, emoji and line breaks around the one word that matters.
  for (const text of ["Tak 👍", "TAK\r\n", "  tak  ", "„Tak”", "Tak - Jan", "tak...", "T."]) {
    assert.equal(parseReply(text), "yes", JSON.stringify(text));
  }
  for (const text of ["Nie 🙁", "NIE\r\n", "nie!!!", "Nie, dziękuję", "N."]) {
    assert.equal(parseReply(text), "no", JSON.stringify(text));
  }
});

test("parseReply never reads a yes or a no out of a longer word or a later word", () => {
  for (const text of ["Taki", "niech", "Chyba tak", "raczej nie", "Już jadę", "👍", "yes no", "TAK/NIE"]) {
    assert.equal(parseReply(text), null, JSON.stringify(text));
  }
});
