// The phone verification code (S-07). Run with `npm run test:unit`.

import assert from "node:assert/strict";
import { test } from "node:test";

import { generateCode, hashCode, normaliseCode } from "./phone-code.ts";

test("normaliseCode accepts six digits, with spaces or dashes", () => {
  assert.equal(normaliseCode("123456"), "123456");
  assert.equal(normaliseCode(" 123 456 "), "123456");
  assert.equal(normaliseCode("123-456"), "123456");
  assert.equal(normaliseCode("000001"), "000001");
});

test("normaliseCode refuses anything else", () => {
  for (const raw of ["", "12345", "1234567", "12345a", "１２３４５６", "12.345"]) {
    assert.equal(normaliseCode(raw), null, raw);
  }
});

test("generateCode gives six digits and keeps leading zeros", () => {
  assert.equal(
    generateCode(() => 0),
    "000000",
  );
  assert.equal(
    generateCode(() => 42),
    "000042",
  );
  assert.equal(
    generateCode(() => 1_234_567),
    "234567",
  );
  for (let i = 0; i < 200; i += 1) {
    assert.match(generateCode(), /^\d{6}$/);
  }
});

test("generateCode redraws a value from the biased tail", () => {
  // 2^32 = 4294967296, so values from 4294000000 up would favour the codes below 967296.
  const draws = [4_294_967_295, 4_294_000_000, 4_293_999_999];
  let calls = 0;
  const code = generateCode(() => {
    const value = draws[calls];
    calls += 1;
    return value;
  });
  assert.equal(calls, 3);
  assert.equal(code, "999999");
});

test("hashCode is a 64-character hex digest bound to the token, the user and the code", async () => {
  const hash = await hashCode("token", "user-1", "123456");
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(hash, await hashCode("token", "user-1", "123456"));
  assert.notEqual(hash, await hashCode("token", "user-1", "123457"));
  assert.notEqual(hash, await hashCode("token", "user-2", "123456"));
  assert.notEqual(hash, await hashCode("other", "user-1", "123456"));
});
