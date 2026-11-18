import type { APIRoute } from "astro";
import {
  SMSAPI_SENDER,
  SMSAPI_TOKEN,
  SMS_PROVIDER,
  SMS_WORKER_TOKEN,
  SUPABASE_KEY,
  SUPABASE_URL,
} from "astro:env/server";
import { env } from "cloudflare:workers";
import { ALERT_COUNT_MAX, parseAlertCount } from "@/lib/alert-format";
import { redirectWithError } from "@/lib/flash";
import { queueCrisisAlerts } from "@/lib/services/crisis";
import { createAlertRuntime } from "@/lib/sms/alert-runtime";
import { SEND_BATCH_MAX } from "@/lib/sms/queue";
import { createClient } from "@/lib/supabase";

// Sends a crisis SMS alert to the next N people on the list (S-07). The middleware gates this
// prefix (coordinators only, Cache-Control: private, no-store), and queue_crisis_alerts checks the
// role again and decides who may be texted. In an exercise it only simulates: nothing is queued.
// Never log alert ids together with anything that identifies a resident.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SEND_FAILED =
  "Nie udało się przekazać alertów do wysyłki. Osoby z tej partii są oznaczone jako „nie wysłano” i nie dostaną SMS-a.";

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return context.redirect("/auth/signin");
  }

  const id = context.params.id ?? "";
  if (!UUID_RE.test(id)) {
    return redirectWithError(context, "/koordynator", "Nie znaleziono kryzysu.");
  }
  const back = `/koordynator/kryzys/${id}`;

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return redirectWithError(context, back, "Supabase nie jest skonfigurowany.");
  }

  const count = parseAlertCount((await context.request.formData()).get("count"));
  if (count === null) {
    return redirectWithError(context, back, `Podaj liczbę osób od 1 do ${ALERT_COUNT_MAX}.`);
  }

  const result = await queueCrisisAlerts(supabase, id, count);
  if (!result.ok) {
    return redirectWithError(context, back, result.message);
  }

  if (result.alertIds.length > 0) {
    const delivered = await deliver(result.alertIds);
    if (!delivered) {
      return redirectWithError(context, back, SEND_FAILED);
    }
  }

  return context.redirect(`${back}?alert=1#alerty`);
};

/**
 * Hands the queued alerts to the sender. With the queue bound (production, staging, local dev) the
 * ids go to Cloudflare Queues and the consumer in src/worker.ts sends them. Without it (previews,
 * `astro preview`) they are sent in this request, which is only ever the fake provider's job: a
 * Worker with real SMS credentials always has the queue.
 */
async function deliver(alertIds: string[]): Promise<boolean> {
  const runtime = createAlertRuntime({
    SUPABASE_URL,
    SUPABASE_KEY,
    SMS_WORKER_TOKEN,
    SMSAPI_TOKEN,
    SMS_PROVIDER,
    SMSAPI_SENDER,
  });

  if (env.SMS_ALERTS) {
    for (let start = 0; start < alertIds.length; start += SEND_BATCH_MAX) {
      const chunk = alertIds.slice(start, start + SEND_BATCH_MAX);
      try {
        await env.SMS_ALERTS.sendBatch(chunk.map((alertId) => ({ body: { alertId } })));
      } catch {
        // This chunk and the ones after it never reached the queue: record them as not sent.
        await runtime?.failAll(alertIds.slice(start));
        return false;
      }
    }
    return true;
  }

  if (!runtime) return false;
  for (const alertId of alertIds) {
    try {
      // "retry" has no queue to go back to here, so the alert is recorded as not sent.
      if ((await runtime.dispatch(alertId)) === "retry") await runtime.deadLetter(alertId);
    } catch {
      await runtime.failAll([alertId]);
    }
  }
  return true;
}
