// Consent module (roadmap S-05). Run with `npm run test:unit`.

import assert from "node:assert/strict";
import { test } from "node:test";

import { CURRENT_CONSENT_VERSION, isConsentGateExempt } from "./consent.ts";

test("the consent version uses the YYYY-MM-DD format of the seeded row", () => {
  assert.match(CURRENT_CONSENT_VERSION, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(!Number.isNaN(Date.parse(`${CURRENT_CONSENT_VERSION}T00:00:00Z`)));
});

test("the consent page, the notice, auth routes and assets are exempt from the gate", () => {
  for (const path of [
    "/zgoda",
    "/api/zgoda",
    "/prywatnosc",
    "/auth/signin",
    "/auth/confirm",
    "/api/auth/signout",
    "/api/auth/unregister",
    "/_astro/client.js",
    "/favicon.png",
    "/favicon.svg",
    "/favicon.ico",
    "/apple-touch-icon.png",
    "/og-image.png",
  ]) {
    assert.equal(isConsentGateExempt(path), true, path);
  }
});

test("every other path is gated, including look-alike prefixes", () => {
  for (const path of [
    "/",
    "/profil",
    "/mapa",
    "/api/mapa",
    "/koordynator",
    "/zgodax",
    "/authx",
    "/og-image.pngx",
    "/api/profile",
  ]) {
    assert.equal(isConsentGateExempt(path), false, path);
  }
});
