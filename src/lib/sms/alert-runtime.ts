// Wires `dispatchAlert` to the real database and SMS provider (S-07). Used by the queue consumer
// (src/worker.ts, settings from the Worker's `env`) and by the alert route when no queue is bound
// (previews and tests, settings from `astro:env/server`), so it takes the settings as an argument.
// The token-gated RPCs are callable only by `anon`: the client carries the publishable key and no
// session. Never log a claim, a number or the token.

import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/db/database.types";
import { getSmsProvider, type SmsEnv } from "@/lib/sms";
import { deadLetterAlert, dispatchAlert, type DispatchDeps } from "@/lib/sms/dispatch";
import type { AlertOutcome } from "@/lib/sms/queue";

type MarkSentArgs = Database["public"]["Functions"]["mark_crisis_alert_sent"]["Args"];

export interface AlertRuntimeEnv extends SmsEnv {
  SUPABASE_URL?: string;
  SUPABASE_KEY?: string;
  SMS_WORKER_TOKEN?: string;
}

export interface AlertRuntime {
  dispatch(alertId: string): Promise<AlertOutcome>;
  deadLetter(alertId: string): Promise<AlertOutcome>;
  /** Records alerts that could not even be put on the queue. Best effort: failures are swallowed. */
  failAll(alertIds: readonly string[]): Promise<void>;
}

/** Null when the database or the worker token is not configured: nothing can be sent or recorded. */
export function createAlertRuntime(env: AlertRuntimeEnv): AlertRuntime | null {
  const { SUPABASE_URL: url, SUPABASE_KEY: key, SMS_WORKER_TOKEN: token } = env;
  if (!url || !key || !token) return null;

  const supabase = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const provider = getSmsProvider(env);

  // A failed RPC throws, so the queue redelivers the message instead of losing the alert.
  const deps: DispatchDeps = {
    async claim(alertId) {
      const { data, error } = await supabase.rpc("claim_crisis_alert", { p_token: token, p_alert_id: alertId });
      if (error) throw new Error(`claim_crisis_alert: ${error.code}`);
      const row = data.at(0);
      return row ? { phone: row.phone, crisisType: row.crisis_type, epicentrePostcode: row.epicentre_postcode } : null;
    },
    send: (message) => provider.sendSms(message),
    async markSent(alertId, providerId) {
      // The generated types mark every RPC argument non-null, but SQL accepts a null provider id
      // (a duplicate the provider already took).
      const args = { p_token: token, p_alert_id: alertId, p_provider_id: providerId } as MarkSentArgs;
      const { error } = await supabase.rpc("mark_crisis_alert_sent", args);
      if (error) throw new Error(`mark_crisis_alert_sent: ${error.code}`);
    },
    async markFailed(alertId) {
      const { error } = await supabase.rpc("mark_crisis_alert_failed", { p_token: token, p_alert_id: alertId });
      if (error) throw new Error(`mark_crisis_alert_failed: ${error.code}`);
    },
  };

  return {
    dispatch: (alertId) => dispatchAlert(alertId, deps),
    deadLetter: (alertId) => deadLetterAlert(alertId, deps),
    async failAll(alertIds) {
      await Promise.allSettled(alertIds.map((id) => deps.markFailed(id)));
    },
  };
}
