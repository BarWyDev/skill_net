# Staging Supabase Project and Production on skillnet.org.pl — Plan Brief

> Full plan: `context/changes/staging-and-domain/plan.md`

## What & Why

Audit finding O-07: there is no database staging, so a bad migration goes straight to production. A second free Supabase project, `skillnet-staging`, gets every migration first and backs the branch previews. Afterwards production moves from `skillnet.barwy.workers.dev` to its own domain, `https://skillnet.org.pl` (Phase 8 of the deployment plan).

## Starting Point

There is one Supabase project (production), and migrations reach it by a manual `db push` after the merge. Previews have no secrets, so auth is off there. The `skillnet.org.pl` zone is already on Cloudflare (S-16) but serves only email.

## Desired End State

Every migration lands on staging first through `npm run db:push:staging`, and the script refuses a production URL. Every preview signs in against staging with synthetic data. Production answers on `https://skillnet.org.pl`. The old host and `www` answer 301 to it, and confirmation emails link to it.

## Key Decisions Made

| Decision        | Choice                                                                         | Why (1 sentence)                                                            |
| --------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| Staging target  | Second free Supabase project, eu-central-1                                     | Costs nothing; Branching needs Pro                                          |
| How to reach it | `--db-url` from gitignored `.staging-db-url`, never relink                     | `supabase link` swapping is how a push lands on the wrong project           |
| Command         | `npm run db:{status,push,seed,reset}:staging` script                           | One command, and it refuses the production ref                              |
| Staging data    | Migrations + synthetic `seed.sql` via `--include-seed`                         | Ranking and density map are testable; no `psql` on the machine              |
| Staging auth    | Sign-up off, accounts made in Studio; redirects `*-skillnet.barwy.workers.dev` | The API is public, so a leaked key can't create accounts; any preview works |
| Preview secrets | `wrangler preview base-config secret` (shared)                                 | Set once, every branch gets auth                                            |
| dev-guard       | Separate staging rule, no production crisis check                              | A prompt should again mean "this is production"                             |
| Enforcement     | Docs + lesson + PR template checkbox                                           | Reminder on every PR without giving GitHub a DB password                    |
| Old host        | 301 to `skillnet.org.pl` (308 for non-GET)                                     | Old email links and bookmarks keep working, one canonical host              |
| `www`           | Custom domain + same 301 to apex                                               | Typing `www` still works                                                    |
| Order           | Staging first, then domain                                                     | The domain switch can be rehearsed on previews against staging              |

## Scope

**In scope:** staging project and tooling, preview secrets, dev-guard rule, PR template and docs, custom domain, canonical-host redirect, Supabase Site URL switch.

**Out of scope:** Supabase Branching/Pro, a CI check against staging, automated smoke on previews (Access), SMTP on staging, migration rollback tooling.

## Architecture / Approach

Staging: `.staging-db-url` → `scripts/db-staging.mjs` (ref guard) → `supabase … --db-url`. Previews read staging's URL and key from the preview base config. Domain: `wrangler.jsonc` `routes` with `custom_domain: true` are attached while both hosts serve the app. Then a pure `canonicalRedirect()` in the middleware (after the HTTPS redirect, exact host match, previews excluded) sends the old hosts to the apex, and the Supabase Site URL switches.

## Phases at a Glance

| Phase                      | What it delivers                               | Key risk                                                                                                |
| -------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 1. Staging tooling         | `db:*:staging` scripts with a production guard | Guard bug lets a production URL through                                                                 |
| 2. Staging project (owner) | Project with migrations + seed, confirm off    | Seed's `auth.users` insert refused on hosted                                                            |
| 3. Previews on staging     | Auth works on every preview                    | Workers Builds ignores base-config secrets (fallback: per-preview)                                      |
| 4. dev-guard               | Staging label, no crisis lookup                | None significant                                                                                        |
| 5. Process and docs        | PR template, lesson, CLAUDE.md, infra docs     | Rule followed only on honour                                                                            |
| 6. Attach domain           | `skillnet.org.pl` + `www` serve production     | Zone HTTPS settings override the Worker; build token lacks zone rights (domains attached by hand first) |
| 7. Make it canonical       | 301 from old hosts, emails link to new domain  | Redirect matching a preview host; sessions reset                                                        |

**Prerequisites:** the paused unused projects (vena, dzielnia, BarWyDev's Project) deleted, so staging takes the second free slot; domains attached in the dashboard and zone HTTPS settings checked before the Phase 6 merge; owner at the dashboards and the macOS Terminal for secrets; no active crisis at either production merge.
**Estimated effort:** about 3–4 sessions. Phases 1+5 make one PR, Phase 6 one PR, Phase 7 one PR, and Phases 2–4 are setup.

## Open Risks & Assumptions

- The hosted project may reject `seed.sql` (direct `auth.users` inserts). Staging then runs without seed residents.
- `wrangler preview base-config` is open beta. The per-preview secret is the fallback.
- The free staging project pauses after 7 idle days and has to be restored before use.
- HSTS `includeSubDomains` on the apex binds every future subdomain to HTTPS.

## Success Criteria (Summary)

- A migration PR is tried on staging and its preview before production ever sees it, and the tooling can't push to production by mistake.
- `https://skillnet.org.pl` is the one production address, and old links still land on the right page.
