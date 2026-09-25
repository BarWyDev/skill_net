---
project: skillnet
researched_at: 2026-09-23
recommended_platform: Cloudflare Workers (Workers Paid, static assets + Queues)
runner_up: Render
context_type: mvp
tech_stack:
  language: TypeScript
  framework: Astro 7.3 (SSR, output "server") + React 19 islands
  runtime: Cloudflare workerd via @astrojs/cloudflare 14.3.1 (wrangler 4.131.1)
---

## Recommendation

**Deploy on Cloudflare Workers, on the Workers Paid plan ($5/mo), using Workers + static assets (not Pages).**

On raw criteria Cloudflare scores 21/22. Render and Railway both score 22/22. Cloudflare wins because of the interview answers:
- **Developer experience over cost.** The scaffold already targets it: the `@astrojs/cloudflare` adapter, `wrangler.jsonc`, a workerd-based `astro dev`, and a CI build plus smoke test that run on workerd. Nothing needs migrating.
- **Existing familiarity.** The developer already knows Cloudflare, which breaks the near-tie.
- **Persistent connections and background workers.** The requirement is met by Queues (SMS/push fan-out), Durable Objects with WebSocket Hibernation (long-lived connections), Cron Triggers and Workflows. Supabase Realtime, which the browser connects to directly, carries the coordinator's live confirmations.

The recommendation rests on those answers. If familiarity or the zero-migration argument stops mattering, Render leads: it runs in Frankfurt next to Supabase and supports always-on workers.

## Platform Comparison

Scoring: Pass = 2, Partial = 1, Fail = 0. CLI-first, Managed and Deploy API are weighted ×3, Docs ×2 and MCP ×1, for a maximum of 22. Hard filter: the interview required persistent connections and background workers, which drops serverless-only platforms. All six platforms can run TypeScript/Astro, so the language filter drops none. Status was checked on 2026-09-23.

| Platform | CLI-first | Managed/Serverless | Agent-readable docs | Stable deploy API | MCP / Integration | Total |
|---|---|---|---|---|---|---|
| Cloudflare Workers | Pass | Pass | Pass | Partial | Pass | 21 |
| Render | Pass | Pass | Pass | Pass | Pass | 22 |
| Railway | Pass | Pass | Pass | Pass | Pass | 22 |
| Fly.io | Pass | Partial | Pass | Partial | Partial | 17 |
| Vercel | Pass | Pass | Pass | Pass | Partial | ruled out: no persistent processes |
| Netlify | Pass | Pass | Pass | Pass | Pass | ruled out: no persistent processes |

**Cloudflare Workers.**
- **CLI.** Wrangler covers every routine operation without prompts: `deploy`, `versions upload --preview-alias`, `versions deploy`, `rollback --message`, `tail --format json` and `secret put|list|delete|bulk`.
- **Docs.** A root `llms.txt` links to one per product, and appending `/index.md` to any docs page returns markdown.
- **Deploy API: Partial.** `deploy` doesn't print JSON; structured output needs `WRANGLER_OUTPUT_FILE_PATH`, which the installed 4.131.1 supports. Workers that contain a Durable Object get no version preview URLs and can't be tailed.
- **MCP.** The Cloudflare API MCP server (`mcp.cloudflare.com/mcp`) is GA. Docs, Bindings, Builds and Observability MCP servers exist but carry no status label.
- **Plans.** Free is unusable for this app: 10 ms of CPU and 50 subrequests per invocation. Paid is $5/mo and includes 10M requests and 30M CPU-ms. CPU time defaults to 30 s and can be raised to 5 min; subrequests default to 10,000.
- **Background work.** Queues on Paid include 1M operations, batches of up to 100 messages and 5,000 messages/s per queue. Workflows have been GA since 2025-04-07 and bill per step from 2026-08.
- **EU residency.** The Data Localization Suite is **Enterprise-only**. Durable Objects can be pinned with `jurisdiction("eu")`. Smart Placement is **beta** (checked 2026-09-23).

**Render.**
- **Strengths.** Native Node on `@astrojs/node`, a Frankfurt region for every service (next to Supabase `eu-central-1`), always-on Background Workers and WebSockets with no maximum duration. Docs come as `llms.txt`, `llms-full.txt` and `.md` pages.
- **Integration.** A hosted MCP server (GA) that can't delete, scale or roll back. Workflows became GA on 2026-09-01.
- **Gaps.** No rollback command in the CLI (it's API or Dashboard only). API keys can't be scoped, so one key reaches every workspace. Full-stack preview environments need the Pro workspace ($25/mo). Starter web plus a worker costs about $14/mo or more.

**Railway.**
- **Strengths.** `railway up --ci` has clean exit codes, project-scoped `RAILWAY_TOKEN`, `--json` on logs and deployments, `llms-full.txt`, and a hosted MCP (`mcp.railway.com`, no status label). PR environments are included.
- **Gaps.** The only EU region is Amsterdam (EU West Metal). Rollback works through the dashboard or the GraphQL `deploymentRollback` mutation, and only while the image is retained: 72 h on Hobby. Sleeping (Serverless) mode can't host a worker. Estimated $10–20/mo.

**Fly.io.**
- **Strengths.** Any Docker image, process groups for a worker, WebSockets, about $8/mo for web plus worker at 512 MB in `fra`.
- **Gaps.**
  - The **`waw` (Warsaw) region was deprecated in September 2025**.
  - There's no rollback command; you redeploy a previous image.
  - You own the Dockerfile and auto-stop tuning.
  - The flyctl MCP server is **experimental** and has no deploy tool.
  - There are no native PR previews; you'd need the `fly-pr-review-apps` GitHub Action.

**Vercel (ruled out).**
- **Why.** No always-on processes. WebSockets are in **public beta** (since 2026-06-22) and close when the function hits its time limit. Queues are **beta**.
- **Also.** Workflows are GA, but the 4.x SDK stores state in `iad1`, which is a GDPR problem. Hobby is non-commercial only. The MCP is **public beta** and gets full account permissions. Otherwise the CLI, docs and deploy API are excellent.

**Netlify (ruled out).**
- **Why.** No WebSockets or long-lived processes. Background Functions are capped at 15 min.
- **Also.** Choosing the EU region requires Pro. Blobs default to `us-east-2`. The CLI, `.md` docs and official MCP are all strong.

### Shortlisted Platforms

#### 1. Cloudflare Workers (Recommended)

Nothing to migrate: the adapter, config, CI and smoke test already run on workerd. It costs a flat $5/mo at MVP traffic.
- **Fan-out.** Queues are the natural shape for the SMS/push fan-out, and Cron Triggers handle auto-expiry of forgotten crises (FR-015).
- **Connections.** Durable Objects cover any long-lived connection Supabase Realtime doesn't.
- **Tokens.** API tokens can be scoped per account and permission, which fits the scoped-token rule for production access.
- **Integration.** The strongest MCP line-up of the three.
- **Familiarity.** The developer already knows it.

#### 2. Render

Scores as well as or better than Cloudflare on every criterion.
- **Region.** Frankfurt co-location with Supabase helps both the ≤ 3 s ranking target and the data-residency story.
- **Workers.** Always-on workers plus Workflows (GA) are a simpler mental model than queue-first serverless.
- **Why it's second:**
  - It needs an adapter migration to `@astrojs/node`, a rewrite of the smoke-test and CI targets, and filesystem sessions replaced with Key Value.
  - API keys can't be scoped, which conflicts with the scoped-token posture.
  - Rollback isn't in the CLI.
  - It costs about 3× Cloudflare.

#### 3. Railway

Equally strong raw criteria, project-scoped tokens and bundled PR environments. It is third for two reasons: Amsterdam is further from Poland and from Supabase Frankfurt than Render's Frankfurt, and rollback depends on the image still being retained (72 h on Hobby). It needs the same adapter migration as Render.

## Anti-Bias Cross-Check: Cloudflare Workers

### Devil's Advocate — Weaknesses

1. **EU residency is only partial.** Workers process residents' phone numbers and home locations in whichever data centre the request lands in. The Data Localization Suite is Enterprise-only. `observability.enabled: true` sends any logged personal data to Workers Logs, and Cloudflare doesn't commit to where that data is stored.
2. **The fan-out is capped at 6 simultaneous outgoing connections per invocation.** Alerting 2,000 matched residents therefore needs Queues, batch consumers, retry and dead-letter handling, and rate limits that respect the SMS provider's own. The Free plan (10 ms CPU, 50 subrequests) cannot do it at all.
3. **Durable Objects remove preview URLs.** A Worker that contains a Durable Object loses version preview URLs and `tail`/Workers Logs for those versions. Every deploy disconnects all open WebSockets, so a deploy during an active crisis cuts off anything the coordinator has open on a Durable Object.
4. **The confirmation path crosses three vendors.** A reply travels SMS provider → Worker (webhook) → Supabase → Realtime → coordinator. An outage at any one of them breaks the 5-minute confirmation window (US-01), and the NFR says the ranked list must survive optional services being down.
5. **The ≤ 3 s ranked list depends on query design.** Without Smart Placement (beta), every supabase-js round trip goes from a Polish data centre to Frankfurt. A chatty implementation will blow the budget, so the ranking has to be a single Postgres/PostGIS RPC.

### Pre-Mortem — How This Could Fail

Six months in, the pilot council's first real drill failed. The team had deployed on Workers Free because traffic was tiny. The activation hit the 50-subrequest cap after about 40 SMS and silently stopped. They moved to Paid and rebuilt the fan-out on Queues, but they had put the Durable Object for the live coordinator view inside the main Worker. That turned off preview URLs, so every change was tested in production. A Friday deploy during a flood exercise disconnected every coordinator. Meanwhile an FCM push SDK that depended on `http2` built cleanly but threw at runtime on workerd, so push alerts never went out and SMS alone carried the load. Then the council's data-protection officer asked where residents' locations were processed. The honest answer was "any Cloudflare edge location, logs retained 7 days, location unspecified", and the paperwork to satisfy them stalled the rollout for two months. Cloudflare wasn't the failure in any single step. The failure was treating it as "free and global" instead of "Paid, EU-constrained, queue-first".

### Unknown Unknowns

- **The adapter no longer supports Pages.** `@astrojs/cloudflare` v14 dropped Pages, and `tech-stack.md` still says `deployment_target: cloudflare-pages`. Only Workers + static assets works; never use `wrangler pages` commands. Cloudflare's own Astro guide still shows `Astro.locals.runtime`, which v14 removed. Read env through `astro:env/server` (as the project already does) or `import { env } from "cloudflare:workers"`.
- **The first deploy creates a KV namespace.** The adapter adds a KV binding named `SESSION` with no ID (verified in `node_modules/@astrojs/cloudflare/dist/wrangler.js`). On the first deploy, wrangler 4.131.1 creates the namespace itself. A CI token scoped without KV edit permission will fail that deploy.
- **Some Node modules are only stubs.** Under `nodejs_compat`, `http2`, `child_process`, `vm` and `worker_threads` build fine but fail at runtime. SMS and push SDKs built on them, such as firebase-admin's FCM client, break only in production. Call providers' REST APIs with `fetch`.
- **`astro dev` already runs on workerd.** `wrangler dev` is redundant for this adapter version. `.dev.vars` is still the local secrets file.
- **Workers Logs are short-lived.** They keep 7 days on Paid (3 on Free). The audit trail for the break-glass contact reveal (FR-012) and consent records (NFR) must live in Supabase tables, not in platform logs.

## Operational Story

- **Preview deploys.** For each PR, upload a new version of the Worker with `npx wrangler versions upload --preview-alias pr-<n>`, which gives `https://pr-<n>-skillnet.<account-subdomain>.workers.dev` without changing production traffic. Alternatively, Workers Builds' Git integration posts preview URLs on PRs; it carries no status label. Protect `*.workers.dev` previews with Cloudflare Access, because they hit real Supabase data unless a separate staging Supabase project exists. Preview URLs don't exist for a Worker that contains a Durable Object, so Durable Objects go in a separate Worker. Fork PRs get no previews because GitHub doesn't pass secrets to fork PRs.
- **Secrets.** Runtime secrets (`SUPABASE_URL`, `SUPABASE_KEY`, and later the SMS provider key) are Workers Secrets, set with `npx wrangler secret put <NAME>`.
  - **Who can read them:** nobody through the API or dashboard; values can't be read back after they're set. Locally they live in `.dev.vars` (gitignored).
  - **CI:** needs `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as GitHub repository secrets, next to the existing `SUPABASE_URL` and `SUPABASE_KEY`.
  - **Rotation:** `wrangler secret put` immediately creates and deploys a new version, so rotating a secret is a production change.
- **Rollback.** Run `npx wrangler versions list --json` to find the last good version, then `npx wrangler rollback <version-id> --message "reason"`.
  - **Time to revert:** seconds.
  - **Range:** the last 100 versions.
  - **What it doesn't undo:** Supabase migrations, KV, Queue or Durable Object data, or secrets changed since. Write database migrations to be expand-then-contract so the previous code version still works.
- **Approval.**
  - **The agent may run unattended:** `npm run build`, `wrangler versions upload` (previews), `wrangler versions list`, `wrangler deployments status`, `wrangler tail`, and read-only MCP queries.
  - **A human approves:** production deploys (`wrangler deploy`, `versions deploy`, or merging to `master` once CI auto-deploys), `wrangler secret put` against production, and rollbacks during an active crisis.
  - **Human-only, by hand in the dashboard:** deleting the Worker, KV namespaces or queues, rotating the Supabase service key, dropping database objects, and changing the Workers plan.
- **Logs.**
  - Live: `npx wrangler tail skillnet --format json --status error`.
  - Deployment state: `npx wrangler deployments status` and `npx wrangler versions list --json`.
  - Historical: Workers Logs (7-day retention) through the Cloudflare Observability MCP server.
  - Database, auth and Realtime: `npx supabase` CLI or the Supabase MCP.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| Free-plan limits (10 ms CPU, 50 subrequests) silently truncate a crisis fan-out | Research finding | H (if Free is used) | H | Upgrade to Workers Paid before the first deploy that carries crisis mode; set `limits.cpu_ms` explicitly in `wrangler.jsonc` |
| Fan-out hits the 6-connection limit and the SMS provider's rate limits | Devil's advocate | H | H | Build the fan-out as a Cloudflare Queue from day one: producer on activation, batched consumer, `max_retries` plus a dead-letter queue, and progress recorded in Supabase |
| Council DPO rejects "processed at any edge location" for phones and locations | Devil's advocate / Pre-mortem | M | H | Supabase project in `eu-central-1`; no personal data in `console.log`; document Cloudflare's DPA and SCCs; pin any Durable Object that holds personal data with `jurisdiction("eu")`; reassess the Data Localization Suite (Enterprise) before multi-municipality rollout |
| Durable Object in the main Worker removes preview URLs and tail | Devil's advocate / Research finding | M | M | Put any Durable Object in a separate Worker, bound through a service binding |
| A deploy during an active crisis drops coordinators' live connections | Pre-mortem | M | H | Keep coordinator live updates on Supabase Realtime; enforce a deploy freeze while a crisis is active (check before `wrangler deploy`) |
| Push or SMS SDK depends on stubbed Node modules (`http2`, etc.) and fails at runtime | Unknown unknowns | M | H | Use providers' REST APIs through `fetch`; smoke-test the alert path on `npm run preview` (workerd) in CI |
| Agent follows Pages docs, or `Astro.locals.runtime` examples, that don't match adapter v14 | Unknown unknowns | H | M | Fix `tech-stack.md` (`deployment_target: cloudflare-workers`); add a CLAUDE.md rule: Workers only, no `wrangler pages`, env through `astro:env` or `cloudflare:workers` |
| First CI deploy fails because the scoped token can't create the automatic `SESSION` KV namespace | Unknown unknowns | M | L | Do the first deploy locally with `wrangler login`, or give the token Workers KV Storage:Edit; or set `session: false` if Astro sessions stay unused |
| Ranked list exceeds 3 s because of chatty cross-region queries | Devil's advocate | M | M | One PostGIS RPC for the ranking; measure latency from Poland; add a placement hint (`aws:eu-central-1`) or Smart Placement (beta) only if measured latency requires it |
| Three-vendor confirmation path (SMS → Worker → Supabase → Realtime) breaks the 5-minute window | Devil's advocate | L | H | Idempotent webhook with retries; the coordinator list reads Supabase directly (not a Worker cache); the break-glass reveal works when SMS is down |
| Break-glass and consent audit is lost to 7-day log retention | Unknown unknowns | M | H | Write audit events to an append-only Supabase table with RLS; never rely on Workers Logs for compliance |
| Worker still named `10x-astro-starter`, so previews and production get the wrong URL and name | Research finding | H | L | Rename to `skillnet` in `wrangler.jsonc` and `package.json` before the first deploy |

## Getting Started

These commands are verified against Astro 7.3.2, `@astrojs/cloudflare` 14.3.1 and wrangler 4.131.1. They target Workers; do **not** use `wrangler pages` commands.

1. **Account and project prep.** Upgrade the Cloudflare account to Workers Paid. Create the Supabase project in `eu-central-1`, Frankfurt. Rename the Worker: set `"name": "skillnet"` in `wrangler.jsonc` and `package.json`. Then authenticate with `npx wrangler login` locally, or create an API token scoped to this account with Workers Scripts:Edit and Workers KV Storage:Edit (no DNS or billing permissions) for CI.
2. **Set runtime secrets.** Run `npx wrangler secret put SUPABASE_URL`, then `npx wrangler secret put SUPABASE_KEY`. `astro:env` server secrets are read from Worker env at runtime. Keep `.env` and `.dev.vars` for local work; `npm run dev` already runs on workerd, so no `wrangler dev` is needed.
3. **Build and dry-run.** Run `npm run build`, then `npx wrangler deploy --dry-run`. Confirm the generated config includes the `ASSETS` binding and the adapter-injected `SESSION` KV binding.
4. **First production deploy.** Run `npx wrangler deploy` (set `WRANGLER_OUTPUT_FILE_PATH=./wrangler-output.json` for machine-readable output). Then run `BASE_URL=https://skillnet.<subdomain>.workers.dev npm run smoke` and `npx wrangler tail skillnet --format json` to verify.
5. **Wire the operations loop.** Record the deployed version with `npx wrangler versions list --json`, rehearse `npx wrangler rollback <id> --message "rehearsal"` once, and add a deploy job to `.github/workflows/ci.yml` gated on the `ci` and `smoke` jobs. That job needs the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets.

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration
- CI/CD pipeline setup
- Production-scale architecture (multi-region, HA, DR)
