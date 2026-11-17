// The SMS alert queue (S-07): message shape and the consumer's batch loop. The bindings are in
// wrangler.jsonc; the Worker entry (src/worker.ts) hands each batch to `handleSmsBatch`.
// The types below are the few fields of Cloudflare's Queue API this app uses, declared locally so
// `node:test` can load the module without Workers types.
// Relative imports only, so `node:test` can load it.

/** A message carries only the alert's id. The phone number and the text are read at claim time. */
export interface AlertMessage {
  alertId: string;
}

export interface QueueMessage {
  readonly id: string;
  readonly body: unknown;
  readonly attempts: number;
  ack(): void;
  retry(options?: { delaySeconds?: number }): void;
}

export interface QueueBatch {
  readonly queue: string;
  readonly messages: readonly QueueMessage[];
}

/** The producer binding (`SMS_ALERTS`). Missing on previews and wherever the queue is not bound. */
export interface AlertQueue {
  sendBatch(messages: Iterable<{ body: AlertMessage }>): Promise<unknown>;
}

/** Cloudflare accepts at most 100 messages per `sendBatch` call. */
export const SEND_BATCH_MAX = 100;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Reads a queue message body; null for anything that is not `{ alertId: <uuid> }`. */
export function parseAlertMessage(body: unknown): AlertMessage | null {
  if (typeof body !== "object" || body === null) return null;
  const { alertId } = body as { alertId?: unknown };
  if (typeof alertId !== "string" || !UUID_RE.test(alertId)) return null;
  return { alertId };
}

/** The dead-letter queue's name ends with this (`skillnet-sms-alerts-dlq`, `…-staging-dlq`). */
export function isDeadLetterQueue(queueName: string): boolean {
  return queueName.endsWith("-dlq");
}

export type AlertOutcome = "ack" | "retry";

export interface SmsBatchHandlers {
  /** Sends one alert. "retry" puts the message back (up to `max_retries`, then the DLQ). */
  dispatch(alertId: string): Promise<AlertOutcome>;
  /** Marks an alert that ran out of retries as failed. */
  deadLetter(alertId: string): Promise<AlertOutcome>;
}

/**
 * Runs a batch message by message. A body that is not an alert message is acked, because retrying
 * it can never help. A handler that throws puts its own message back and leaves the rest alone.
 */
export async function handleSmsBatch(batch: QueueBatch, handlers: SmsBatchHandlers): Promise<void> {
  const dead = isDeadLetterQueue(batch.queue);
  const handle = (alertId: string) => (dead ? handlers.deadLetter(alertId) : handlers.dispatch(alertId));

  for (const message of batch.messages) {
    const parsed = parseAlertMessage(message.body);
    if (!parsed) {
      message.ack();
      continue;
    }
    try {
      const outcome = await handle(parsed.alertId);
      if (outcome === "retry") message.retry();
      else message.ack();
    } catch {
      message.retry();
    }
  }
}
