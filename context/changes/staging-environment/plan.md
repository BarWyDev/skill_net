# Stable Staging and Production by Promotion Implementation Plan

## Overview

Two changes to how code reaches people. First, a stable staging site, `https://staging.skillnet.org.pl`, served by a second Worker `skillnet-staging` against the staging Supabase project and closed behind Cloudflare Access. Second, production stops deploying on every push to `master`: `master` deploys staging, and production deploys only when a promotion PR merges `master` into a protected `production` branch.

The flow after this change:

1. Branch → PR to `master`. The branch preview runs on staging data. A migration goes to staging first (`npm run db:push:staging`).
2. Merge to `master` → Workers Builds deploys `skillnet-staging`. Production is untouched.
3. Check the change on `https://staging.skillnet.org.pl`.
4. Promote: migrations to production (`npx supabase db push`), then a PR `master` → `production`. Its merge deploys `https://skillnet.org.pl`.

## Current State Analysis

- One Worker, `skillnet`. Workers Builds deploys every push to `master` to production, even when CI is red (`CLAUDE.md`, Deploy). Other branches get a named Worker Preview through a per-branch trigger (`context/foundation/infrastructure.md`, Per-branch triggers).
- Previews read `SUPABASE_URL` and `SUPABASE_KEY` from the preview base config, pointing at `skillnet-staging` (ref `blljprzpmmpawkjkhfsa`). They have their own `SESSION` KV under `previews` in `wrangler.jsonc`, and no rate-limit bindings (wrangler warns).
- Each preview's address follows the branch name, so there is no one place to look at "what is on `master` now" before it is live.
- `src/lib/canonical-host.ts` (PR BarWyDev/skill_net#119) redirects only `www.skillnet.org.pl` and `skillnet.barwy.workers.dev`, by exact host. `staging.skillnet.org.pl` is not touched.
- HSTS with `includeSubDomains` on the apex already covers `staging.`; the Worker serves HTTPS only.
- `.github/workflows/ci.yml` runs on pushes and PRs to `master` only. Branch protection on `master` requires `ci` and `smoke`.
- The dev-guard mod blocks `git push` mentions of `master` and treats production `supabase db push` as a production change.
- Checked 2026-11-15: with `env.staging` in `wrangler.jsonc`, `CLOUDFLARE_ENV=staging npm run build` writes a flattened `dist/server/wrangler.json` with `name: "skillnet-staging"`, the staging routes, KV and rate limiters, and `targetEnvironment: "staging"`. `npx wrangler deploy` reads it through `.wrangler/deploy/config.json`.

## Desired End State

- `https://staging.skillnet.org.pl` serves the code on `master`, signs in against staging and asks for Cloudflare Access first. Its session KV and rate-limit counters are its own.
- A push to `master` creates a new version of `skillnet-staging` and none of `skillnet`.
- `production` is protected: changes arrive only by PR, the PR's head must be `master`, `ci` and `smoke` must pass, no force pushes, no deletion.
- A merge into `production` deploys `skillnet`. Rollback is `npx wrangler rollback` plus a revert on `master` that is promoted.
- CLAUDE.md, README, `infrastructure.md`, the PR template and dev-guard describe this flow, including the crisis rule: no promotion while a crisis is active.

### Key Discoveries:

- Worker Previews have no custom-domain option (`wrangler preview --help` on 4.149: `--name`, `--tag`, secrets, base config only), so a stable `staging.` host needs its own Worker.
- Wrangler environments work with the adapter through `CLOUDFLARE_ENV` at build time, not `wrangler deploy --env` (the redirected config is already flattened).
- Rate-limit `namespace_id` values are account-wide counters. Staging uses its own (`2001`, `2002`), or a burst on staging would throttle production sign-ins.
- Workers Builds copies the deploy command into a hidden per-branch trigger. After switching the production branch of `skillnet` to `production`, `master` becomes a preview branch of `skillnet`; check its trigger runs `wrangler preview`, not `versions upload` (`infrastructure.md`).

## What We're NOT Doing

- No automated smoke against staging. Access blocks it, and a service token is out of scope, like for previews. The owner checks staging by hand.
- No Supabase Branching and no third Supabase project. Staging site and previews share `skillnet-staging`.
- No Turnstile on staging. Without `TURNSTILE_SITE_KEY` no widget renders, and staging has public sign-up off anyway.
- No change to the GitHub default branch (`master`) or to where Dependabot opens PRs.
- No release tags, changelog or versioning. The promotion PR's list of commits is the release note.
- No removal of branch previews. They stay for testing a PR before it merges.

## Implementation Approach

Build staging alongside the current flow first, so nothing changes for production until staging is proven. Then flip production to the `production` branch in one short owner session. The repo changes in Phase 1 merge through the current flow (they deploy production once more, harmlessly: `env.staging` changes nothing for the top-level Worker).

## Critical Implementation Details

- **Order of the flip.** Create `production` at the current `master` commit and protect it *before* changing the production branch of `skillnet` in Workers Builds. Otherwise the next build of `skillnet` could deploy from a branch nobody protected, or from nothing.
- **Migrations move earlier.** Production code now lags behind `master`, so expand-then-contract matters more, not less. Push a migration to production right *before* merging the promotion PR: the old production code must keep working on the expanded schema, and the new code needs it the moment it deploys. A contract migration (drop, rename) waits for the promotion after the code that stopped using the old shape.
- **Access before DNS.** Create the Access application for `staging.skillnet.org.pl` before the first staging deploy attaches the custom domain, so the host is never public.
- **Two Workers on one repository.** Workers Builds sets `WRANGLER_CI_OVERRIDE_NAME` and `WRANGLER_CI_MATCH_TAG` to the connected Worker. Both match `skillnet-staging` here, but the first staging build is the real test: if it refuses the flattened config or deploys under another name, stop and read the build log before retrying.
- **`site` stays the production domain on staging.** Canonical links and the sitemap on staging point at `https://skillnet.org.pl`. That is harmless behind Access (no crawler reaches it) and keeps the build identical apart from Worker config.
- **Staging secrets are staging values.** `npx wrangler secret put <NAME> --name skillnet-staging` with the staging URL and publishable key. A production value there would make staging write to production. Secret values go through hidden input, never arguments.

## Phase 1: Staging Worker and promotion guard in the repo

### Overview

Config, scripts and CI for both halves. Merges through today's flow.

### Changes Required:

#### 1. Staging environment

**File**: `wrangler.jsonc`

**Intent**: Describe `skillnet-staging`.

**Contract**: `env.staging` with `name: "skillnet-staging"`, `workers_dev: false`, `preview_urls: false`, `routes: [{ pattern: "staging.skillnet.org.pl", custom_domain: true }]`, its own `kv_namespaces` `SESSION` (a new namespace `skillnet-session-staging`, created with `[approve]` `npx wrangler kv namespace create skillnet-session-staging`), and `ratelimits` `AUTH_IP_LIMITER` / `AUTH_ACCOUNT_LIMITER` with namespace ids `2001` / `2002` and the same limits as production. `assets` and `observability` are inherited.

#### 2. Script

**File**: `package.json`

**Intent**: One name for the staging build that Workers Builds and people both use.

**Contract**: `"build:staging": "CLOUDFLARE_ENV=staging astro build"`.

#### 3. CI on the production branch and the promotion guard

**Files**: `.github/workflows/ci.yml`, new `.github/workflows/promotion.yml`

**Intent**: `ci` and `smoke` run on promotion PRs; a promotion PR must come from `master`.

**Contract**: `ci.yml` triggers on `push` and `pull_request` for `[master, production]`. `promotion.yml` runs on `pull_request` to `production` with one job, `promotion-source`, that fails unless `github.head_ref == 'master'`. Read-only token, actions pinned by SHA (F-13).

### Success Criteria:

#### Automated Verification:

- `npm run lint`, `npx astro check`, `npm run build` pass
- `npm run build:staging` writes `dist/server/wrangler.json` with `name` `skillnet-staging` and the staging route
- `npm run build` still writes `name` `skillnet` with the production routes

#### Manual Verification:

- PR checks green; merging deploys production as today with no visible change

---

## Phase 2: Create staging (owner, with Claude walking through it)

### Overview

The staging Worker exists, is closed behind Access and talks to staging.

### Changes Required:

#### 1. Access application (owner)

**Intent**: Nobody without the owner's email reaches staging.

**Contract**: Zero Trust → Access → Applications → Self-hosted, domain `staging.skillnet.org.pl`, the same policy as previews ("Emails: owner's address").

#### 2. Worker and build (owner)

**Intent**: `master` deploys `skillnet-staging`.

**Contract**: Workers → Create → Import a repository → `BarWyDev/skill_net`, Worker name `skillnet-staging`, build command `npm run build:staging`, deploy command `npx wrangler deploy`, production branch `master`, builds for non-production branches **off**. The first build attaches `staging.skillnet.org.pl`.

#### 3. Secrets (owner)

**Contract**: `npx wrangler secret put SUPABASE_URL --name skillnet-staging` and `SUPABASE_KEY` with the staging values (hidden input).

#### 4. Staging Supabase URLs (owner)

**Contract**: `skillnet-staging` → Authentication → URL Configuration: Site URL `https://staging.skillnet.org.pl`, Redirect URLs add `https://staging.skillnet.org.pl/**` (keep the preview pattern).

### Success Criteria:

#### Automated Verification:

- `curl -sI https://staging.skillnet.org.pl/` → 302 to `cloudflareaccess.com`
- `npx wrangler versions list --name skillnet-staging --json` shows a version from the `master` build

#### Manual Verification:

- After Access, sign-in with `koordynator@staging.test` works and `/koordynator` opens; the production demo account is refused
- `/mapa` shows the synthetic seed around Kraków, not production data
- A push to `master` in this phase still deploys `skillnet` too (flip comes in Phase 3)

---

## Phase 3: Production deploys from `production` (owner + Claude)

### Overview

The flip. Short, in one sitting, with no crisis active.

### Changes Required:

#### 1. Branch and protection

**Intent**: `production` exists at the commit production runs now and is protected.

**Contract**: `[approve]` create `production` from the commit of the current production deployment (`npx wrangler deployments status`), on GitHub only. Owner: ruleset on `production`: PR required, required checks `ci`, `smoke`, `promotion-source`, block force pushes and deletion.

#### 2. Workers Builds for `skillnet` (owner)

**Contract**: Settings → Build → Branch control: production branch `production`. Builds for non-production branches stay on with the `wrangler preview` command. Then check the trigger that `master` gets (Builds API, user token with Workers CI: Edit) runs `wrangler preview`.

### Success Criteria:

#### Automated Verification:

- A docs-only PR merged to `master` creates a new `skillnet-staging` version and no new `skillnet` version (`npx wrangler versions list --json`)
- `SMOKE_READONLY=1 BASE_URL=https://skillnet.org.pl npm run smoke` still passes

#### Manual Verification:

- A PR into `production` from a branch other than `master` fails `promotion-source`
- The first real promotion PR `master` → `production` merges and deploys `skillnet`; read-only smoke passes after it

---

## Phase 4: Docs, dev-guard and lesson

### Overview

Everyone, including agents, follows the new flow.

### Changes Required:

#### 1. Project docs

**Files**: `CLAUDE.md` (Deploy), `README.md` (Deployment), `context/foundation/infrastructure.md`, `.github/pull_request_template.md`

**Intent**: Describe the four-step flow, staging's address, the promotion PR, migrations right before promotion, rollback as `wrangler rollback` plus a promoted revert, and the crisis rule moved to promotion ("don't merge into `production` while a crisis is active"). The PR template's migration block says: staging before the merge to `master`; production right before the promotion PR merges.

#### 2. dev-guard (owner edits `~/.claude/mods/dev-guard`)

**Intent**: Treat `production` like `master` today: block direct pushes and commits mentioning it; run the crisis check before a promotion merge (`gh pr merge` on a PR into `production`). Merges to `master` no longer need the crisis check.

#### 3. Lesson

**File**: `context/foundation/lessons.md`

**Intent**: "Production code lags `master`: push migrations right before promotion, expand first, contract one promotion later."

### Success Criteria:

#### Automated Verification:

- Prettier passes on the touched docs; dev-guard tests pass

#### Manual Verification:

- dev-guard blocks `git push origin production` and asks before merging a promotion PR

---

## Testing Strategy

### Unit Tests:

- None new: the change is configuration. `canonical-host.test.ts` already pins that `staging.skillnet.org.pl` is not redirected.

### Integration Tests:

- `npm run build` and `npm run build:staging` both run in Phase 1's verification; CI runs `build` on both branches.

### Manual Testing Steps:

1. Staging behind Access, signed in with the staging account (Phase 2).
2. `master` push → staging version only (Phase 3).
3. Promotion PR → production version, smoke green (Phase 3).

## Migration Notes

No database migrations. The flip changes only where deploys come from. If something goes wrong in Phase 3, set the production branch of `skillnet` back to `master`: production then deploys from `master` as before.

## References

- `context/archive/2026-10-29-staging-and-domain/plan.md` (staging Supabase, custom domain, canonical host)
- `context/foundation/infrastructure.md` (Per-branch triggers, previews)
- `CLAUDE.md` (Deploy)

## Progress

### Phase 1: Staging Worker and promotion guard in the repo

- [ ] 1.1 Lint, type check and build pass
- [ ] 1.2 `build:staging` produces the `skillnet-staging` config
- [ ] 1.3 `build` still produces the `skillnet` config
- [ ] 1.4 Merged; production unchanged

### Phase 2: Create staging

- [ ] 2.1 Staging redirects to Access
- [ ] 2.2 Staging version from a `master` build
- [ ] 2.3 Staging sign-in and coordinator view work on staging data
- [ ] 2.4 Map shows the synthetic seed

### Phase 3: Production deploys from `production`

- [ ] 3.1 `master` push deploys staging only
- [ ] 3.2 Read-only smoke on production passes
- [ ] 3.3 `promotion-source` refuses a non-`master` head
- [ ] 3.4 First promotion deploys production

### Phase 4: Docs, dev-guard and lesson

- [ ] 4.1 Prettier and dev-guard tests pass
- [ ] 4.2 dev-guard blocks direct `production` pushes and checks crises before promotion
