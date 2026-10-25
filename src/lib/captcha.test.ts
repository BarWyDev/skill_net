import { test } from "node:test";
import assert from "node:assert/strict";
import { CAPTCHA_FIELD, captchaToken } from "./captcha.ts";

function form(entries: Record<string, string>) {
  const data = new FormData();
  for (const [name, value] of Object.entries(entries)) data.set(name, value);
  return data;
}

test("returns the widget's token", () => {
  assert.equal(captchaToken(form({ [CAPTCHA_FIELD]: "0.abc" })), "0.abc");
});

test("returns undefined without a widget or with an empty token", () => {
  assert.equal(captchaToken(form({})), undefined);
  assert.equal(captchaToken(form({ [CAPTCHA_FIELD]: "" })), undefined);
});
