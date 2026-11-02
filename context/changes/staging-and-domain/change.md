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

## State on 2026-11-02 (paused)

Done: Phase 1 (`8f2b187`), Phase 2 (`e15bd08`, staging ref `blljprzpmmpawkjkhfsa`, eu-central-1, test accounts `mieszkaniec@staging.test` and `koordynator@staging.test`, passwords in the owner's password manager), Phase 5 (`2905d8f`), dev-guard patch applied by the owner (4.1). Preview base-config secrets `SUPABASE_URL` and `SUPABASE_KEY` point at staging. Draft PR BarWyDev/skill_net#114.

Also fixed on 2026-11-02: the Cloudflare Access policy for preview URLs had "Emails ending in `@bartoszwysocki82@gmail.com`", which matched nobody. It is now "Emails: bartoszwysocki82@gmail.com".

Open blocker: Workers Builds still runs `versions upload` for branch builds (builds `0a8251f4` and `e4c7903f`), although Previews Base shows `env -u WRANGLER_CI_MATCH_TAG npx wrangler preview`. Until that is fixed, every push to a branch serves its preview alias from a version with production's secrets, so **branch previews run against production**. A local `npx wrangler preview --name feat/staging-and-domain` works: deployment `https://05701529-skillnet.barwy.workers.dev` signs in with the staging account and refuses the production demo account.

Next steps:

1. Owner: in build `e4c7903f` → Build settings, read the Deploy command. Then in Settings → Build → Previews Base turn "Builds for Preview branches" off, save, turn it back on with the `wrangler preview` command, save.
2. Push a commit and check with the API that the branch build creates a Preview deployment (`/workers/workers/skillnet/previews/<id>/deployments/latest`), not a version with `workers/alias`.
3. If it still uploads a version: Workers Builds trigger via API (token with Workers Builds Configuration: Edit, or the Cloudflare MCP after `/mcp`), or a Cloudflare support ticket.
4. Finish 3.2 (sign-up refused on the preview) and 3.3 (`/profil`; `select public.grant_coordinator('koordynator@staging.test', '…')` in the staging SQL Editor, then `/koordynator`), plus 4.2 and 5.2.
5. Update `infrastructure.md` and CLAUDE.md with the Workers Builds finding, consider adding the rate-limit bindings to `previews` in `wrangler.jsonc` (wrangler warns they are missing), then Phases 6–7 (domain).
