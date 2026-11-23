// The SMS alert queue's batch loop (S-07). Run with `npm run test:unit`.

import assert from "node:assert/strict";
import { test } from "node:test";

import { handleSmsBatch, isDeadLetterQueue, parseAlertMessage, type AlertOutcome, type QueueMessage } from "./queue.ts";

const ID_A = "3f2b8c1e-5d47-4a9b-8e21-0c6f7d9a1b23";
const ID_B = "9a1d4e7f-2b3c-4d5e-9f60-1a2b3c4d5e6f";

function message(body: unknown) {
  const calls: string[] = [];
  const msg: QueueMessage = {
    id: "m",
    body,
    attempts: 1,
    ack: () => calls.push("ack"),
    retry: () => calls.push("retry"),
  };
  return { msg, calls };
}

test("parseAlertMessage accepts only { alertId: <uuid> }", () => {
  assert.deepEqual(parseAlertMessage({ alertId: ID_A }), { alertId: ID_A });
  assert.deepEqual(parseAlertMessage({ alertId: ID_A, extra: 1 }), { alertId: ID_A });
  for (const body of [null, undefined, "x", 5, {}, { alertId: 5 }, { alertId: "not-a-uuid" }, [ID_A]]) {
    assert.equal(parseAlertMessage(body), null, JSON.stringify(body));
  }
});

test("isDeadLetterQueue tells the two queues apart, on production and staging", () => {
  assert.equal(isDeadLetterQueue("skillnet-sms-alerts"), false);
  assert.equal(isDeadLetterQueue("skillnet-sms-alerts-staging"), false);
  assert.equal(isDeadLetterQueue("skillnet-sms-alerts-dlq"), true);
  assert.equal(isDeadLetterQueue("skillnet-sms-alerts-staging-dlq"), true);
});

test("the main queue dispatches each alert and follows its outcome", async () => {
  const a = message({ alertId: ID_A });
  const b = message({ alertId: ID_B });
  const outcomes: Record<string, AlertOutcome> = { [ID_A]: "ack", [ID_B]: "retry" };
  const dispatched: string[] = [];

  await handleSmsBatch(
    { queue: "skillnet-sms-alerts", messages: [a.msg, b.msg] },
    {
      dispatch: (id) => {
        dispatched.push(id);
        return Promise.resolve(outcomes[id]);
      },
      deadLetter: () => Promise.reject(new Error("not the DLQ")),
    },
  );

  assert.deepEqual(dispatched, [ID_A, ID_B]);
  assert.deepEqual(a.calls, ["ack"]);
  assert.deepEqual(b.calls, ["retry"]);
});

test("the dead-letter queue goes to deadLetter, never to dispatch", async () => {
  const a = message({ alertId: ID_A });
  const dead: string[] = [];

  await handleSmsBatch(
    { queue: "skillnet-sms-alerts-dlq", messages: [a.msg] },
    {
      dispatch: () => Promise.reject(new Error("not the main queue")),
      deadLetter: (id) => {
        dead.push(id);
        return Promise.resolve("ack");
      },
    },
  );

  assert.deepEqual(dead, [ID_A]);
  assert.deepEqual(a.calls, ["ack"]);
});

test("a malformed body is acked; a throwing handler retries only its own message", async () => {
  const bad = message({ nope: true });
  const boom = message({ alertId: ID_A });
  const fine = message({ alertId: ID_B });

  await handleSmsBatch(
    { queue: "skillnet-sms-alerts", messages: [bad.msg, boom.msg, fine.msg] },
    {
      dispatch: (id) => (id === ID_A ? Promise.reject(new Error("db down")) : Promise.resolve("ack")),
      deadLetter: () => Promise.resolve("ack"),
    },
  );

  assert.deepEqual(bad.calls, ["ack"]);
  assert.deepEqual(boom.calls, ["retry"]);
  assert.deepEqual(fine.calls, ["ack"]);
});
