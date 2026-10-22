// Email link parameters (roadmap S-16). Run with `npm run test:unit`.

import assert from "node:assert/strict";
import { test } from "node:test";

import { parseConfirmParams } from "./confirm-link.ts";

const HASH = "a".repeat(56);

test("accepts the confirmation and magic-link types", () => {
  for (const type of ["email", "signup", "magiclink"]) {
    assert.deepEqual(parseConfirmParams(new URLSearchParams({ token_hash: HASH, type })), { tokenHash: HASH, type });
  }
});

test("refuses link types SkillNet has no page for", () => {
  for (const type of ["recovery", "invite", "email_change", "", "EMAIL"]) {
    assert.equal(parseConfirmParams(new URLSearchParams({ token_hash: HASH, type })), null, type);
  }
});

test("refuses a missing, empty or oversized token", () => {
  assert.equal(parseConfirmParams(new URLSearchParams({ type: "email" })), null);
  assert.equal(parseConfirmParams(new URLSearchParams({ token_hash: "", type: "email" })), null);
  assert.equal(parseConfirmParams(new URLSearchParams({ token_hash: "a".repeat(201), type: "email" })), null);
  assert.equal(parseConfirmParams(new URLSearchParams({ token_hash: HASH })), null);
});

test("reads a posted form the same way", () => {
  const form = new FormData();
  form.set("token_hash", HASH);
  form.set("type", "signup");
  assert.deepEqual(parseConfirmParams(form), { tokenHash: HASH, type: "signup" });
});

test("refuses a file where a string belongs", () => {
  const form = new FormData();
  form.set("token_hash", new Blob([HASH]));
  form.set("type", "email");
  assert.equal(parseConfirmParams(form), null);
});
