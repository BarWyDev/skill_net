---
change_id: staging-environment
title: Stable staging at staging.skillnet.org.pl and production by promotion
status: implementing
created: 2026-11-15
updated: 2026-11-16
archived_at: null
---

## Notes

Follows `context/archive/2026-10-29-staging-and-domain/` (staging Supabase project, production on `skillnet.org.pl`). Decided by the owner on 2026-11-15:

- Staging gets one stable address, `https://staging.skillnet.org.pl`, behind Cloudflare Access, on the staging Supabase project. Worker Previews can't carry a custom domain, so this is a second Worker, `skillnet-staging`.
- A merge to `master` deploys staging only. Production deploys only from the `production` branch, through a promotion PR `master` → `production`.
- Branch previews (`<branch>-skillnet.barwy.workers.dev`) stay as they are, for trying one PR before it merges.

Checked on 2026-11-15: `CLOUDFLARE_ENV=staging npm run build` makes `@astrojs/cloudflare` flatten `env.staging` from `wrangler.jsonc` into `dist/server/wrangler.json` (name `skillnet-staging`, its own routes, KV and rate limiters), so a plain `npx wrangler deploy` afterwards targets the staging Worker. No second config file is needed.

## State on 2026-11-15 (Phase 2 mostly done)

Phase 1 merged as PR BarWyDev/skill_net#121 (`50b8002`); production deployed it with no visible change. KV namespace `skillnet-session-staging` is `164402d7b284455095617f8b171a8853`.

Phase 2, done with the owner:

- Access application `staging` for `staging.skillnet.org.pl` with policy `owner-only` (Include → Emails: owner's address). The older policy named "Email domain: …" is the preview policy; only its name is misleading, its rule is Emails, and the preview app uses it. Don't delete it.
- The dashboard's "Import a repository" wizard asks only for a project name and builds with the defaults (`npm run build`, `npx wrangler deploy`). That would deploy the production config, with the `skillnet.org.pl` routes, under the staging name. So the Worker was created from the CLI instead: `npm run build:staging` on `origin/master`, then `npx wrangler deploy` (version `ae97e3ac`). Then the owner connected the repository in Settings → Builds: production branch `master`, build `npm run build:staging`, deploy `npx wrangler deploy`, builds for preview branches off.
- Secrets `SUPABASE_URL` and `SUPABASE_KEY` set on `skillnet-staging` with staging values. The first try put the key into `SUPABASE_URL` (500, `Invalid supabaseUrl` in `wrangler tail`); fixed. The masked prompt shows one star per character, so the URL is 40 stars.
- Staging Supabase URL Configuration: Site URL `https://staging.skillnet.org.pl`, Redirect URLs add `https://staging.skillnet.org.pl/**`.

Verified: `staging.skillnet.org.pl` answers 302 to Cloudflare Access; after Access, `koordynator@staging.test` signs in, `/koordynator` opens and `/mapa` shows the synthetic seed around Kraków; no errors in the tail.

Left: 2.2 (a `master` build creates a `skillnet-staging` version; this PR's merge is that test), then Phase 3 (needs a new Cloudflare user token with Workers CI: Edit to check the `master` trigger of `skillnet`).

## State on 2026-11-16 (Phase 3 switched, verification left)

2.2 passed: the merge of PR BarWyDev/skill_net#122 (`a8e54b7`) built `skillnet-staging` version `61a3295d` from `master` and deployed it at 100%.

Phase 3, done with the owner:

- `production` created on GitHub at `a8e54b7`, the commit of the production deployment (`skillnet` version `02754d99`, built by Workers Builds from `master`).
- Ruleset `production` (active, empty bypass list): restrict deletions, block force pushes, PR required with 0 approvals, required checks `ci`, `smoke` and `promotion-source`, no up-to-date requirement (merge commits on `production` never reach `master`, so it would block every promotion after the first).
- `skillnet` Workers Builds: production branch `production` (`npm run build`, `npx wrangler deploy`); Previews Base stays on with `env -u WRANGLER_CI_MATCH_TAG npx wrangler preview`. The Builds API now shows one trigger, `branch_includes: ["production"]`. All 92 earlier `skillnet` builds came from `master`, so what a `master` push does now is confirmed only by 3.1.
- The Cloudflare permission the plan calls "Workers CI: Edit" is named **Workers Builds Configuration: Edit** in the dashboard. The owner's check token has no expiry; delete it and `~/.cf-builds-token` when Phase 3 ends.
- Read-only smoke on `https://skillnet.org.pl` passed after the switch (3.2).

Left: 3.1 (this PR's merge must create a `skillnet-staging` version and no `skillnet` version), 3.3 (a PR into `production` from another branch fails `promotion-source`), 3.4 (first promotion `master` → `production` deploys `skillnet`; read-only smoke after it), then Phase 4.
