// The Worker entry (wrangler.jsonc `main`). `fetch` is the adapter's own handler, unchanged; this
// file exists only to add the `queue` handler for SMS alerts (S-07), which the adapter's default
// entry cannot carry.
import { handle } from "@astrojs/cloudflare/handler";

import { handleSmsBatch, type QueueBatch } from "@/lib/sms/queue";

export default {
  fetch: handle,

  // Phase 1 of S-07 binds the queues but nothing produces messages yet. The handlers that claim an
  // alert, send it and mark it arrive with the `crisis_alerts` RPCs (Phase 3); until then a message
  // can only come from a manual `wrangler queues` send, and it is acked.
  async queue(batch: QueueBatch): Promise<void> {
    await handleSmsBatch(batch, {
      dispatch: () => Promise.resolve("ack"),
      deadLetter: () => Promise.resolve("ack"),
    });
  },
};
