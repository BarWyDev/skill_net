# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

SkillNet: a local skills directory for crisis coordination. A council coordinator activates a crisis and gets nearby residents ranked by distance, skill match and confirmed availability. The same directory is used day to day for neighbour-to-neighbour help. Product source of truth: @context/foundation/prd.md. Stack rationale: @context/foundation/tech-stack.md.

The code is still the `10x-astro-starter` scaffold (auth only, no domain tables yet). The package and the Worker are named `skillnet`. Production runs at https://skillnet.barwy.workers.dev (see **Deploy** below).

## Commands

- `npm run dev`: dev server on http://localhost:4321, running on the Cloudflare workerd runtime
- `npm run build` / `npm run preview`: production build, then serve it on the Cloudflare runtime
- `npm run lint` / `npm run lint:fix`: ESLint with type-checked rules
- `npx astro check`: type check (CI runs `npx astro sync` first)
- `npm run format`: Prettier, with the Astro and Tailwind plugins
- `npm run smoke`: the only test. It walks the full auth flow over HTTP (`scripts/smoke.mjs`) against a running server at `BASE_URL`, which defaults to `http://localhost:4321`. It needs a reachable Supabase with email confirmation disabled. There is no unit or e2e test runner yet. Against production, always set `SMOKE_READONLY=1`: it runs only the two steps that create no accounts.
- `npx supabase start` / `npx supabase stop`: local Supabase (needs Docker). Studio runs at http://localhost:54323.

A pre-commit hook (husky + lint-staged) runs `eslint --fix` on `*.{ts,tsx,astro}` files and `prettier --write` on `*.{json,css,md}` files.

## Architecture

The app is an Astro 7 SSR app (`output: "server"`) deployed to Cloudflare Workers through `@astrojs/cloudflare`. It uses React 19 islands, Tailwind 4, shadcn/ui ("new-york" style, components in `src/components/ui/`) and Supabase for auth and data.

- **Env**: `SUPABASE_URL` and `SUPABASE_KEY` are declared in the `env.schema` of `astro.config.mjs` as *optional* server secrets. Import them from `astro:env/server`, never from `import.meta.env`. Put them in `.env`, and in `.dev.vars` for the workerd runtime (both are gitignored). In production, set them with `npx wrangler secret put`.
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
- Put services in `src/lib/` (or `src/lib/services/`), shared entity and DTO types in `src/types.ts`, and React hooks in `src/components/hooks/`. None of these locations exist yet.
- Migrations go in `supabase/migrations/YYYYMMDDHHmmss_short_description.sql` (the folder doesn't exist yet). Enable RLS on every new table, with separate policies per operation and per role.
- zod is only present as a transitive dependency. Add it to `package.json` before using it for input validation.
- Never log personal data (names, emails, phone numbers, locations) with `console.*`. Workers Logs and `wrangler tail` capture it. Audit events go to Supabase tables instead.

## CI

`.github/workflows/ci.yml` runs on pushes and PRs to `master`:

- **ci** job: lint, `astro check` and build. The build needs the `SUPABASE_URL` and `SUPABASE_KEY` repository secrets.
- **smoke** job: starts a local Supabase, then runs `npm run smoke` against the production preview.

GitHub Actions never deploys. The repo is https://github.com/BarWyDev/skill_net.

## Deploy

Production is https://skillnet.barwy.workers.dev on the Workers **Free** plan. Upgrade to Paid before crisis mode ships: Free's 10 ms CPU and 50-subrequest limits silently truncate a fan-out. Details and risks are in @context/foundation/infrastructure.md; the run log is in `context/changes/deployment/deployment-plan.md`.

- **Auto-deploy**: Cloudflare Workers Builds deploys every push to `master` (`npm run build`, then `npx wrangler deploy`), **even when CI is red**. So change `master` only through PRs, and merge after `ci` and `smoke` pass.
- **Previews**: other branches run `npx wrangler preview` and get `https://<branch>-skillnet.barwy.workers.dev` behind Cloudflare Access. Previews inherit no secrets, so auth is off there. They use their own `SESSION` KV, pinned under `previews` in `wrangler.jsonc`. Keep that pin, or preview builds fail with error 10021.
- **Secrets**: `SUPABASE_URL` and `SUPABASE_KEY` (publishable key only). Set them with `npx wrangler secret put <NAME>` or `npx wrangler secret bulk .dev.vars --name skillnet`. Either one **deploys a new version immediately**, so treat it as a production change. Never pass secret values as command arguments.
- **Live errors**: `npx wrangler tail skillnet --format json --status error`
- **State**: `npx wrangler deployments status` and `npx wrangler versions list --json`
- **Rollback**: `npx wrangler rollback <version-id> --message "<reason>"`. It takes seconds, but it doesn't undo migrations, KV data or secrets. The next push to `master` redeploys over a rollback, so revert the bad commit too.
- **Human-only**: deleting the Worker, KV namespaces or named previews, rotating Supabase keys, and changing the Workers plan. Once crisis mode exists, don't merge to `master` while a crisis is active.

<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit - Module 2, Lesson 1

Move from sprint-zero setup to project orchestration with the **roadmap chain**:

```
(Module 1 foundation docs) -> /10x-roadmap -> backlog-ready roadmap items
```

`/10x-roadmap` is the lesson focus. `/10x-new` is intentionally introduced in Module 2, Lesson 2, when a selected roadmap item becomes an implementation change folder.

### Task Router - Where to start

| Skill | Use it when |
| --- | --- |
| **Roadmap (lesson focus)** | |
| `/10x-roadmap` | You have `context/foundation/prd.md` and a scaffolded project baseline, and you need a vertical-first MVP roadmap. The skill reads the PRD, inspects the code baseline, uses available foundation docs such as `tech-stack.md`, `infrastructure.md`, and `deploy-plan.md`, then writes `context/foundation/roadmap.md`. Use it BEFORE creating per-change folders or implementation plans. |
| **Re-run upstream if needed** | |
| `/10x-shape` / `/10x-prd` / `/10x-tech-stack-selector` / `/10x-bootstrapper` / `/10x-agents-md` / `/10x-infra-research` | Bundled from Module 1 so foundation contracts can be fixed before roadmap sequencing. If roadmap generation exposes a PRD gap, repair the PRD before pretending the backlog is ready. |

### How the chain hands off

- `/10x-roadmap` bridges product and implementation. It does not choose frameworks, design schemas, or write a per-change implementation plan.
- The output is `context/foundation/roadmap.md`: ordered milestones, vertical slices, bounded foundations, dependencies, unknowns, risk, and backlog handoff fields.
- Roadmap items should receive stable human-readable identifiers in backlog tools. The actual `context/changes/<change-id>/` folder is created in Lesson 2 with `/10x-new`.

### Roadmap boundaries

- Default to vertical slices: user-visible outcomes that cross UI, data, business logic, and integrations.
- Horizontal work is allowed only as a bounded enabler that names the downstream vertical milestone it unlocks.
- Avoid orphan horizontal work such as "build the whole database", "build all API endpoints", or "design the whole UI" before the first user-visible flow.
- Roadmap is not a calendar estimate. Do not invent dates, story points, or sprint velocity unless the user explicitly asks for a separate planning artifact.

### Foundation paths used by this lesson

- `context/foundation/prd.md` - input
- `context/foundation/tech-stack.md` - optional input
- `context/foundation/infrastructure.md` - optional input
- `context/deployment/deploy-plan.md` - optional input
- `context/foundation/roadmap.md` - output
- `context/foundation/lessons.md` - recurring rules and pitfalls
- `docs/reference/contract-surfaces.md` - load-bearing names registry

Skills must not write to `context/archive/`. Archived changes are immutable; if a resolved target path starts with `context/archive/`, abort with: "This change is archived. Open a new change with `/10x-new` instead."

<!-- END @przeprogramowani/10x-cli -->
