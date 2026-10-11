// The sign-up password rule (security audit F-09). Run with `npm run test:unit`.

import assert from "node:assert/strict";
import { test } from "node:test";

import { MIN_PASSWORD_LENGTH, PASSWORD_NEEDS_CLASSES, PASSWORD_TOO_SHORT, passwordProblem } from "./password.ts";

test("the audit's weak passwords are refused", () => {
  assert.equal(passwordProblem("123456"), PASSWORD_TOO_SHORT);
  assert.equal(passwordProblem(""), PASSWORD_TOO_SHORT);
  assert.equal(passwordProblem("Abc12345"), PASSWORD_TOO_SHORT);
});

test("a long password still needs a lowercase letter, an uppercase letter and a digit", () => {
  assert.equal(passwordProblem("abcdefghij"), PASSWORD_NEEDS_CLASSES);
  assert.equal(passwordProblem("abcdefghi1"), PASSWORD_NEEDS_CLASSES);
  assert.equal(passwordProblem("ABCDEFGHI1"), PASSWORD_NEEDS_CLASSES);
  assert.equal(passwordProblem("Abcdefghij"), PASSWORD_NEEDS_CLASSES);
});

test("Polish letters do not count as the ASCII classes Supabase checks", () => {
  assert.equal(passwordProblem("ŻÓŁĆŹżółćź1"), PASSWORD_NEEDS_CLASSES);
  assert.equal(passwordProblem("Żółwik2026A"), null);
});

test("passwords that meet the rule pass", () => {
  assert.equal(passwordProblem("Smoke-Test-Passw0rd!"), null);
  assert.equal(passwordProblem("Abcdefghi1"), null);
  assert.equal("Abcdefghi1".length, MIN_PASSWORD_LENGTH);
});
