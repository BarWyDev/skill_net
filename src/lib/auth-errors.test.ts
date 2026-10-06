// Polish auth error messages (roadmap S-05). Run with `npm run test:unit`.

import assert from "node:assert/strict";
import { test } from "node:test";

import { GENERIC_AUTH_ERROR, authErrorMessage } from "./auth-errors.ts";

test("maps every known code to its own Polish message", () => {
  const codes = [
    "invalid_credentials",
    "email_not_confirmed",
    "user_already_exists",
    "weak_password",
    "over_email_send_rate_limit",
  ];
  for (const code of codes) {
    const message = authErrorMessage(code);
    assert.notEqual(message, GENERIC_AUTH_ERROR, code);
    assert.ok(message.length > 0, code);
  }
  assert.equal(new Set(codes.map(authErrorMessage)).size, codes.length);
});

test("both duplicate-account codes share one message", () => {
  assert.equal(authErrorMessage("email_exists"), authErrorMessage("user_already_exists"));
});

test("unknown and missing codes fall back to the generic message", () => {
  assert.equal(authErrorMessage("something_new"), GENERIC_AUTH_ERROR);
  assert.equal(authErrorMessage(""), GENERIC_AUTH_ERROR);
  assert.equal(authErrorMessage(undefined), GENERIC_AUTH_ERROR);
});

test("an inherited object key is not a known code", () => {
  assert.equal(authErrorMessage("toString"), GENERIC_AUTH_ERROR);
});
