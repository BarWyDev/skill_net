// The Polish legal texts are binding and belong to one consent version (resident-area-translations,
// Phase 3). Run with `npm run test:unit`.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import { CONSENT_LABEL, CURRENT_CONSENT_VERSION } from "../consent.ts";
import { pl } from "./messages/legal.ts";

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

// The wording residents consented to under each version. A changed hash means the Polish privacy
// notice or the consent sentence changed: publish a new consent version first (src/lib/consent.ts),
// then add its hashes here. Never edit a hash to make a wording change pass.
const WORDING: Record<string, { notice: string; consent: string }> = {
  "2026-10-21": {
    notice: "467eede698307a86377fff8bdaaae4554856c8cfc8ae69e96be2a3cd585d8eb7",
    consent: "49c341a315a565353ee3fe56757af21ea156056e4e0686e17838696abe46a153",
  },
};

test("the Polish privacy notice and consent sentence are the ones of the current consent version", () => {
  const pinned = WORDING[CURRENT_CONSENT_VERSION] as { notice: string; consent: string } | undefined;
  assert.ok(pinned, `no pinned wording for consent version ${CURRENT_CONSENT_VERSION}`);
  // Headings, paragraphs and list items in page order; the page title and description are not part
  // of the notice.
  const { title: _title, description: _description, ...notice } = pl.privacy;
  assert.equal(sha256(JSON.stringify(notice)), pinned.notice, "the Polish privacy notice changed");
  assert.equal(sha256(CONSENT_LABEL), pinned.consent, "the Polish consent sentence changed");
});
