// The Worker entry (wrangler.jsonc `main`). `fetch` is the adapter's own handler, unchanged; this
// file exists only to add the `queue` handler for SMS alerts (S-07), which the adapter's default
// entry cannot carry.
import { handle } from "@astrojs/cloudflare/handler";

import { createAlertRuntime, type AlertRuntimeEnv } from "@/lib/sms/alert-runtime";
import { handleSmsBatch, type QueueBatch } from "@/lib/sms/queue";

export default {
  fetch: handle,

  // Consumes `skillnet-sms-alerts` and its dead-letter queue. The main queue claims each alert,
  // sends it and records the result; the dead-letter queue records alerts whose retries ran out.
  // The settings come from the Worker's own `env`: `astro:env` belongs to a request, and a queue
  // batch has none.
  async queue(batch: QueueBatch, env: AlertRuntimeEnv): Promise<void> {
    const runtime = createAlertRuntime(env);
    if (!runtime) {
      // Not configured (no database or no worker token): nothing can be sent or recorded now.
      // Retrying keeps the messages until the retries run out; nothing is lost silently.
      for (const message of batch.messages) message.retry();
      return;
    }
    await handleSmsBatch(batch, runtime);
  },
};
