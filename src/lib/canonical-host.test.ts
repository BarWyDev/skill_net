// One production address (staging-and-domain, Phase 7). Run with `npm run test:unit`.

import assert from "node:assert/strict";
import { test } from "node:test";

import { CANONICAL_ORIGIN, canonicalRedirect } from "./canonical-host.ts";

test("the old workers.dev host goes to the apex, keeping the path and query", () => {
  assert.deepEqual(canonicalRedirect(new URL("https://skillnet.barwy.workers.dev/"), "GET"), {
    location: "https://skillnet.org.pl/",
    status: 301,
  });
  assert.deepEqual(canonicalRedirect(new URL("https://skillnet.barwy.workers.dev/mapa?x=1&y=%2F"), "GET"), {
    location: "https://skillnet.org.pl/mapa?x=1&y=%2F",
    status: 301,
  });
});

test("www goes to the apex", () => {
  assert.deepEqual(canonicalRedirect(new URL("https://www.skillnet.org.pl/auth/signin?powrot=%2Fprofil"), "HEAD"), {
    location: "https://skillnet.org.pl/auth/signin?powrot=%2Fprofil",
    status: 301,
  });
});

test("plain HTTP on an old host goes straight to the HTTPS apex in one hop", () => {
  assert.deepEqual(canonicalRedirect(new URL("http://www.skillnet.org.pl:80/kursy"), "GET"), {
    location: "https://skillnet.org.pl/kursy",
    status: 301,
  });
});

test("a form POST to an old host gets a 308, which keeps the method and body", () => {
  assert.deepEqual(canonicalRedirect(new URL("https://skillnet.barwy.workers.dev/api/auth/signin"), "POST"), {
    location: "https://skillnet.org.pl/api/auth/signin",
    status: 308,
  });
});

test("the apex itself, previews, other hosts and local development are left alone", () => {
  for (const url of [
    "https://skillnet.org.pl/",
    "https://feat-x-skillnet.barwy.workers.dev/mapa",
    "https://staging.skillnet.org.pl/",
    "https://auth.skillnet.org.pl/",
    "https://barwy.workers.dev/",
    "https://evil-skillnet.barwy.workers.dev.example/",
    "http://localhost:4321/",
    "http://127.0.0.1:4321/profil",
  ]) {
    assert.equal(canonicalRedirect(new URL(url), "GET"), null, url);
  }
});

test("the canonical origin is the HTTPS apex", () => {
  assert.equal(CANONICAL_ORIGIN, "https://skillnet.org.pl");
});
