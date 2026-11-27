// The sign-up password rule (security audit F-09) and its messages per language (S-18). Run with
// `npm run test:unit`.

import assert from "node:assert/strict";
import { test } from "node:test";

import { MIN_PASSWORD_LENGTH, passwordProblem } from "./password.ts";

const PASSWORD_TOO_SHORT = "Hasło musi mieć co najmniej 10 znaków.";
const PASSWORD_NEEDS_CLASSES = "Hasło musi zawierać małą literę, wielką literę i cyfrę.";

test("the audit's weak passwords are refused", () => {
  assert.equal(passwordProblem("123456", "pl"), PASSWORD_TOO_SHORT);
  assert.equal(passwordProblem("", "pl"), PASSWORD_TOO_SHORT);
  assert.equal(passwordProblem("Abc12345", "pl"), PASSWORD_TOO_SHORT);
});

test("a long password still needs a lowercase letter, an uppercase letter and a digit", () => {
  assert.equal(passwordProblem("abcdefghij", "pl"), PASSWORD_NEEDS_CLASSES);
  assert.equal(passwordProblem("abcdefghi1", "pl"), PASSWORD_NEEDS_CLASSES);
  assert.equal(passwordProblem("ABCDEFGHI1", "pl"), PASSWORD_NEEDS_CLASSES);
  assert.equal(passwordProblem("Abcdefghij", "pl"), PASSWORD_NEEDS_CLASSES);
});

test("Polish letters do not count as the ASCII classes Supabase checks", () => {
  assert.equal(passwordProblem("ŻÓŁĆŹżółćź1", "pl"), PASSWORD_NEEDS_CLASSES);
  assert.equal(passwordProblem("Żółwik2026A", "pl"), null);
});

test("passwords that meet the rule pass in every language", () => {
  for (const locale of ["pl", "en", "uk"] as const) {
    assert.equal(passwordProblem("Smoke-Test-Passw0rd!", locale), null);
    assert.equal(passwordProblem("Abcdefghi1", locale), null);
  }
  assert.equal("Abcdefghi1".length, MIN_PASSWORD_LENGTH);
});

test("the English messages name the minimum length and the classes", () => {
  assert.equal(passwordProblem("123456", "en"), "The password must have at least 10 characters.");
  assert.equal(
    passwordProblem("abcdefghij", "en"),
    "The password must contain a lowercase letter, an uppercase letter and a digit.",
  );
});

test("the Ukrainian messages name the minimum length and the classes", () => {
  assert.equal(passwordProblem("123456", "uk"), "Пароль має містити щонайменше 10 символів.");
  assert.equal(passwordProblem("abcdefghij", "uk"), "Пароль має містити малу літеру, велику літеру та цифру.");
});
