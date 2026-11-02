---
change_id: staging-and-domain
title: Staging Supabase project and production on skillnet.org.pl
status: implementing
created: 2026-10-29
updated: 2026-11-02
archived_at: null
---

## Notes

Closes O-07 from `docs/audit/AUDYT-PRODUKCYJNY-2026-10-21.md` (no database staging: a bad migration goes straight to production) and Phase 8 of `context/changes/deployment/deployment-plan.md` (custom domain).

- A second free Supabase project, `skillnet-staging`, gets every migration before production. Branch previews talk to it, so a PR with a migration can be tried end to end behind Cloudflare Access.
- Production moves from `skillnet.barwy.workers.dev` to `https://skillnet.org.pl`. The old host and `www` answer with a 301 to the apex.

Staging comes first, so the domain change can be rehearsed against a working staging setup.

Found on 2026-11-02 while testing Phase 3: Workers Builds ran `env -u WRANGLER_CI_MATCH_TAG npx wrangler versions upload` for branches (Settings → Build → Previews Base). A version alias inherits production's secrets and bindings, so every branch preview since the switch ran against the production Supabase and production `SESSION` KV, and the preview base-config secrets were unused. The Previews Base command is now `env -u WRANGLER_CI_MATCH_TAG npx wrangler preview`.
