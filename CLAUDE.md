# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

SkillNet: a local skills directory for crisis coordination. A council coordinator activates a crisis and gets nearby residents ranked by distance, skill match and confirmed availability. The same directory is used day to day for neighbour-to-neighbour help. Product source of truth: @context/foundation/prd.md. Stack rationale: @context/foundation/tech-stack.md.

The app was bootstrapped from the `10x-astro-starter` template and now implements resident profiles, the public skills map and the coordinator's crisis mode on its own Supabase schema. The package and the Worker are named `skillnet`. Production runs at https://skillnet.barwy.workers.dev (see **Deploy** below).

## Commands

- `npm run dev`: dev server on http://localhost:4321, running on the Cloudflare workerd runtime
- `npm run build` / `npm run preview`: production build, then serve it on the Cloudflare runtime
- `npm run lint` / `npm run lint:fix`: ESLint with type-checked rules
- `npx astro check`: type check (CI runs `npx astro sync` first)
- `npm run format`: Prettier, with the Astro and Tailwind plugins
- `npm run test:unit`: unit tests (`src/**/*.test.ts`) on Node's built-in `node:test`, with no build step. It needs Node ≥ 22.18, which strips TypeScript natively (`.nvmrc` pins 22.22.3, the minimum for the ESLint tooling), so tested modules may use only `import type` and relative imports, not the `@/` alias.
- `npm run test:db`: pgTAP suites in `supabase/tests/` against the local Supabase.
- `npm run smoke`: walks the full auth flow over HTTP (`scripts/smoke.mjs`) against a running server at `BASE_URL`, which defaults to `http://localhost:4321`. It needs a reachable Supabase with email confirmation disabled. There is no e2e test runner yet. Against production, always set `SMOKE_READONLY=1`: it skips every step that creates an account and runs only the read-only checks, plus the HTTPS checks (HSTS, the http→https redirect) when `BASE_URL` is HTTPS.
- `npx supabase start` / `npx supabase stop`: local Supabase (needs Docker). Studio runs at http://localhost:54323.
- `npm run db:status:staging` / `db:push:staging` / `db:seed:staging` / `db:reset:staging`: Supabase CLI against the staging project `skillnet-staging` (`scripts/db-staging.mjs`). They read the connection string from the gitignored `.staging-db-url` at the repo root (each worktree needs its own copy) and refuse to run when it points at production. Extra CLI flags pass through, e.g. `npm run db:push:staging -- --dry-run`.

A pre-commit hook (husky + lint-staged) runs `eslint --fix` on `*.{ts,tsx,astro}` files and `prettier --write` on `*.{json,css,md}` files.

## Architecture

The app is an Astro 7 SSR app (`output: "server"`) deployed to Cloudflare Workers through `@astrojs/cloudflare`. It uses React 19 islands, Tailwind 4, shadcn/ui ("new-york" style, components in `src/components/ui/`) and Supabase for auth and data.

- **Env**: `SUPABASE_URL` and `SUPABASE_KEY` are declared in the `env.schema` of `astro.config.mjs` as _optional_ server secrets, and `TURNSTILE_SITE_KEY` as an optional public server variable (no key, no widget; see README "Turnstile"). Import them from `astro:env/server`, never from `import.meta.env`. Put them in `.env`, and in `.dev.vars` for the workerd runtime (both are gitignored). In production, set them with `npx wrangler secret put`.
- **Supabase client**: `createClient(headers, cookies)` in `src/lib/supabase.ts` builds a per-request SSR client with cookie-based sessions. It **returns `null` when env is missing**, so every caller must handle `null`. See `src/pages/api/auth/signin.ts` for the pattern.
- **Middleware**: `src/middleware.ts` resolves the user on every request into `Astro.locals.user` (typed in `src/env.d.ts`). It redirects anonymous users to `/auth/signin` for any path starting with an entry in `PROTECTED_ROUTES`. To protect a new route, add it to that list.
- **Auth**: HTML form POSTs go to `src/pages/api/auth/{signin,signup,signout}.ts`. The endpoints answer with redirects, not JSON, and pass errors back as `?error=` query params, which the React forms in `src/components/auth/` display. The smoke test asserts these exact redirect targets, so update `scripts/smoke.mjs` whenever you change them.
- **Config banner**: `src/lib/config-status.ts` lists missing configuration, and `Banner.astro` shows it. The UI copy there is in Polish.
- **Workers only**: the target is Cloudflare Workers with static assets, never Pages. Don't use `wrangler pages` commands or `Astro.locals.runtime` examples; `@astrojs/cloudflare` v14 dropped both. Read env through `astro:env/server`.

## Conventions

- Import through the `@/*` alias, which maps to `src/*`.
- Use Astro components for static markup. Use React only where interactivity is needed, and never with Next.js directives such as `"use client"`.
- Merge Tailwind classes with `cn()` from `@/lib/utils`. Do not concatenate class strings.
- Add shadcn components with `npx shadcn@latest add <name>`.
- API routes export uppercase `GET` / `POST` handlers.
- Put services in `src/lib/` (or `src/lib/services/`), shared entity and DTO types in `src/types.ts`, and React hooks in `src/components/hooks/` (that folder doesn't exist yet).
- Migrations go in `supabase/migrations/YYYYMMDDHHmmss_short_description.sql`. Enable RLS on every new table, with separate policies per operation and per role. New tables start with no privileges for `anon` and `authenticated` (default privileges, security audit F-12): grant exactly what clients need in the same migration, and add those grants to the expected list in `supabase/tests/narrow_table_grants_test.sql`. Never grant TRUNCATE, REFERENCES, TRIGGER or MAINTAIN to them.
- zod is a direct dependency. Use it for input validation.
- Never log personal data (names, emails, phone numbers, locations) with `console.*`. Workers Logs and `wrangler tail` capture it. Audit events go to Supabase tables instead.

## CI

`.github/workflows/ci.yml` runs on pushes and PRs to `master`:

- **ci** job: lint, `astro check` and build. The build needs the `SUPABASE_URL` and `SUPABASE_KEY` repository secrets.
- **smoke** job: starts a local Supabase, then runs `npm run smoke` against the production preview.

GitHub Actions never deploys. The repo is https://github.com/BarWyDev/skill_net.

## Deploy

Production is https://skillnet.barwy.workers.dev on the Workers **Free** plan. Upgrade to Paid before crisis mode ships: Free's 10 ms CPU and 50-subrequest limits silently truncate a fan-out. Details and risks are in @context/foundation/infrastructure.md; the run log is in `context/changes/deployment/deployment-plan.md`.

- **Auto-deploy**: Cloudflare Workers Builds deploys every push to `master` (`npm run build`, then `npx wrangler deploy`), **even when CI is red**. So change `master` only through PRs. Branch protection on `master` requires `ci` and `smoke` to pass before a PR can merge (admins can still push directly; don't).
- **Migrations**: the deploy never touches the database. Production gets migrations only from `npx supabase db push` (the project is linked). Write them expand-then-contract so the code on `master` keeps working. A PR with a migration goes: `npm run db:push:staging` → try it on the branch preview → merge → `npx supabase migration list --linked`, then `npx supabase db push` right after the merge. Pushing a migration to production is a production change; staging is not.
- **Previews**: other branches run `npx wrangler preview` and get `https://<branch>-skillnet.barwy.workers.dev` behind Cloudflare Access. They sign in against the staging Supabase project (`skillnet-staging`): its URL and publishable key are preview base-config secrets (`npx wrangler preview base-config secret put <NAME>`), which never reach production. Staging has public sign-up off; test accounts are created with the Admin API and carry `consent_version` (see **Admin-created accounts**). Previews use their own `SESSION` KV, pinned under `previews` in `wrangler.jsonc`. Keep that pin, or preview builds fail with error 10021. Workers Builds keeps a hidden per-branch trigger that copies the preview command when the branch's preview is created, so editing Previews Base doesn't fix an existing branch; see `infrastructure.md` (Per-branch triggers).
- **Secrets**: `SUPABASE_URL` and `SUPABASE_KEY` (publishable key only). Set them with `npx wrangler secret put <NAME>` or `npx wrangler secret bulk .dev.vars --name skillnet`. Either one **deploys a new version immediately**, so treat it as a production change. Never pass secret values as command arguments.
- **Live errors**: `npx wrangler tail skillnet --format json --status error`
- **State**: `npx wrangler deployments status` and `npx wrangler versions list --json`
- **Rollback**: `npx wrangler rollback <version-id> --message "<reason>"`. It takes seconds, but it doesn't undo migrations, KV data or secrets. The next push to `master` redeploys over a rollback, so revert the bad commit too.
- **Admin-created accounts**: a database trigger refuses every email account without a published, unretired consent version. Creating a user in Studio or with `auth.admin.createUser` fails with `consent_required` unless the user metadata carries `{"consent_version": "<CURRENT_CONSENT_VERSION from src/lib/consent.ts>"}`.
- **Human-only**: deleting the Worker, KV namespaces or named previews, rotating Supabase keys, changing the Workers plan, and granting or revoking the coordinator role on production. Once crisis mode exists, don't merge to `master` while a crisis is active.
