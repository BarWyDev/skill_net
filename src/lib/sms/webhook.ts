// Reading SMSAPI's callbacks (S-07). Checked against https://www.smsapi.pl/docs/ on 2026-11-17:
//   * a delivery report is a GET with `MsgId`, `status`, `status_name`, `idx` (and more). One
//     request can carry several reports: each parameter then holds up to 5 comma-separated values;
//   * an incoming SMS is a POST with `sms_from`, `sms_to`, `sms_text`, `sms_date`, `MsgId`;
//   * both must be answered with the string `OK`, or SMSAPI sends the request again.
// SMSAPI cannot sign callbacks, so the only gate is a secret in the URL path. Never log a number,
// a reply's text or that secret.
// Relative imports only, so `node:test` can load it.

const encoder = new TextEncoder();

async function sha256(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(text)));
}

/**
 * Compares the path secret with the configured one. Both are hashed first, so the comparison runs
 * over two fixed-length digests and its timing says nothing about the secret. An unset secret
 * matches nothing: the webhooks stay closed until it is configured.
 */
export async function secretMatches(given: string | undefined, expected: string | undefined): Promise<boolean> {
  if (!given || !expected) return false;
  const [a, b] = await Promise.all([sha256(given), sha256(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

/**
 * The callback's fields: the query string, then a form body's fields over them. Both are read
 * because the method SMSAPI uses is a setting of theirs, not ours.
 */
export async function readParams(request: Request): Promise<URLSearchParams> {
  const params = new URLSearchParams(new URL(request.url).search);
  if (request.method !== "POST") return params;

  const type = request.headers.get("content-type") ?? "";
  try {
    if (type.includes("application/x-www-form-urlencoded")) {
      for (const [name, value] of new URLSearchParams(await request.text())) params.set(name, value);
    } else if (type.includes("multipart/form-data")) {
      for (const [name, value] of await request.formData()) {
        if (typeof value === "string") params.set(name, value);
      }
    }
  } catch {
    // An unreadable body: whatever the query string carried is all there is.
  }
  return params;
}

/** What a delivery report means for an alert. */
export type ReportStatus = "delivered" | "undelivered" | "failed";

// SMSAPI's "Lista statusów doręczenia". Final outcomes only: 403 SENT, 409 QUEUE, 410 ACCEPTED and
// 411 RENEWAL are still on their way, 408 UNKNOWN says the operator sent no report (the message
// may have arrived), and 401 NOT_FOUND and 412 STOP say nothing about delivery.
const REPORT_STATUS: Partial<Record<string, ReportStatus>> = {
  "404": "delivered",
  DELIVERED: "delivered",
  "402": "undelivered",
  EXPIRED: "undelivered",
  "405": "undelivered",
  UNDELIVERED: "undelivered",
  "407": "undelivered",
  REJECTED: "undelivered",
  "406": "failed",
  FAILED: "failed",
};

/** Reads one report's status from its code or, failing that, its name. Null when it is not final. */
export function readReportStatus(code: string | undefined, name: string | undefined): ReportStatus | null {
  return REPORT_STATUS[code?.trim() ?? ""] ?? REPORT_STATUS[name?.trim().toUpperCase() ?? ""] ?? null;
}

export interface DeliveryReport {
  /** SMSAPI's message id (`MsgId`). */
  providerId: string | null;
  /** The alert's own id, which the consumer sent as `idx`. Null for a code or an auto-reply. */
  alertId: string | null;
  status: ReportStatus;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// SMSAPI sends at most 5 reports per request; anything far beyond that is not SMSAPI.
const MAX_REPORTS = 20;

function list(params: URLSearchParams, name: string): string[] {
  const raw = params.get(name);
  return raw ? raw.split(",").map((value) => value.trim()) : [];
}

/**
 * The reports of one callback that say something final about a message SkillNet can find: one per
 * position of the comma-separated lists. A report that is not final, or that names neither a
 * message id nor an alert id, is left out.
 */
export function readDeliveryReports(params: URLSearchParams): DeliveryReport[] {
  const ids = list(params, "MsgId");
  const codes = list(params, "status");
  const names = list(params, "status_name");
  const idxs = list(params, "idx");

  const count = Math.min(Math.max(ids.length, idxs.length), MAX_REPORTS);
  const reports: DeliveryReport[] = [];
  for (let i = 0; i < count; i += 1) {
    const status = readReportStatus(codes.at(i), names.at(i));
    const id = ids.at(i);
    const providerId = id === undefined || id === "" ? null : id;
    const idx = idxs.at(i);
    const alertId = idx && UUID_RE.test(idx) ? idx.toLowerCase() : null;
    if (status && (providerId || alertId)) reports.push({ providerId, alertId, status });
  }
  return reports;
}

/**
 * The sender of an incoming SMS as `+48XXXXXXXXX`, from `48…`, `+48…`, `0048…` or nine digits.
 * Null for anything else (a foreign number, a short code, a sender name): no resident has it.
 */
export function normaliseSender(raw: string): string | null {
  const digits = raw.replace(/\D/g, "").replace(/^(?:0048|48)(?=\d{9}$)/, "");
  return /^\d{9}$/.test(digits) ? `+48${digits}` : null;
}

export interface IncomingReply {
  /** Normalised `+48XXXXXXXXX`. */
  from: string;
  /** What the resident wrote. Parsed and dropped; never stored or logged. */
  text: string;
}

/** Reads an incoming SMS. Null when the sender is not a Polish number. */
export function readIncomingReply(params: URLSearchParams): IncomingReply | null {
  const from = normaliseSender(params.get("sms_from") ?? "");
  return from ? { from, text: params.get("sms_text") ?? "" } : null;
}
