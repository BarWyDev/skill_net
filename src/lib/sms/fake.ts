// The fake SMS provider (S-07): what local dev, CI, previews and any Worker without `SMSAPI_TOKEN`
// use, so none of them ever sends a real SMS. It keeps the last few sends in memory for tests and
// for walking the flow locally. Nothing is logged here; callers log alert ids only.
// Relative imports only, so `node:test` can load it.

import { DUPLICATE, type SmsMessage, type SmsProvider, type SmsResult } from "./provider.ts";

/** How many sends the fake remembers. A Worker isolate can live long; this keeps it bounded. */
export const FAKE_HISTORY = 50;

export interface FakeSmsProvider extends SmsProvider {
  readonly name: "fake";
  /** The most recent sends, oldest first. */
  readonly sent: readonly (SmsMessage & { providerId: string })[];
  /** Makes the next `sendSms` calls return this result instead of succeeding. */
  failNext(result: Extract<SmsResult, { ok: false }>, times?: number): void;
  reset(): void;
}

export function createFakeProvider(): FakeSmsProvider {
  const sent: (SmsMessage & { providerId: string })[] = [];
  const failures: Extract<SmsResult, { ok: false }>[] = [];
  // Bounded like `sent`: the oldest keys are forgotten first.
  const keys: string[] = [];
  let counter = 0;

  return {
    name: "fake",
    sent,
    sendSms(message: SmsMessage): Promise<SmsResult> {
      const failure = failures.shift();
      if (failure) return Promise.resolve(failure);

      // Like SMSAPI's `check_idx`: a key is taken once.
      if (message.idempotencyKey) {
        if (keys.includes(message.idempotencyKey)) {
          return Promise.resolve({ ok: false, retryable: false, code: DUPLICATE });
        }
        keys.push(message.idempotencyKey);
        if (keys.length > FAKE_HISTORY) keys.shift();
      }

      counter += 1;
      const providerId = `fake-${counter}`;
      sent.push({ ...message, providerId });
      if (sent.length > FAKE_HISTORY) sent.shift();
      return Promise.resolve({ ok: true, providerId });
    },
    failNext(result, times = 1) {
      for (let i = 0; i < times; i += 1) failures.push(result);
    },
    reset() {
      sent.length = 0;
      keys.length = 0;
      failures.length = 0;
      counter = 0;
    },
  };
}
