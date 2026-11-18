// Picks the SMS provider (S-07). SMSAPI is used only when its token is set and `SMS_PROVIDER` is
// not "fake"; everything else (local dev, CI, previews, a Worker that has no secrets yet) gets the
// fake provider, so a missing or half-done configuration can never send a real SMS.
// Relative imports only, so `node:test` can load it.

import { createFakeProvider, type FakeSmsProvider } from "./fake.ts";
import type { SmsProvider } from "./provider.ts";
import { createSmsapiProvider } from "./smsapi.ts";

export type { SmsMessage, SmsProvider, SmsResult } from "./provider.ts";

/** The SMS settings, as read from `astro:env/server` in a route or from `env` in the queue consumer. */
export interface SmsEnv {
  SMSAPI_TOKEN?: string;
  SMS_PROVIDER?: string;
  SMSAPI_SENDER?: string;
}

/** True when real SMS would be sent. */
export function usesRealSms(env: SmsEnv): boolean {
  return Boolean(env.SMSAPI_TOKEN) && env.SMS_PROVIDER !== "fake";
}

// One fake per isolate, so a send made by one request can be read by the next one in local dev.
let sharedFake: FakeSmsProvider | undefined;

export function getFakeProvider(): FakeSmsProvider {
  sharedFake ??= createFakeProvider();
  return sharedFake;
}

export interface SmsProviderOptions {
  /** Delivery-report webhook URL (it carries `SMS_WEBHOOK_SECRET`; never log it). */
  notifyUrl?: string;
  /** Injected in tests. */
  fetch?: typeof fetch;
}

export function getSmsProvider(env: SmsEnv, options: SmsProviderOptions = {}): SmsProvider {
  if (!usesRealSms(env) || !env.SMSAPI_TOKEN) return getFakeProvider();
  return createSmsapiProvider({
    token: env.SMSAPI_TOKEN,
    sender: env.SMSAPI_SENDER === "" ? undefined : env.SMSAPI_SENDER,
    notifyUrl: options.notifyUrl,
    fetch: options.fetch,
  });
}
