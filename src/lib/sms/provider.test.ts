// SMS providers and the selection rule (S-07). Run with `npm run test:unit`.

import assert from "node:assert/strict";
import { test } from "node:test";

import { FAKE_HISTORY, createFakeProvider } from "./fake.ts";
import { getFakeProvider, getSmsProvider, usesRealSms } from "./index.ts";
import { SMSAPI_URL, createSmsapiProvider, readSmsapiResponse } from "./smsapi.ts";

const MESSAGE = { to: "+48600123456", text: "SkillNet: test. Odpisz TAK lub NIE." };

interface Call {
  url: string;
  init: RequestInit;
}

function fakeFetch(respond: () => Response | Promise<Response>) {
  const calls: Call[] = [];
  const impl = ((input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: typeof input === "string" ? input : "", init: init ?? {} });
    return Promise.resolve(respond());
  }) as typeof fetch;
  return { calls, impl };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

test("the fake is the default: no token, or SMS_PROVIDER=fake", () => {
  assert.equal(usesRealSms({}), false);
  assert.equal(usesRealSms({ SMSAPI_TOKEN: "" }), false);
  assert.equal(usesRealSms({ SMSAPI_TOKEN: "t", SMS_PROVIDER: "fake" }), false);
  assert.equal(usesRealSms({ SMSAPI_TOKEN: "t" }), true);
  assert.equal(usesRealSms({ SMSAPI_TOKEN: "t", SMS_PROVIDER: "smsapi" }), true);

  assert.equal(getSmsProvider({}).name, "fake");
  assert.equal(getSmsProvider({ SMSAPI_TOKEN: "t", SMS_PROVIDER: "fake" }).name, "fake");
  assert.equal(getSmsProvider({ SMSAPI_TOKEN: "t" }).name, "smsapi");
  assert.equal(getSmsProvider({}), getFakeProvider());
});

test("the fake records sends, can be told to fail, and forgets old sends", async () => {
  const fake = createFakeProvider();
  assert.deepEqual(await fake.sendSms(MESSAGE), { ok: true, providerId: "fake-1" });
  assert.deepEqual(fake.sent, [{ ...MESSAGE, providerId: "fake-1" }]);

  fake.failNext({ ok: false, retryable: true, code: "network" });
  assert.deepEqual(await fake.sendSms(MESSAGE), { ok: false, retryable: true, code: "network" });
  assert.equal(fake.sent.length, 1);
  assert.deepEqual(await fake.sendSms(MESSAGE), { ok: true, providerId: "fake-2" });

  for (let i = 0; i < FAKE_HISTORY + 5; i += 1) await fake.sendSms(MESSAGE);
  assert.equal(fake.sent.length, FAKE_HISTORY);

  fake.reset();
  assert.equal(fake.sent.length, 0);
  assert.deepEqual(await fake.sendSms(MESSAGE), { ok: true, providerId: "fake-1" });
});

test("SMSAPI: the request carries the token, the number without +, and the cost guards", async () => {
  const { calls, impl } = fakeFetch(() => json({ count: 1, list: [{ id: "abc123", points: 0.16, status: "QUEUE" }] }));
  const provider = createSmsapiProvider({
    token: "secret-token",
    sender: "SkillNet",
    notifyUrl: "https://example.test/api/sms/raport/s",
    fetch: impl,
  });

  assert.deepEqual(await provider.sendSms(MESSAGE), { ok: true, providerId: "abc123" });
  assert.equal(calls.length, 1);
  const call = calls[0];
  assert.equal(call.url, SMSAPI_URL);
  assert.equal(call.init.method, "POST");
  assert.deepEqual(call.init.headers, { Authorization: "Bearer secret-token" });

  const body = call.init.body as URLSearchParams;
  assert.equal(body.get("to"), "48600123456");
  assert.equal(body.get("message"), MESSAGE.text);
  assert.equal(body.get("format"), "json");
  assert.equal(body.get("encoding"), "utf-8");
  assert.equal(body.get("nounicode"), "1");
  assert.equal(body.get("max_parts"), "1");
  assert.equal(body.get("from"), "SkillNet");
  assert.equal(body.get("notify_url"), "https://example.test/api/sms/raport/s");
});

test("SMSAPI: sender and notify_url are left out when not set", async () => {
  const { calls, impl } = fakeFetch(() => json({ count: 1, list: [{ id: "x" }] }));
  await createSmsapiProvider({ token: "t", fetch: impl }).sendSms(MESSAGE);
  const body = calls[0].init.body as URLSearchParams;
  assert.equal(body.has("from"), false);
  assert.equal(body.has("notify_url"), false);
});

test("SMSAPI: a text that is not GSM-7 or not one segment never leaves the Worker", async () => {
  const { calls, impl } = fakeFetch(() => json({ count: 1, list: [{ id: "x" }] }));
  const provider = createSmsapiProvider({ token: "t", fetch: impl });

  assert.deepEqual(await provider.sendSms({ to: MESSAGE.to, text: "Powódź" }), {
    ok: false,
    retryable: false,
    code: "not_gsm7",
  });
  assert.deepEqual(await provider.sendSms({ to: MESSAGE.to, text: "x".repeat(161) }), {
    ok: false,
    retryable: false,
    code: "bad_length",
  });
  assert.deepEqual(await provider.sendSms({ to: MESSAGE.to, text: "" }), {
    ok: false,
    retryable: false,
    code: "bad_length",
  });
  assert.equal(calls.length, 0);
});

test("SMSAPI: only the errors the docs say to repeat are retryable", () => {
  for (const code of [200, 202, 203]) {
    assert.deepEqual(readSmsapiResponse(200, { error: code, message: "x" }), {
      ok: false,
      retryable: true,
      code: `smsapi_${code}`,
    });
  }
  for (const code of [11, 12, 13, 14, 52, 101, 103, 105, 201, 999]) {
    assert.deepEqual(readSmsapiResponse(200, { error: code, message: "x" }), {
      ok: false,
      retryable: false,
      code: `smsapi_${code}`,
    });
  }
  // An error body wins over the HTTP status.
  assert.deepEqual(readSmsapiResponse(500, { error: 103, message: "x" }), {
    ok: false,
    retryable: false,
    code: "smsapi_103",
  });
});

test("SMSAPI: without a usable body the HTTP status decides", () => {
  assert.deepEqual(readSmsapiResponse(503, null), { ok: false, retryable: true, code: "http_503" });
  assert.deepEqual(readSmsapiResponse(429, null), { ok: false, retryable: true, code: "http_429" });
  assert.deepEqual(readSmsapiResponse(401, null), { ok: false, retryable: false, code: "http_401" });
  assert.deepEqual(readSmsapiResponse(200, null), { ok: false, retryable: false, code: "bad_response" });
  assert.deepEqual(readSmsapiResponse(200, { count: 0, list: [] }), {
    ok: false,
    retryable: false,
    code: "bad_response",
  });
});

test("SMSAPI: a network error or a non-JSON 5xx is retryable", async () => {
  const throwing = createSmsapiProvider({
    token: "t",
    fetch: () => Promise.reject(new Error("boom")),
  });
  assert.deepEqual(await throwing.sendSms(MESSAGE), { ok: false, retryable: true, code: "network" });

  const { impl } = fakeFetch(() => new Response("<html>bad gateway</html>", { status: 502 }));
  assert.deepEqual(await createSmsapiProvider({ token: "t", fetch: impl }).sendSms(MESSAGE), {
    ok: false,
    retryable: true,
    code: "http_502",
  });
});
