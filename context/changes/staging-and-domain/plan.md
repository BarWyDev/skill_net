# Staging Supabase Project and Production on skillnet.org.pl Implementation Plan

## Overview

There are two parts. First, a staging database: a second free Supabase project that gets every migration before production and serves the branch previews. Second, production moves to its own domain, `https://skillnet.org.pl`, and the old `workers.dev` host and `www` redirect to it. The first part closes audit finding O-07 ("a bad migration goes straight to production"). The second is Phase 8 of `context/changes/deployment/deployment-plan.md`.

## Current State Analysis

- One Supabase project, production `grbhvhfwwjmzmrbzpxzu` (eu-central-1). It is linked in `supabase/.temp/project-ref`. Migrations reach it only through a manual `npx supabase db push` after the merge (`context/foundation/lessons.md`, "Push migrations to production right after merge"). Nothing exercises a migration against a hosted database first.
- There are 30 migrations in `supabase/migrations/`. The only extension is `postgis`; there is no `pg_cron`, `vault` or `pg_net`. Taxonomy and postcode data arrive as migrations. `supabase/seed.sql` holds about 500 synthetic residents and is local-only today.
- Branch previews (`<branch>-skillnet.barwy.workers.dev`, behind Cloudflare Access) get no secrets, so auth is off there (`context/foundation/infrastructure.md:135`). Wrangler 4.149 has `wrangler preview base-config secret`, which sets secrets shared by every preview.
- Production is `https://skillnet.barwy.workers.dev`: `astro.config.mjs:11` (`site`), `README.md`, `CLAUDE.md` and the smoke instructions. The zone `skillnet.org.pl` is Active on Cloudflare (S-16). Email Routing owns the apex MX. There are no A/AAAA/CNAME records on the apex or `www`.
- Supabase auth emails build links from `{{ .SiteURL }}` (`supabase/templates/confirmation.html:10`). Production's Site URL is the `workers.dev` address.
- The middleware's first step is the HTTP→HTTPS redirect (`src/middleware.ts`, `src/lib/https.ts`, unit-tested in `src/lib/https.test.ts`). HTTPS responses carry HSTS with `includeSubDomains`.
- The dev-guard mod (`~/.claude/mods/dev-guard/hooks/rules.ts:13`) labels every `supabase db push` as a production push and checks production for active crises. It doesn't see a push wrapped in an npm script.
- The machine has no `psql`. The Supabase CLI (2.120) supports `--db-url` on `db push`, `db reset` and `migration list`, and `db push --include-seed`.

## Desired End State

- `skillnet-staging` exists in the same organisation and region. It has every migration plus the synthetic seed. Public sign-up is off: test accounts are created in Studio, so a leaked URL and key can't be used to create accounts.
- `npm run db:status:staging`, `db:push:staging`, `db:seed:staging` and `db:reset:staging` act on staging only. They read the connection string from the gitignored `.staging-db-url` and refuse to run when it points at production.
- Every branch preview signs in against staging. Production secrets never reach a preview.
- A PR that adds a migration follows this order: push to staging → test on the preview → merge → push to production. The PR template and the docs say so.
- dev-guard labels staging pushes as staging and skips the production crisis check for them.
- `https://skillnet.org.pl` serves production. `https://skillnet.barwy.workers.dev/<path>` and `https://www.skillnet.org.pl/<path>` answer 301 to `https://skillnet.org.pl/<path>`. Preview hosts are not redirected. Confirmation emails link to `skillnet.org.pl`.

### Key Discoveries:

- `wrangler preview base-config secret` exists in the installed wrangler 4.149 (open beta).
- `supabase db push --include-seed` runs `supabase/seed.sql` (from `[db.seed]` in `supabase/config.toml`) without `psql`.
- Preview hosts end in `-skillnet.barwy.workers.dev`, so the canonical-host redirect must match the production host exactly, never by suffix.
- HSTS with `includeSubDomains` on the apex covers `auth.skillnet.org.pl` and any future subdomain. That is fine on Cloudflare, but no subdomain can ever serve plain HTTP.

## What We're NOT Doing

- No Supabase Branching and no Pro upgrade. That is a later option, once production is on Pro.
- No CI check that a migration reached staging. GitHub won't hold the staging database password.
- No automated smoke against previews. Access blocks it, and a service token is out of scope.
- No custom SMTP on staging. Confirmation is off there, so it sends no sign-up email.
- No migration rollback tooling. Staging catches bad migrations; it doesn't undo them on production.
- No `Cache-Control` or cookie-scope changes beyond what the host move needs.
- No redirect for static files on the old host. Workers static assets answer them without running the Worker (`run_worker_first` is off). Only SSR pages and API routes redirect, which covers every link a person follows.
- No special path for form POSTs from a tab left open on the old host. They get a 308, and Astro's origin check on the new host refuses them as cross-origin. The user reloads and lands on the new host.

## Implementation Approach

We go in two stages. The staging stage first adds tooling that can't hit production by mistake, then the owner creates the project, then previews and process follow. The domain stage attaches the domain first while both hosts serve the app. Only once `skillnet.org.pl` is confirmed working do we flip the Site URL and turn on the 301. That way the old host never redirects to a domain that doesn't answer yet.

## Critical Implementation Details

- **Ordering for the domain.** Phase 6 (attach) must be live and verified before Phase 7 (redirect) merges. Otherwise `skillnet.barwy.workers.dev` would 301 to a dead host. Add `https://skillnet.org.pl/**` to the production Redirect URLs before switching the Site URL, and keep the old entries until the redirect has run for a while. Links in emails already sent still point at `workers.dev`, and the 301 keeps them working.
- **Never put the production ref in `.staging-db-url`.** The script's ref check is the only guard between a typo and pushing seed data to production. Treat that check as load-bearing and test it.
- **Signed-in sessions don't move.** Cookies are per host, so residents sign in again once on `skillnet.org.pl`. That's acceptable before the pilot. Say it in the PR.

## Phase 1: Staging tooling in the repo

### Overview

Commands that act only on staging, plus the gitignore entry for the connection string.

### Changes Required:

#### 1. Staging runner

**File**: `scripts/db-staging.mjs`

**Intent**: One entry point for staging database commands. It reads `.staging-db-url` (trimmed) from the repo root and refuses to run when the URL points at production. Then it runs the Supabase CLI with that URL, without a shell, so the password stays out of shell history.

**Contract**: `node scripts/db-staging.mjs <status|push|seed|reset> [extra CLI args]` maps to `supabase migration list`, `db push`, `db push --include-seed` and `db reset`, each with `--db-url <url>`. Extra args such as `--dry-run` pass through. It exits non-zero with a Polish message when the file is missing or empty, when no project ref can be parsed from the URL (pooler user `postgres.<ref>` or host `db.<ref>.supabase.co`), or when the ref equals the production ref. The production ref is the hard-coded `grbhvhfwwjmzmrbzpxzu`, plus `supabase/.temp/project-ref` when that file exists. It never prints the URL. Zero dependencies, like `scripts/smoke.mjs`.

#### 2. npm scripts

**File**: `package.json`

**Intent**: Short names for the four commands.

**Contract**: `db:status:staging`, `db:push:staging`, `db:seed:staging` and `db:reset:staging` call `node scripts/db-staging.mjs <cmd>`.

#### 3. Gitignore

**File**: `.gitignore`

**Intent**: Keep the staging connection string out of git.

**Contract**: Add a `.staging-db-url` entry with a one-line comment. The checkout is shared and `.gitignore` already has someone else's uncommitted edit, so do this on the change branch and stage only this hunk.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- With no `.staging-db-url`, `npm run db:status:staging` exits non-zero with the "missing file" message
- With a `.staging-db-url` holding a fake URL that contains `grbhvhfwwjmzmrbzpxzu`, every subcommand exits non-zero before calling the CLI; delete the fake file afterwards
- With a URL with no parsable ref, the script exits non-zero
- `git check-ignore .staging-db-url` prints the path

#### Manual Verification:

- The error messages are clear to the owner and never show the password

**Implementation Note**: After automated verification passes, pause for manual confirmation before Phase 2.

---

## Phase 2: Create the staging project (owner)

### Overview

The owner creates and configures `skillnet-staging`, then the tooling from Phase 1 loads it.

### Changes Required:

#### 1. Project

**Intent**: First, delete the unused paused projects `vena`, `dzielnia` and `BarWyDev's Project` (the owner decided this on 2026-10-29). Free projects are limited to 2 active per account, so staging and production then hold both slots with nothing competing for them. Then Dashboard → New project `skillnet-staging`, same organisation, region eu-central-1 (as production). Store the database password in the password manager.

**Contract**: The project is Active. Put the Session pooler connection string (port 5432, password percent-encoded) in `.staging-db-url` by hand. It never goes into chat or a command line.

#### 2. Auth settings

**Intent**: Make staging fit previews and test accounts.

**Contract**: Authentication → Sign In / Providers: "Allow new users to sign up" off, and under Email, "Confirm email" off. The API is reachable from the whole internet, so closing sign-up means nobody can create accounts even with the URL and key. Test accounts are created in Studio (Authentication → Users → Add user → Create new user, with "Auto Confirm User"). Their user metadata must carry `{"consent_version": "<CURRENT_CONSENT_VERSION from src/lib/consent.ts>"}`, or the consent trigger refuses them with `consent_required`. Keep one test resident and one test coordinator, with passwords in the password manager. URL Configuration: Site URL `http://localhost:4321`. A branch preview disappears after its merge, so it can't be the Site URL. Previews are covered by the redirect list, and confirmation is off. Redirect URLs: `https://*-skillnet.barwy.workers.dev/**` and `http://localhost:4321/**`. Leave the rest at defaults. Don't run `supabase config push`: `config.toml` describes the local stack.

#### 3. Load schema and data

**Intent**: Apply the migrations, then the synthetic seed.

**Contract**: `npm run db:push:staging -- --dry-run`, then `npm run db:push:staging`, then `npm run db:seed:staging`. If the seed fails on the hosted project because of inserts into `auth.users`, record the error in this plan, skip the seed and continue. Staging still works with hand-made test accounts, so the failure doesn't block anything.

### Success Criteria:

#### Automated Verification:

- `npm run db:status:staging` shows every local migration as applied, local and remote matching
- `npm run db:push:staging -- --dry-run` reports nothing to push

#### Manual Verification:

- Table Editor on staging: `skills` and `postcode_centroids` are filled; with the seed, `profiles` has about 500 rows
- A test account created in Studio with `consent_version` in its metadata is accepted, and the trigger records its consent
- A direct sign-up through the staging API (`POST /auth/v1/signup` with the publishable key) is refused
- Production is untouched: `npx supabase migration list --linked` is unchanged

**Implementation Note**: After automated verification passes, pause for manual confirmation before Phase 3.

---

## Phase 3: Previews on staging

### Overview

Every branch preview gets staging's URL and publishable key.

### Changes Required:

#### 1. Preview base secrets (owner)

**Intent**: Set `SUPABASE_URL` and `SUPABASE_KEY` (staging's publishable key) once for all previews.

**Contract**: `npx wrangler preview base-config secret put SUPABASE_URL` and the same for `SUPABASE_KEY`, run interactively from the owner's macOS Terminal, with the values pasted at the prompt. If Workers Builds' `npx wrangler preview` doesn't pick up base-config secrets, fall back to `npx wrangler preview secret put <KEY> --name <branch>` for the branch being tested, and record that in `infrastructure.md`.

### Success Criteria:

#### Automated Verification:

- The PR's Workers Builds preview build succeeds

#### Manual Verification:

- On the PR's preview (through Access) the config banner is gone, sign-in with the Studio test account works, and the sign-up form shows an error instead of creating an account. It's the generic message: `src/lib/auth-errors.ts` doesn't map Supabase's `signup_disabled`, and staging doesn't need it to
- `/profil` saves a profile. The crisis view, with a coordinator granted on staging by SQL, shows seed residents
- Production's Auth users list has no account from this test

**Implementation Note**: After verification, pause for manual confirmation before Phase 4.

---

## Phase 4: dev-guard knows staging

### Overview

The mod's prompts tell staging and production apart.

### Changes Required:

#### 1. Rules

**File**: `~/.claude/mods/dev-guard/hooks/rules.ts`

**Intent**: Staging commands get their own label and no production crisis check. A raw `--db-url` push still asks, because the guard can't see where the URL points.

**Contract**: Before the generic `supabase db push` rule, add these rules: `npm run db:(push|seed|reset):staging` → label `… (staging)`, `checkCrisis: false`; `supabase db (push|reset) … --db-url` → label `… na adres z --db-url (sprawdź, czy to staging)`, `checkCrisis: false`. `db:status:staging` stays unguarded. The existing production rules are unchanged.

#### 2. Tests

**File**: `~/.claude/mods/dev-guard/tests/rules.test.ts`

**Intent**: Cover the new rules and confirm that a plain `npx supabase db push` still gets the production label with the crisis check.

**Contract**: Follow the existing cases' style.

### Success Criteria:

#### Automated Verification:

- The mod's tests pass (the runner the mod already uses in `~/.claude/mods/dev-guard`)

#### Manual Verification:

- After `/reload-plugins`, `npm run db:push:staging -- --dry-run` shows the staging label and no crisis lookup

**Implementation Note**: The mod lives outside the repo; nothing here is committed to `skill_net`.

---

## Phase 5: Process and docs for staging

### Overview

The migration order becomes the documented rule, and every PR reminds the author of it.

### Changes Required:

#### 1. PR template

**File**: `.github/pull_request_template.md` (new)

**Intent**: A short checklist that shows on every PR.

**Contract**: Sections Summary and Test plan, plus a "Migracje" block: pushed to staging (`npm run db:push:staging`), tried on the preview, production `db push` right after merge.

#### 2. Lesson

**File**: `context/foundation/lessons.md`

**Intent**: Extend the existing rule instead of adding a near-duplicate.

**Contract**: The "Push migrations to production right after merge" rule gains the staging step before merge and names the npm scripts.

#### 3. Project docs

**Files**: `CLAUDE.md`, `context/changes/deployment/deployment-plan.md`, `context/foundation/infrastructure.md`, `README.md`

**Intent**: Describe staging where readers look for deploy facts.

**Contract**: The CLAUDE.md Commands section lists the four `db:*:staging` scripts. Its Deploy section covers migrations (staging first) and previews (auth on, against staging, base-config secrets). The `deployment-plan.md` open item "A staging Supabase project" is closed with a date. `infrastructure.md:135` is updated to the deployed state. The README preview line is updated.

#### 4. Audit

**File**: `docs/audit/AUDYT-PRODUKCYJNY-2026-10-21.md` (only if the owner commits `docs/audit/`; it's untracked today)

**Intent**: Mark O-07 as resolved with a date and link to this change.

### Success Criteria:

#### Automated Verification:

- `npm run lint` and `npx prettier --check` on the touched Markdown pass

#### Manual Verification:

- A test PR shows the template

**Implementation Note**: Phases 1 and 5 can ship in one PR. Pause before Phase 6.

---

## Phase 6: Attach skillnet.org.pl

### Overview

Production answers on the new domain while the old host keeps working.

### Changes Required:

#### 0. Attach the domains and check the zone (owner, before the merge)

**Intent**: The domains must exist before any deploy touches them. The Workers Builds managed token may lack the zone and DNS permissions to create custom domains, and a failed build on `master` is worse than one manual step. The zone must also leave HTTPS to the Worker, or smoke's exact 308 check fails.

**Contract**: Workers → skillnet → Domains & Routes → Add → Custom Domain: `skillnet.org.pl`, then `www.skillnet.org.pl`. Wait until both certificates are active. In the `skillnet.org.pl` zone, SSL/TLS → Edge Certificates must have "Always Use HTTPS" and HSTS off. The Worker answers http with 308 and sends its own HSTS (audit F-10), so zone settings would replace both. Record both settings in `infrastructure.md`.

#### 1. Worker routes

**File**: `wrangler.jsonc`

**Intent**: Let Workers Builds attach the custom domains on deploy.

**Contract**: `"routes"` with `{ "pattern": "skillnet.org.pl", "custom_domain": true }` and the same for `www.skillnet.org.pl`. `workers_dev` and `preview_urls` stay `true`. Add a comment noting that previews still use `workers.dev`. The domains already exist from step 0, so the config records the state and the deploy only confirms it.

#### 2. Supabase production redirects (owner)

**Intent**: Allow auth redirects to the new host before any user lands there.

**Contract**: Production → Authentication → URL Configuration → Redirect URLs: add `https://skillnet.org.pl/**`. The Site URL stays as it is in this phase.

### Success Criteria:

#### Automated Verification:

- The PR's preview build still succeeds with `routes` in the config
- After the merge: `SMOKE_READONLY=1 BASE_URL=https://skillnet.org.pl npm run smoke` passes (HSTS and http→https included)
- `SMOKE_READONLY=1 BASE_URL=https://skillnet.barwy.workers.dev npm run smoke` still passes

#### Manual Verification:

- Workers → skillnet → Domains & Routes lists both custom domains with active certificates, attached before the merge
- In the `skillnet.org.pl` zone, "Always Use HTTPS" and HSTS are off
- The `master` build after the merge succeeds in Workers Builds
- `dig +short skillnet.org.pl` resolves; Email Routing still delivers to `kontakt@`
- Sign-in on `https://skillnet.org.pl` works

**Implementation Note**: The merge to `master` deploys. Use `gh pr merge` only with the owner's yes, and only with no active crisis. Pause before Phase 7.

---

## Phase 7: Make skillnet.org.pl canonical

### Overview

Old hosts redirect, links and metadata use the new domain, and emails link to it.

### Changes Required:

#### 1. Canonical host redirect

**File**: `src/lib/https.ts` (or a sibling `src/lib/canonical-host.ts`, relative imports only) and `src/middleware.ts`

**Intent**: Send `skillnet.barwy.workers.dev` and `www.skillnet.org.pl` to `https://skillnet.org.pl` with the same path and query. This step runs right after the HTTPS redirect, before Supabase is touched.

**Contract**: A pure `canonicalRedirect(url: URL): string | null` with an exact-host allowlist. It returns 301 for GET/HEAD and 308 for other methods, so a form POST keeps its body. Any other host returns null: local hosts, `*-skillnet.barwy.workers.dev` previews and the apex itself. The redirect response carries the security headers like the HTTPS redirect does.

#### 2. Unit tests

**File**: `src/lib/https.test.ts` (or `canonical-host.test.ts`)

**Intent**: Pin the host rules.

**Contract**: Cases for the old host with path and query, `www`, the apex (null), a preview host such as `feat-x-skillnet.barwy.workers.dev` (null), localhost (null), and POST getting 308.

#### 3. Site and smoke

**Files**: `astro.config.mjs`, `scripts/smoke.mjs`

**Intent**: Point canonical URLs at the new domain. Smoke checks the redirect when it runs against production.

**Contract**: `site: "https://skillnet.org.pl"`. When `BASE_URL` is `https://skillnet.org.pl`, smoke checks that `https://skillnet.barwy.workers.dev/` answers 301 with `Location: https://skillnet.org.pl/`.

#### 4. Supabase production Site URL (owner, right after the merge deploys)

**Intent**: Make confirmation emails link to the new domain.

**Contract**: Site URL becomes `https://skillnet.org.pl`. The old `workers.dev` redirect entries stay for now; removing them is a later cleanup.

#### 5. Docs

**Files**: `CLAUDE.md`, `README.md`, `context/foundation/infrastructure.md`, `context/changes/deployment/deployment-plan.md` (Phase 8 ✅), `context/foundation/lessons.md` if a gotcha comes up

**Intent**: The production address everywhere is `https://skillnet.org.pl`, and smoke commands use it. Read-only smoke against `skillnet.barwy.workers.dev` fails once the redirect is live. Replace every such command, including `README.md:251` and the CLAUDE.md smoke note. Plans already archived stay as they are.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test:unit`
- Lint, type check and build pass: `npm run lint`, `npx astro check`, `npm run build`
- After the merge: `SMOKE_READONLY=1 BASE_URL=https://skillnet.org.pl npm run smoke` passes, redirect check included

#### Manual Verification:

- `curl -sI https://skillnet.barwy.workers.dev/mapa?x=1` → 301 to `https://skillnet.org.pl/mapa?x=1`; the same for `www`
- A preview URL is not redirected
- A real sign-up on production gets an email whose link goes to `https://skillnet.org.pl/auth/confirm…` and ends on `/profil`
- `npx wrangler tail skillnet --format json --status error` stays quiet during these checks

**Implementation Note**: Merging deploys to production. Get the owner's yes, check for an active crisis first, then set the Site URL right away.

---

## Testing Strategy

### Unit Tests:

- `canonicalRedirect`: every host in and out of the allowlist, path and query kept, method-dependent status.

### Integration Tests:

- `npm run smoke` read-only against both hosts after Phases 6 and 7.
- The staging runner's refusal paths (Phase 1 automated checks).

### Manual Testing Steps:

1. Push a migration-free branch, open its preview, sign in against staging with the Studio test account, and check that sign-up is refused.
2. Try `npm run db:push:staging -- --dry-run` and check dev-guard's label.
3. After Phase 7, follow an old `workers.dev` link from a past email and land on the same page on `skillnet.org.pl`.

## Migration Notes

- No schema change. Staging gets the existing migrations. Production's database is not touched by this change.
- Sessions on `workers.dev` don't carry over; users sign in again on `skillnet.org.pl`.
- The free staging project pauses after 7 days without traffic. Restore it in the dashboard before testing. Free projects are limited to 2 active per account, and production plus staging use both. Any new free project means pausing staging first.

## References

- Audit finding O-07: `docs/audit/AUDYT-PRODUKCYJNY-2026-10-21.md:140`
- Custom domain checklist: `context/changes/deployment/deployment-plan.md:226`
- Preview secrets note: `context/foundation/infrastructure.md:135`
- HTTPS redirect pattern: `src/lib/https.ts`, `src/middleware.ts`
- dev-guard rules: `~/.claude/mods/dev-guard/hooks/rules.ts:12-21`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Staging tooling in the repo

#### Automated

- [x] 1.1 Lint passes
- [x] 1.2 Missing `.staging-db-url` is refused
- [x] 1.3 A production ref in `.staging-db-url` is refused by every subcommand
- [x] 1.4 A URL without a parsable ref is refused
- [x] 1.5 `.staging-db-url` is gitignored

#### Manual

- [x] 1.6 Error messages are clear and never show the password

### Phase 2: Create the staging project (owner)

#### Automated

- [ ] 2.1 `db:status:staging` shows all migrations applied
- [ ] 2.2 `db:push:staging -- --dry-run` reports nothing to push

#### Manual

- [ ] 2.3 Reference data (and seed residents) present on staging
- [ ] 2.4 Studio test account with `consent_version` is accepted
- [ ] 2.5 Direct sign-up through the staging API is refused
- [ ] 2.6 Production migration list unchanged

### Phase 3: Previews on staging

#### Automated

- [ ] 3.1 Preview build succeeds

#### Manual

- [ ] 3.2 Sign-in with the Studio account works on the preview and sign-up is refused
- [ ] 3.3 Profile and crisis view work against staging data
- [ ] 3.4 No test account on production

### Phase 4: dev-guard knows staging

#### Automated

- [ ] 4.1 dev-guard tests pass

#### Manual

- [ ] 4.2 Staging push shows the staging label without a crisis lookup

### Phase 5: Process and docs for staging

#### Automated

- [ ] 5.1 Lint and Prettier pass on touched files

#### Manual

- [ ] 5.2 A PR shows the template

### Phase 6: Attach skillnet.org.pl

#### Automated

- [ ] 6.1 Preview build succeeds with `routes`
- [ ] 6.2 Read-only smoke passes on `skillnet.org.pl`
- [ ] 6.3 Read-only smoke still passes on `workers.dev`

#### Manual

- [ ] 6.4 Both custom domains active with certificates, attached before the merge
- [ ] 6.5 Zone "Always Use HTTPS" and HSTS are off
- [ ] 6.6 `master` build after the merge succeeds
- [ ] 6.7 DNS resolves and Email Routing still works
- [ ] 6.8 Sign-in works on `skillnet.org.pl`

### Phase 7: Make skillnet.org.pl canonical

#### Automated

- [ ] 7.1 Unit tests pass
- [ ] 7.2 Lint, type check and build pass
- [ ] 7.3 Read-only smoke on `skillnet.org.pl` passes with the redirect check

#### Manual

- [ ] 7.4 Old host and `www` answer 301 with path and query kept
- [ ] 7.5 Preview URL is not redirected
- [ ] 7.6 Confirmation email links to `skillnet.org.pl` and ends on `/profil`
- [ ] 7.7 No errors in `wrangler tail` during the checks
