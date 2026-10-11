// HTTPS only (security audit F-10). Run with `npm run test:unit`.

import assert from "node:assert/strict";
import { test } from "node:test";

import { HSTS_HEADER, httpsRedirect, sendsHsts } from "./https.ts";

test("plain HTTP on the public host goes to HTTPS, keeping the path and query", () => {
  assert.equal(httpsRedirect(new URL("http://skillnet.barwy.workers.dev/")), "https://skillnet.barwy.workers.dev/");
  assert.equal(
    httpsRedirect(new URL("http://skillnet.barwy.workers.dev/auth/signin?powrot=%2Fprofil")),
    "https://skillnet.barwy.workers.dev/auth/signin?powrot=%2Fprofil",
  );
  assert.equal(
    httpsRedirect(new URL("http://feature-x-skillnet.barwy.workers.dev/mapa")),
    "https://feature-x-skillnet.barwy.workers.dev/mapa",
  );
});

test("an explicit HTTP port is dropped, so the redirect lands on the default HTTPS port", () => {
  assert.equal(httpsRedirect(new URL("http://skillnet.example:8080/mapa")), "https://skillnet.example/mapa");
});

test("HTTPS requests are left alone", () => {
  assert.equal(httpsRedirect(new URL("https://skillnet.barwy.workers.dev/")), null);
});

test("local development stays on plain HTTP", () => {
  for (const url of [
    "http://localhost:4321/",
    "http://127.0.0.1:4321/profil",
    "http://[::1]:4321/",
    "http://app.localhost:4321/",
  ]) {
    assert.equal(httpsRedirect(new URL(url)), null, url);
  }
});

test("HSTS goes on HTTPS responses only, for two years with subdomains", () => {
  assert.equal(sendsHsts(new URL("https://skillnet.barwy.workers.dev/")), true);
  assert.equal(sendsHsts(new URL("http://localhost:4321/")), false);
  assert.deepEqual(HSTS_HEADER, ["Strict-Transport-Security", "max-age=63072000; includeSubDomains"]);
});
