import { SMSAPI_SENDER, SMSAPI_TOKEN, SMS_PROVIDER, SMS_WORKER_TOKEN } from "astro:env/server";
import type { Database } from "@/db/database.types";
import { getSmsProvider } from "@/lib/sms";
import { parseReply } from "@/lib/sms/reply";
import { endedText, unclearText } from "@/lib/sms/text";
import type { DeliveryReport, IncomingReply } from "@/lib/sms/webhook";
import { createPublicClient } from "@/lib/supabase";

// What SMSAPI's callbacks do (S-07). The database functions are gated by the worker token and
// callable only by `anon`, so they run on the cookie-less public client.
// Never log a number, a reply's text or the token here: outcomes and error codes only.

type RecordStatusArgs = Database["public"]["Functions"]["record_sms_status"]["Args"];

// Every `raise exception` in the RPCs has the code P0001 and a fixed message with nothing personal
// in it (worker_token_unset, invalid_status, …), so the message is what tells failures apart.
function errorLabel(error: { code: string; message: string }): string {
  return error.code === "P0001" ? error.message : error.code;
}

/**
 * `false` means the callback was not processed and SMSAPI should send it again (the route answers
 * with an error instead of `OK`).
 */
export type WebhookResult = boolean;

function connect() {
  const supabase = createPublicClient();
  return supabase && SMS_WORKER_TOKEN ? { supabase, token: SMS_WORKER_TOKEN } : null;
}

/** Records the delivery reports of one callback. Each one is idempotent, so a repeat is harmless. */
export async function recordDeliveryReports(reports: readonly DeliveryReport[]): Promise<WebhookResult> {
  if (reports.length === 0) return true;
  const db = connect();
  if (!db) return false;

  let ok = true;
  for (const report of reports) {
    // The generated types mark every RPC argument non-null, but SQL accepts a null id.
    const args = {
      p_token: db.token,
      p_provider_id: report.providerId,
      p_alert_id: report.alertId,
      p_status: report.status,
    } as RecordStatusArgs;
    const { error } = await db.supabase.rpc("record_sms_status", args);
    if (error) {
      // eslint-disable-next-line no-console -- an error label only; a failing webhook is otherwise invisible
      console.error("sms report webhook: record_sms_status failed", errorLabel(error));
      ok = false;
    }
  }
  return ok;
}

/**
 * Records a resident's reply and, when the database says so, sends the one auto-reply: "the
 * action is over" or "answer TAK or NIE". The database has already applied the per-number limit
 * and the daily budget, and it answers `unknown` for a stranger, who gets nothing.
 */
export async function recordIncomingReply(reply: IncomingReply): Promise<WebhookResult> {
  const db = connect();
  if (!db) return false;

  const { data: outcome, error } = await db.supabase.rpc("record_sms_reply", {
    p_token: db.token,
    p_phone: reply.from,
    p_answer: parseReply(reply.text) ?? "unclear",
    ...(reply.sentAt ? { p_sent_at: reply.sentAt } : {}),
  });
  if (error) {
    // eslint-disable-next-line no-console -- an error label only; a failing webhook is otherwise invisible
    console.error("sms reply webhook: record_sms_reply failed", errorLabel(error));
    return false;
  }

  if (outcome === "ended" || outcome === "unclear") {
    const provider = getSmsProvider({ SMSAPI_TOKEN, SMS_PROVIDER, SMSAPI_SENDER });
    // A failed auto-reply is not a reason to ask SMSAPI to repeat the callback: the reply itself
    // is handled, and the hourly limit would refuse the second attempt anyway.
    await provider.sendSms({ to: reply.from, text: outcome === "ended" ? endedText() : unclearText() });
  }
  return true;
}
