// The SMS provider interface (S-07): one method over `fetch`, no SDK (Node stubs fail on workerd).
// Callers never log `to` or `text`; they log alert ids and result codes only.

export interface SmsMessage {
  /** Normalised `+48XXXXXXXXX`. */
  to: string;
  /** GSM-7 only, at most one segment (see text.ts). */
  text: string;
}

export type SmsResult =
  | { ok: true; providerId: string }
  /** `retryable` says whether sending the same message again later can succeed. */
  | { ok: false; retryable: boolean; code: string };

export interface SmsProvider {
  readonly name: "smsapi" | "fake";
  sendSms(message: SmsMessage): Promise<SmsResult>;
}
