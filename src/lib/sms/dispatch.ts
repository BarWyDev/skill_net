// Sending one queued crisis alert (S-07): claim it, send it, record what happened. A pure function
// with its dependencies injected, so the decisions are testable without a database or a provider.
// Never log the claim's phone or the text; alert ids and result codes only.
// Relative imports only, so `node:test` can load it.

import { DUPLICATE, type SmsMessage, type SmsResult } from "./provider.ts";
import type { AlertOutcome } from "./queue.ts";
import { alertText } from "./text.ts";

/** What `claim_crisis_alert` returns for an alert that may still be sent. */
export interface AlertClaim {
  phone: string;
  /** The crisis type's Polish name, e.g. "Awaria prądu". */
  crisisType: string;
  epicentrePostcode: string | null;
}

export interface DispatchDeps {
  /** Null when there is nothing to send: the alert is gone, already handled or no longer eligible. */
  claim(alertId: string): Promise<AlertClaim | null>;
  send(message: SmsMessage): Promise<SmsResult>;
  /** `providerId` is null when the provider reported a duplicate of a message it already took. */
  markSent(alertId: string, providerId: string | null): Promise<void>;
  markFailed(alertId: string): Promise<void>;
}

/**
 * Sends one alert.
 *   * nothing to claim → ack (the database already recorded why);
 *   * sent → mark sent, ack;
 *   * the provider already has this alert (a retry after a lost answer) → mark sent, ack;
 *   * a retryable provider error → retry: the queue redelivers, and after `max_retries` the
 *     message goes to the dead-letter queue, whose consumer marks the alert failed;
 *   * a fatal provider error → mark failed, ack.
 * A dependency that throws (the database is unreachable) propagates, and the batch loop retries
 * the message. The alert's id is the idempotency key, so that retry cannot send a second SMS.
 */
export async function dispatchAlert(alertId: string, deps: DispatchDeps): Promise<AlertOutcome> {
  const claim = await deps.claim(alertId);
  if (!claim) return "ack";

  const result = await deps.send({
    to: claim.phone,
    text: alertText({ crisisTypeLabel: claim.crisisType, postcode: claim.epicentrePostcode }),
    idempotencyKey: alertId,
  });

  if (result.ok) {
    await deps.markSent(alertId, result.providerId);
    return "ack";
  }
  if (result.code === DUPLICATE) {
    await deps.markSent(alertId, null);
    return "ack";
  }
  if (result.retryable) return "retry";

  await deps.markFailed(alertId);
  return "ack";
}

/** The dead-letter queue's handler: the retries ran out, so the alert is recorded as not sent. */
export async function deadLetterAlert(alertId: string, deps: Pick<DispatchDeps, "markFailed">): Promise<AlertOutcome> {
  await deps.markFailed(alertId);
  return "ack";
}
