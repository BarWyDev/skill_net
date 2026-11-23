// @ts-check
import { defineConfig, envField } from "astro/config";

import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import cloudflare from "@astrojs/cloudflare";

// https://astro.build/config
export default defineConfig({
  site: "https://skillnet.org.pl",
  output: "server",
  integrations: [react(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
  // No page uses astro:assets. The default ("cloudflare-binding") would leave a public /_image
  // route that resizes through the billable IMAGES binding on anyone's request; passthrough serves
  // only the site's own static images, unchanged (security audit 2026-11-23, lead 3).
  adapter: cloudflare({ imageService: "passthrough" }),
  devToolbar: { enabled: false },
  env: {
    schema: {
      SUPABASE_URL: envField.string({ context: "server", access: "secret", optional: true }),
      SUPABASE_KEY: envField.string({ context: "server", access: "secret", optional: true }),
      // Public by design: it only identifies the widget. The secret lives in Supabase Auth.
      TURNSTILE_SITE_KEY: envField.string({ context: "server", access: "public", optional: true }),
      // SMS alerts and phone verification (S-07). Without SMSAPI_TOKEN the app uses the fake provider
      // and sends nothing. SMS_WEBHOOK_SECRET is the path secret of SMSAPI's callbacks, and
      // SMS_WORKER_TOKEN opens the token-gated database functions (its hash is in the database).
      SMSAPI_TOKEN: envField.string({ context: "server", access: "secret", optional: true }),
      SMS_WEBHOOK_SECRET: envField.string({ context: "server", access: "secret", optional: true }),
      SMS_WORKER_TOKEN: envField.string({ context: "server", access: "secret", optional: true }),
      // "fake" forces the fake provider even when the token is set.
      SMS_PROVIDER: envField.string({ context: "server", access: "public", optional: true }),
      // A sender name registered in the SMSAPI panel; empty means the account's default.
      SMSAPI_SENDER: envField.string({ context: "server", access: "public", optional: true }),
    },
  },
});
