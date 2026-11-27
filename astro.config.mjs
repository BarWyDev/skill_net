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
      // The interface languages this environment offers, e.g. "pl,en,uk" (src/lib/i18n/locale.ts).
      // Unset means Polish only. Set per environment under `vars` in wrangler.jsonc.
      ENABLED_LOCALES: envField.string({ context: "server", access: "public", optional: true }),
    },
  },
});
