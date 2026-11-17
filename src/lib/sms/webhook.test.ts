// Reading SMSAPI's callbacks (S-07). Run with `npm run test:unit`.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  normaliseSender,
  readDeliveryReports,
  readIncomingReply,
  readParams,
  readReportStatus,
  secretMatches,
} from "./webhook.ts";

const ALERT_A = "0b0f8b3e-5f0a-4c66-9f0e-0d6a5a3c1a11";
const ALERT_B = "7c1d2e3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f";

test("secretMatches accepts only the configured secret", async () => {
  assert.equal(await secretMatches("s3cret", "s3cret"), true);
  assert.equal(await secretMatches("s3cret-", "s3cret"), false);
  assert.equal(await secretMatches("S3cret", "s3cret"), false);
  assert.equal(await secretMatches("", "s3cret"), false);
  assert.equal(await secretMatches(undefined, "s3cret"), false);
});

test("secretMatches is closed while no secret is configured", async () => {
  assert.equal(await secretMatches("anything", undefined), false);
  assert.equal(await secretMatches("", ""), false);
  assert.equal(await secretMatches(undefined, undefined), false);
});

test("readReportStatus keeps final outcomes only", () => {
  assert.equal(readReportStatus("404", "DELIVERED"), "delivered");
  assert.equal(readReportStatus("405", "UNDELIVERED"), "undelivered");
  assert.equal(readReportStatus("402", "EXPIRED"), "undelivered");
  assert.equal(readReportStatus("407", "REJECTED"), "undelivered");
  assert.equal(readReportStatus("406", "FAILED"), "failed");
  // The name alone is enough, in any case.
  assert.equal(readReportStatus(undefined, "delivered"), "delivered");
  assert.equal(readReportStatus("", " Undelivered "), "undelivered");
  for (const [code, name] of [
    ["401", "NOT_FOUND"],
    ["403", "SENT"],
    ["408", "UNKNOWN"],
    ["409", "QUEUE"],
    ["410", "ACCEPTED"],
    ["411", "RENEWAL"],
    ["412", "STOP"],
    ["", ""],
    ["999", "SOMETHING_NEW"],
  ]) {
    assert.equal(readReportStatus(code, name), null, `${code} ${name}`);
  }
  assert.equal(readReportStatus(undefined, undefined), null);
});

test("readDeliveryReports reads one report", () => {
  const params = new URLSearchParams({ MsgId: "613F1A", status: "404", status_name: "DELIVERED", idx: ALERT_A });
  assert.deepEqual(readDeliveryReports(params), [{ providerId: "613F1A", alertId: ALERT_A, status: "delivered" }]);
});

test("readDeliveryReports reads several comma-separated reports and drops the ones still on their way", () => {
  const params = new URLSearchParams({
    MsgId: "A1,B2,C3",
    status: "404,403,405",
    status_name: "DELIVERED,SENT,UNDELIVERED",
    idx: `${ALERT_A},,${ALERT_B.toUpperCase()}`,
  });
  assert.deepEqual(readDeliveryReports(params), [
    { providerId: "A1", alertId: ALERT_A, status: "delivered" },
    { providerId: "C3", alertId: ALERT_B, status: "undelivered" },
  ]);
});

test("readDeliveryReports ignores an idx that is not an alert id, and a report with no id at all", () => {
  // A verification code or an auto-reply carries no idx: the message id is all there is.
  assert.deepEqual(readDeliveryReports(new URLSearchParams({ MsgId: "A1", status: "404", idx: "not-a-uuid" })), [
    { providerId: "A1", alertId: null, status: "delivered" },
  ]);
  assert.deepEqual(readDeliveryReports(new URLSearchParams({ MsgId: "", status: "404", idx: ALERT_A })), [
    { providerId: null, alertId: ALERT_A, status: "delivered" },
  ]);
  assert.deepEqual(readDeliveryReports(new URLSearchParams({ status: "404", status_name: "DELIVERED" })), []);
  assert.deepEqual(readDeliveryReports(new URLSearchParams()), []);
});

test("readDeliveryReports stops at a bounded number of reports", () => {
  const many = Array.from({ length: 50 }, (_, i) => `M${i}`).join(",");
  const statuses = Array.from({ length: 50 }, () => "404").join(",");
  assert.equal(readDeliveryReports(new URLSearchParams({ MsgId: many, status: statuses })).length, 20);
});

test("normaliseSender reads the shapes a Polish sender arrives in", () => {
  for (const raw of [
    "48600123456",
    "+48600123456",
    "0048600123456",
    "600123456",
    "+48 600 123 456",
    "48-600-123-456",
  ]) {
    assert.equal(normaliseSender(raw), "+48600123456", raw);
  }
  // Nine digits that happen to start with 48 are a number, not a prefix.
  assert.equal(normaliseSender("486001234"), "+48486001234");
});

test("normaliseSender refuses anything that is not a Polish number", () => {
  for (const raw of ["", "SkillNet", "4915112345678", "8001", "+4860012345", "+486001234567", "0048"]) {
    assert.equal(normaliseSender(raw), null, raw);
  }
});

test("readIncomingReply returns the sender and the text", () => {
  const params = new URLSearchParams({ sms_from: "48600123456", sms_text: "Tak, będę", sms_to: "48500500500" });
  assert.deepEqual(readIncomingReply(params), { from: "+48600123456", text: "Tak, będę" });
  assert.deepEqual(readIncomingReply(new URLSearchParams({ sms_from: "48600123456" })), {
    from: "+48600123456",
    text: "",
  });
  assert.equal(readIncomingReply(new URLSearchParams({ sms_from: "Info", sms_text: "TAK" })), null);
  assert.equal(readIncomingReply(new URLSearchParams({ sms_text: "TAK" })), null);
});

test("readParams reads a GET's query string", async () => {
  const params = await readParams(new Request("https://example.test/hook/x?MsgId=A1&status=404"));
  assert.equal(params.get("MsgId"), "A1");
  assert.equal(params.get("status"), "404");
});

test("readParams reads a POST's form body over the query string", async () => {
  const urlencoded = new Request("https://example.test/hook/x?sms_from=1&extra=q", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded; charset=utf-8" },
    body: "sms_from=48600123456&sms_text=Tak%2C+b%C4%99d%C4%99",
  });
  const params = await readParams(urlencoded);
  assert.equal(params.get("sms_from"), "48600123456");
  assert.equal(params.get("sms_text"), "Tak, będę");
  assert.equal(params.get("extra"), "q");

  const form = new FormData();
  form.set("sms_from", "48600123456");
  form.set("sms_text", "NIE");
  const multipart = await readParams(new Request("https://example.test/hook/x", { method: "POST", body: form }));
  assert.equal(multipart.get("sms_text"), "NIE");
});

test("readParams survives a body it cannot read", async () => {
  const request = new Request("https://example.test/hook/x?MsgId=A1", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: '{"MsgId":"B2"}',
  });
  assert.equal((await readParams(request)).get("MsgId"), "A1");
});
