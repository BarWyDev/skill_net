// Consent module (roadmap S-05). Run with `npm run test:unit`.

import assert from "node:assert/strict";
import { test } from "node:test";

import { CURRENT_CONSENT_VERSION } from "./consent.ts";

test("the consent version uses the YYYY-MM-DD format of the seeded row", () => {
  assert.match(CURRENT_CONSENT_VERSION, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(!Number.isNaN(Date.parse(`${CURRENT_CONSENT_VERSION}T00:00:00Z`)));
});
