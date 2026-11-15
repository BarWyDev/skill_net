---
change_id: staging-environment
title: Stable staging at staging.skillnet.org.pl and production by promotion
status: planned
created: 2026-11-15
updated: 2026-11-15
archived_at: null
---

## Notes

Follows `context/changes/staging-and-domain/` (staging Supabase project, production on `skillnet.org.pl`). Decided by the owner on 2026-11-15:

- Staging gets one stable address, `https://staging.skillnet.org.pl`, behind Cloudflare Access, on the staging Supabase project. Worker Previews can't carry a custom domain, so this is a second Worker, `skillnet-staging`.
- A merge to `master` deploys staging only. Production deploys only from the `production` branch, through a promotion PR `master` → `production`.
- Branch previews (`<branch>-skillnet.barwy.workers.dev`) stay as they are, for trying one PR before it merges.

Checked on 2026-11-15: `CLOUDFLARE_ENV=staging npm run build` makes `@astrojs/cloudflare` flatten `env.staging` from `wrangler.jsonc` into `dist/server/wrangler.json` (name `skillnet-staging`, its own routes, KV and rate limiters), so a plain `npx wrangler deploy` afterwards targets the staging Worker. No second config file is needed.
