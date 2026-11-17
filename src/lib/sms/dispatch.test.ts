// The alert consumer's decisions (S-07). Run with `npm run test:unit`.

import assert from "node:assert/strict";
import { test } from "node:test";

import { deadLetterAlert, dispatchAlert, type AlertClaim, type DispatchDeps } from "./dispatch.ts";
import type { SmsMessage, SmsResult } from "./provider.ts";
import { isGsm7 } from "./text.ts";

const ALERT = "3f2b8c1e-5d47-4a9b-8e21-0c6f7d9a1b23";
const CLAIM: AlertClaim = { phone: "+48600123456", crisisType: "Awaria prądu", epicentrePostcode: "31-001" };

function deps(claim: AlertClaim | null, result: SmsResult = { ok: true, providerId: "p-1" }) {
  const log: string[] = [];
  const sent: SmsMessage[] = [];
  const d: DispatchDeps = {
    claim: (id) => {
      log.push(`claim:${id}`);
      return Promise.resolve(claim);
    },
    send: (message) => {
      log.push("send");
      sent.push(message);
      return Promise.resolve(result);
    },
    markSent: (id, providerId) => {
      log.push(`sent:${id}:${String(providerId)}`);
      return Promise.resolve();
    },
    markFailed: (id) => {
      log.push(`failed:${id}`);
      return Promise.resolve();
    },
  };
  return { d, log, sent };
}

test("nothing to claim: the message is acked and nothing is sent", async () => {
  const { d, log } = deps(null);
  assert.equal(await dispatchAlert(ALERT, d), "ack");
  assert.deepEqual(log, [`claim:${ALERT}`]);
});

test("sent: the alert is marked with the provider's id, then acked", async () => {
  const { d, log, sent } = deps(CLAIM);
  assert.equal(await dispatchAlert(ALERT, d), "ack");
  assert.deepEqual(log, [`claim:${ALERT}`, "send", `sent:${ALERT}:p-1`]);

  assert.equal(sent[0].to, CLAIM.phone);
  assert.equal(sent[0].idempotencyKey, ALERT);
  assert.equal(isGsm7(sent[0].text), true);
  assert.ok(sent[0].text.includes("Awaria pradu"));
  assert.ok(sent[0].text.includes("(31-001)"));
});

test("a retryable provider error: retry, and the alert stays queued", async () => {
  const { d, log } = deps(CLAIM, { ok: false, retryable: true, code: "http_503" });
  assert.equal(await dispatchAlert(ALERT, d), "retry");
  assert.deepEqual(log, [`claim:${ALERT}`, "send"]);
});

test("a fatal provider error: the alert is marked failed, then acked", async () => {
  const { d, log } = deps(CLAIM, { ok: false, retryable: false, code: "smsapi_103" });
  assert.equal(await dispatchAlert(ALERT, d), "ack");
  assert.deepEqual(log, [`claim:${ALERT}`, "send", `failed:${ALERT}`]);
});

test("a duplicate: the provider already has it, so it is marked sent without an id", async () => {
  const { d, log } = deps(CLAIM, { ok: false, retryable: false, code: "duplicate" });
  assert.equal(await dispatchAlert(ALERT, d), "ack");
  assert.deepEqual(log, [`claim:${ALERT}`, "send", `sent:${ALERT}:null`]);
});

test("a failing database call propagates, so the batch loop retries the message", async () => {
  const { d } = deps(CLAIM);
  d.markSent = () => Promise.reject(new Error("db down"));
  await assert.rejects(dispatchAlert(ALERT, d), /db down/);

  const broken = deps(CLAIM);
  broken.d.claim = () => Promise.reject(new Error("db down"));
  await assert.rejects(dispatchAlert(ALERT, broken.d), /db down/);
  assert.deepEqual(broken.log, []);
});

test("dead letter: the alert is marked failed and the message acked", async () => {
  const { d, log } = deps(CLAIM);
  assert.equal(await deadLetterAlert(ALERT, d), "ack");
  assert.deepEqual(log, [`failed:${ALERT}`]);
});
