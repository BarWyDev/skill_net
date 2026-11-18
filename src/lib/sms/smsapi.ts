// SMSAPI.pl client (S-07). Checked against https://www.smsapi.pl/docs/ on 2026-11-17:
//   * POST https://api.smsapi.pl/sms.do, `Authorization: Bearer <token>`, form-encoded body;
//   * `format=json` answers `{ count, list: [{ id, points, number, status, … }] }` on success and
//     `{ error: <code>, message }` on failure;
//   * `notify_url` overrides the account's delivery-report callback for this message;
//   * `nounicode=1` makes SMSAPI refuse (error 11) a text with special characters instead of
//     sending it as UCS-2, and `max_parts=1` refuses (error 12) a text longer than one segment.
//     Both are cost guards behind the local `isGsm7` and length checks.
// Never log the number, the text or the token.
// Relative imports only, so `node:test` can load it.

import type { SmsMessage, SmsProvider, SmsResult } from "./provider.ts";
import { SMS_MAX_LENGTH, isGsm7 } from "./text.ts";

export const SMSAPI_URL = "https://api.smsapi.pl/sms.do";

// Error codes the docs tell the client to repeat: 200 (failed send attempt), 202 (too many
// concurrent requests) and 203 (too many requests). 201 and 999 are internal errors the docs say
// to report, not repeat, so a message that may already be on its way is not sent twice.
const RETRYABLE_ERRORS = new Set([200, 202, 203]);

const TIMEOUT_MS = 10_000;

export interface SmsapiOptions {
  token: string;
  /** A sender name registered in the SMSAPI panel. Without it the account's default is used. */
  sender?: string;
  /** Delivery-report webhook for this message. */
  notifyUrl?: string;
  /** Injected in tests. */
  fetch?: typeof fetch;
}

function failure(code: string, retryable: boolean): SmsResult {
  return { ok: false, retryable, code };
}

/** Reads SMSAPI's JSON answer. Exported for tests. */
export function readSmsapiResponse(status: number, body: unknown): SmsResult {
  if (typeof body === "object" && body !== null) {
    const { error, list } = body as { error?: unknown; list?: unknown };
    if (typeof error === "number" || typeof error === "string") {
      const code = Number(error);
      return failure(`smsapi_${String(error)}`, RETRYABLE_ERRORS.has(code));
    }
    if (Array.isArray(list)) {
      const id = (list as { id?: unknown }[]).at(0)?.id;
      // The docs show a string id; a numeric one is accepted too, so a sent message is never
      // reported as failed over its id's type.
      if ((typeof id === "string" && id !== "") || typeof id === "number") {
        return { ok: true, providerId: String(id) };
      }
    }
  }
  if (status === 429 || status >= 500) return failure(`http_${status}`, true);
  if (status >= 400) return failure(`http_${status}`, false);
  return failure("bad_response", false);
}

export function createSmsapiProvider(options: SmsapiOptions): SmsProvider {
  const doFetch = options.fetch ?? fetch;

  return {
    name: "smsapi",
    async sendSms({ to, text }: SmsMessage): Promise<SmsResult> {
      // Refused here, before any cost: a non-GSM-7 or over-long text is a bug in the caller.
      if (!isGsm7(text)) return failure("not_gsm7", false);
      if (text.length === 0 || text.length > SMS_MAX_LENGTH) return failure("bad_length", false);

      const body = new URLSearchParams({
        to: to.replace(/^\+/, ""),
        message: text,
        format: "json",
        encoding: "utf-8",
        nounicode: "1",
        max_parts: "1",
      });
      if (options.sender) body.set("from", options.sender);
      if (options.notifyUrl) body.set("notify_url", options.notifyUrl);

      let response: Response;
      try {
        response = await doFetch(SMSAPI_URL, {
          method: "POST",
          headers: { Authorization: `Bearer ${options.token}` },
          body,
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch {
        // A timeout or a network error: SMSAPI may or may not have taken the message.
        return failure("network", true);
      }

      let parsed: unknown = null;
      try {
        parsed = await response.json();
      } catch {
        // Not JSON; the status code decides below.
      }
      return readSmsapiResponse(response.status, parsed);
    },
  };
}
