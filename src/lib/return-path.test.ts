// Sign-in return path. Run with `npm run test:unit`.

import assert from "node:assert/strict";
import { test } from "node:test";

import { safeReturnPath } from "./return-path.ts";

test("paths on this site are kept, with their query", () => {
  assert.equal(safeReturnPath("/profil"), "/profil");
  assert.equal(
    safeReturnPath("/koordynator/kryzys/1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed"),
    "/koordynator/kryzys/1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed",
  );
  assert.equal(safeReturnPath("/zespoly?szablon=a&liczba=2"), "/zespoly?szablon=a&liczba=2");
});

test("other origins and odd forms are refused", () => {
  for (const raw of [
    "https://evil.example/",
    "//evil.example/",
    "/\\evil.example",
    "\\\\evil.example",
    "javascript:alert(1)",
    "profil",
    "/\tevil",
    "",
    "/".padEnd(600, "a"),
    null,
    undefined,
  ]) {
    assert.equal(safeReturnPath(raw), null, String(raw));
  }
});

test("auth pages and endpoints are never a return target", () => {
  assert.equal(safeReturnPath("/auth/signin"), null);
  assert.equal(safeReturnPath("/api/auth/signout"), null);
});
