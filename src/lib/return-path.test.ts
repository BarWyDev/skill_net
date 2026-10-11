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

test("dot segments that normalise to another origin are refused", () => {
  for (const raw of [
    "/.//evil.example/login",
    "/a/..//evil.example",
    "/..//evil.example",
    "/%2e%2e//evil.example",
    "/.//evil.example?x=1",
  ]) {
    assert.equal(safeReturnPath(raw), null, raw);
  }
});

test("dot segments that stay on this site still work", () => {
  assert.equal(safeReturnPath("/a/../profil"), "/profil");
  assert.equal(safeReturnPath("/./mapa?kategoria=medyczne"), "/mapa?kategoria=medyczne");
  // An encoded slash stays a path segment: browsers do not decode it when resolving a Location.
  assert.equal(safeReturnPath("/%2E%2E/%2F/evil.example"), "/%2F/evil.example");
});

test("no accepted result is ever protocol-relative", () => {
  const alphabet = ["/", ".", "%", "2", "e", "E", "f", "F", "5", "c", "a", "\\"];
  // A fixed linear congruential generator keeps the run reproducible.
  let seed = 42;
  const next = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31);
  for (let i = 0; i < 5000; i++) {
    let raw = "/";
    const length = 1 + (next() % 12);
    for (let j = 0; j < length; j++) raw += alphabet[next() % alphabet.length];
    const result = safeReturnPath(raw);
    if (result !== null) {
      assert.ok(result.startsWith("/") && !result.startsWith("//") && !result.includes("\\"), raw);
    }
  }
});

test("auth pages and endpoints are never a return target", () => {
  assert.equal(safeReturnPath("/auth/signin"), null);
  assert.equal(safeReturnPath("/api/auth/signout"), null);
});
