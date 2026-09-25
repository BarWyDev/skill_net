# Cloudflare Workers Integration & First Deployment Plan

> **First execution step:** copy this plan verbatim to `context/changes/deployment/deployment-plan.md`, and add a short `context/changes/deployment/change.md` identity file, as `context/changes/README.md` requires. From then on that file is the tracker: tick boxes there as work lands.

## Context

`context/foundation/infrastructure.md` (2026-09-23) picked **Cloudflare Workers on the Workers Paid plan, using Workers + static assets (not Pages)**. The repo is still the `10x-astro-starter` scaffold:

- The Worker and the package are named `10x-astro-starter`.
- `tech-stack.md` says `deployment_target: cloudflare-pages`, which is wrong: adapter v14 dropped Pages.
- There's no git repo, no hosted Supabase and no deploy pipeline.

This plan takes the app from local-only to a production Worker at `https://skillnet.<subdomain>.workers.dev`. It is auto-deployed from `master` by **Cloudflare Workers Builds**, and every external integration (Cloudflare, GitHub, Supabase) has explicit human gates and extra support steps for the edge cases found during research.

### Decisions locked (2026-09-24)

| Decision                  | Choice                                                  | Consequence                                                                                                                                                                                                                                                                                                                            |
| ------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Who auto-deploys `master` | **Workers Builds** (Cloudflare Git integration)         | GitHub Actions keeps lint, type check, build and smoke only. No Cloudflare token stored in GitHub. Merges are gated by branch protection, not by a deploy job.                                                                                                                                                                         |
| Supabase                  | **One new production project** in `eu-central-1`        | Previews hit production data, so preview URLs sit behind Cloudflare Access. The production smoke test runs read-only.                                                                                                                                                                                                                  |
| Domain                    | **workers.dev for now**                                 | A custom domain is an optional Phase 8.                                                                                                                                                                                                                                                                                                |
| Workers plan              | **Workers Free** for now (changed 2026-09-25, was Paid) | The owner chose to stay on Free. The auth-only scaffold fits its limits. Free limits (10 ms CPU, 50 subrequests, 100k requests/day) break crisis fan-out, so **upgrade to Paid before the first deploy that carries crisis mode**, per the `infrastructure.md` risk register. No `limits.cpu_ms` in `wrangler.jsonc`: Free rejects it. |

### Legend

- Owner: `[agent]` Claude runs it unattended. `[human]` you do it (dashboard, secrets, accounts). `[approve]` Claude runs it only after an explicit "yes" in chat.
- Phase status: ⬜ not started · 🟡 in progress · ✅ done · ⛔ blocked (write the reason next to it)

## Progress Tracker

| #   | Phase                                  | Status | Gate to exit                                                              |
| --- | -------------------------------------- | ------ | ------------------------------------------------------------------------- |
| 0   | Store plan & change folder             | ✅     | File exists at `context/changes/deployment/`                              |
| 1   | Prerequisites & CLI setup              | 🟡     | `wrangler whoami`, `gh auth status`, `supabase projects list` all succeed |
| 2   | Repo preparation (code/config)         | ✅     | `npm run build` + `wrangler deploy --dry-run` clean, lint/check pass      |
| 3   | Supabase production project            | ⬜     | Auth URLs set, keys in hand, email path decided                           |
| 4   | First manual production deploy         | 🟡     | Read-only smoke passes against workers.dev                                |
| 5   | Git + GitHub + Workers Builds          | 🟡     | Push to `master` auto-deploys; PR gets preview URL                        |
| 6   | Guardrails (Access, branch protection) | 🟡     | Preview URL requires login; merge blocked on red CI                       |
| 7   | Operations loop & docs sync            | ⬜     | Rollback rehearsed; foundation docs match reality                         |
| 8   | _(optional, later)_ Custom domain      | ⬜     | Not in this release                                                       |

---

## Phase 0 — Store plan & change folder ✅

- [x] `[agent]` Create `context/changes/deployment/deployment-plan.md` (this document).
- [x] `[agent]` Create `context/changes/deployment/change.md` with a one-paragraph identity: goal, date, and a link to `infrastructure.md`.

## Phase 1 — Prerequisites & CLI setup 🟡

**Accounts (all `[human]`):**

- [x] Cloudflare account. ~~Upgrade to Workers Paid~~ Staying on **Workers Free** (decision 2026-09-25). Upgrade before crisis mode ships.
- [x] **Register the workers.dev subdomain** (Dashboard → Workers & Pages → the onboarding sets `<subdomain>.workers.dev`). Write the chosen `<subdomain>` here: `barwy` → `https://skillnet.barwy.workers.dev`.
  - _Edge case:_ if it isn't registered, `wrangler deploy` tries an interactive prompt. That fails in Workers Builds with "cannot be run in a non-interactive context".
- [ ] GitHub account. Decide whether the repo is **public or private** (see Phase 6: branch protection on a private repo needs GitHub Pro).
- [ ] Supabase account (organisation on the Free tier is fine to start; see the Phase 3 note on pausing).

**CLI tooling.** All of it runs through `npx`, so the versions come from the project (`wrangler` 4.131.1, `supabase` ^2.23).

- [ ] `[human]` `npx wrangler login`. This is an OAuth browser flow, and the credentials go to `~/.wrangler`, not the repo.
- [x] `[agent]` Verify with `npx wrangler whoami`. Record the **Account ID** in this plan (it isn't a secret): `390226486d2b7c29eaf6ef81a2e35bba` (single account, 2026-09-25).
  - _Edge case:_ if more than one account is listed, the agent sets `CLOUDFLARE_ACCOUNT_ID` in the shell (or `account_id` in `wrangler.jsonc`) so commands never prompt.
- [ ] `[human]` `gh auth login` (GitHub CLI, HTTPS, browser). Then `[agent]` runs `gh auth status`.
  - If `gh` is missing: `brew install gh`.
- [ ] `[human]` `npx supabase login`. Then `[agent]` runs `npx supabase projects list`.
- [ ] `[agent]` Confirm local Node matches `.nvmrc` (22.14.0): `node -v`.
- [ ] _(optional)_ `[human]` Add the Cloudflare MCP servers (Observability, Builds) to the user-level Claude config, never to a committed `.mcp.json`. The CLI alone is enough for this plan.

**Token posture:**

- Workers Builds uses a Cloudflare-generated build token scoped to this account's Workers Scripts and KV. No Cloudflare token lives in GitHub.
- Destructive actions stay human-only, done by hand in the dashboard: deleting the Worker or KV, rotating Supabase keys, changing the plan.

## Phase 2 — Repo preparation (code/config) ✅

All steps are `[agent]` and run locally. They only change the repo.

1. [x] **Rename to `skillnet`.** Set `"name": "skillnet"` in `wrangler.jsonc` and `package.json`, then run `npm install --package-lock-only` so `package-lock.json` matches.
   - _Why:_ Workers Builds fails if the dashboard Worker name ≠ the wrangler config name.
2. [x] **Pin the `SESSION` KV namespace.** The adapter injects an ID-less `SESSION` binding (`node_modules/@astrojs/cloudflare/dist/wrangler.js`, `cloudflareConfigCustomizer`). Wrangler then auto-provisions it, and Workers Builds re-provisioning has failed with **error 10014, "namespace already exists"** (workers-sdk #14284/#14262, astro #15802).
   - `[approve]` `npx wrangler kv namespace create SESSION` creates one namespace, and the command prints its ID.
   - Add to `wrangler.jsonc`: `"kv_namespaces": [{ "binding": "SESSION", "id": "<id>" }]`. The adapter skips injection when that binding already exists (`hasSessionBinding`).
   - The app doesn't use Astro sessions today (auth lives in Supabase cookies), so this is purely defensive.
   - **Done 2026-09-25:** namespace `skillnet-session`, id `ac680c0499b04685bdd941b6d25b6b77`. It's named apart from the account's existing `dzielnia-session`, which belongs to another project.
3. [x] **Tighten `wrangler.jsonc`:**
   - `"workers_dev": true` and `"preview_urls": true`, set explicitly.
   - ~~`"limits": { "cpu_ms": 30000 }`~~ **Dropped 2026-09-25**: the account stays on Free, which rejects `cpu_ms`. Add it back together with the Paid upgrade.
   - Keep `observability.enabled: true`. Add a CLAUDE.md rule: no personal data in `console.*`.
4. [x] **Set `site` in `astro.config.mjs`** to `https://skillnet.<subdomain>.workers.dev`. `@astrojs/sitemap` silently skips generation without `site`.
5. [x] **Read-only smoke mode.** In `scripts/smoke.mjs`, when `SMOKE_READONLY=1`, run only the first two steps ("home renders" and "dashboard redirects anonymous user").
   - _Why:_ production has email confirmation on (signup can't sign in immediately), and the full smoke would litter production `auth.users` with `smoke-*@example.com` accounts.
   - Leave the default (full) mode untouched so the CI `smoke` job is unchanged.
6. [x] **Local verification:** `npx astro sync && npm run lint && npx astro check && npm run build`, then `npx wrangler deploy --dry-run`. Confirm in the output:
   - The configuration used is the **redirected** one (`.wrangler/deploy/config.json` → `dist/server/wrangler.json`), not the root `wrangler.jsonc`.
   - The bindings are `ASSETS`, `SESSION` (with the pinned ID) and no unexpected `IMAGES`.
   - The name is `skillnet`.
   - **Result 2026-09-25:** redirected config, name `skillnet`, `SESSION` pinned. The bindings also show `IMAGES`, which **is expected**: the adapter's default image service binding (`imagesBindingName`) has no resource ID, so it can't trigger auto-provisioning. It's kept.
   - **Watch item:** the generated `dist/server/wrangler.json` also carries a `previews` block with an ID-less `SESSION`. It's ignored by `versions upload` on wrangler 4.131.1. Revisit it before switching to `wrangler preview` (≥ 4.135), because it may auto-provision a per-preview namespace.

**Support steps:**

- If the dry run still shows `SESSION` with no ID, inspect `dist/server/wrangler.json`. The binding name must match exactly, including case.
- If `npm run build` warns about missing `SUPABASE_*`, that's expected. They're optional server secrets read at runtime, not at build time.

## Phase 3 — Supabase production project ⬜

- [ ] `[human]` Create the project **SkillNet (prod)** in region **Central EU (Frankfurt) `eu-central-1`**. Store the DB password in your password manager; the agent never sees it.
- [ ] `[human]` Copy the **Project URL** and the **anon / publishable key** (never `service_role`). They are used in Phase 4.
- [ ] `[human]` Auth → URL Configuration:
  - **Site URL:** `https://skillnet.<subdomain>.workers.dev`
  - **Redirect URLs:** `https://skillnet.<subdomain>.workers.dev/**`, plus the preview pattern `https://*-skillnet.<subdomain>.workers.dev/**`
  - _Edge case:_ without this, confirmation emails link to `localhost:3000`, which is the `supabase/config.toml` default.
- [ ] `[human]` Auth → Email: keep **Confirm email ON** in production.
- [ ] **Email delivery decision.** Supabase's built-in SMTP only sends to **your project team's addresses** and is capped at about 2 emails/hour.
  - That's fine for the first deploy's manual test with your own address.
  - **Configure custom SMTP (e.g. Resend, Postmark, SES) before any non-team user signs up.** Track it as an open item; it isn't blocking for this release.
- [ ] `[agent]` `npx supabase link --project-ref <ref>` (it prompts for the DB password, so it's `[human]` input). Then `npx supabase db push --dry-run`. The expected result is "no migrations", because `supabase/migrations/` doesn't exist yet. This proves the pipeline for later.

**Support notes:**

- **Free-tier pause.** Free projects pause after about 7 days without activity. The Worker then fails auth calls and the middleware treats everyone as anonymous. Restore it from the dashboard, and plan the Supabase Pro upgrade before the council pilot.
- **Migrations aren't rolled back by a Worker rollback.** Write future migrations expand-then-contract (see `infrastructure.md` → Rollback).

## Phase 4 — First manual production deploy 🟡

The order matters. **Deploy first, then set secrets.** `wrangler secret put` against a Worker that doesn't exist yet asks interactively to create it.

1. [x] `[approve]` `WRANGLER_OUTPUT_FILE_PATH=./wrangler-output.json npx wrangler deploy` (after `npm run build`). **Done 2026-09-25** → `https://skillnet.barwy.workers.dev`, startup time 21 ms.
   - Add `wrangler-output.json` to `.gitignore`.
   - Expected: the site loads with the Polish config banner ("Supabase nie jest skonfigurowany"). The client returns `null` without env, and that's handled gracefully.
2. [x] `[human]` `npx wrangler secret put SUPABASE_URL`, then `npx wrangler secret put SUPABASE_KEY`, pasting the values at the prompt. **Done 2026-09-25** by the owner with `npx wrangler secret bulk .dev.vars --name skillnet` (version `d017772d`, 2 s before the deploy finished; the deploy kept the secrets).
   - Each command **deploys a new version immediately**.
   - The agent doesn't type key values.
3. [x] `[agent]` `npx wrangler secret list` shows both names, and the banner is gone on the live URL.
4. [x] `[agent]` `SMOKE_READONLY=1 BASE_URL=https://skillnet.<subdomain>.workers.dev npm run smoke` → all pass. Passed 2026-09-25. A bad-password sign-in also returned `?error=Invalid login credentials`, which proves the Worker → Supabase path.
5. [ ] `[human]` Manual auth check with your own email (a team address, so the built-in SMTP delivers):
   - Sign up, and the confirmation email arrives with a workers.dev link.
   - Confirm, sign in, `/dashboard` renders, sign out.
   - **2026-09-25, partial:** sign in → `/dashboard` → sign out all work on production. Sign-up returned `email rate limit exceeded` (built-in SMTP, about 2 emails/hour per project, already used up), so the **confirmation email link is still untested**. Retest once, after the hourly reset.
6. [x] `[agent]` Run `npx wrangler tail skillnet --format json --status error` during step 5. Expect no errors. Done 2026-09-25: two tail sessions, every request outcome `Ok`, no exceptions.
7. [x] `[agent]` `npx wrangler versions list --json`: record the first good version ID here: `bece9ffd-8854-4cb4-a430-1acde2b863ad` (100% deployed, 2026-09-25).

**Support steps:**

| Symptom                                | Likely cause                                                   | Fix                                                                                   |
| -------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `You need a workers.dev subdomain`     | Phase 1 onboarding skipped                                     | Register it in the dashboard, then retry                                              |
| `code: 10014 namespace already exists` | `SESSION` not pinned, or the wrong ID                          | Redo Phase 2 step 2 with the existing namespace ID (`npx wrangler kv namespace list`) |
| 403 on form POST                       | Astro origin check: the `Origin` header doesn't match the host | Make sure you're hitting the canonical URL; the smoke test already sends `Origin`     |
| Banner still shown after the secrets   | The secret name is misspelled, or it was set on another Worker | `npx wrangler secret list --name skillnet`                                            |
| Runtime `not implemented` errors       | A Node built-in stub under `nodejs_compat`                     | Find it with `wrangler tail`; replace the SDK with `fetch` to the REST API            |
| Confirmation link → localhost          | Supabase Site URL not set                                      | Phase 3 URL configuration                                                             |

## Phase 5 — Git, GitHub & Workers Builds 🟡

1. [x] `[agent]` `git init -b master`.
   - Check that `.gitignore` covers `.env`, `.dev.vars`, `.wrangler/`, `dist/` and `wrangler-output.json`.
   - Run `git status` and **review that no secrets are staged**.
   - First commit.
2. [x] `[approve]` `gh repo create skillnet --<private|public> --source . --push`. This publishes code to GitHub. **Done differently:** the repo was created by hand as `BarWyDev/skill_net` and pushed on 2026-09-25.
3. [x] `[human]` Add the GitHub repo secrets `SUPABASE_URL` / `SUPABASE_KEY`, which the existing `ci` job's build step uses. Use the prod anon values or dummies; the build doesn't need real ones. Done 2026-09-25 with the prod publishable key.
4. [x] `[human]` Cloudflare Dashboard → Workers & Pages → **skillnet** → Settings → Builds → **Connect** to the GitHub repo (install the Cloudflare GitHub App on this repo only). Configure: **Connected 2026-09-25.**
   - Production branch: `master`
   - Build command: `npm run build`
   - Deploy command: `npx wrangler deploy`
   - **Non-production branch deploy command: `npx wrangler versions upload`.** Do _not_ keep the new default `npx wrangler preview`, which needs wrangler ≥ 4.135.0; the project pins 4.131.1.
   - Build variables: none needed. `.nvmrc` pins Node 22.14.0. The build image preinstalls 22.23.2 and 24.18.0, so 22.14.0 is installed per build: slower, but consistent with CI.
   - Build watch paths: default (all).
5. [x] `[agent]` Push a trivial commit to `master` (for example the docs sync from Phase 7), then check: **Verified 2026-09-25:** two pushes deployed on their own. `5f6bada` → version `6185fee0` (build succeeded 17:40 UTC) and `62cbaf3` → version `ccd7b111` (build succeeded 17:44 UTC, 100% traffic). The Workers Builds check shows up on each commit next to `ci` and `smoke`, and the read-only smoke passes on the new version.
   - The build succeeds in the dashboard.
   - `npx wrangler deployments status` shows a new version with Workers Builds as the source.
   - The read-only smoke passes again.
6. [ ] `[agent]` Open a test PR from a branch. Expected: a Cloudflare bot comment with a version preview URL, and `ci` and `smoke` checks running in GitHub Actions.

**Support steps:**

- **Preview build fails with "The name in your wrangler.json file must match the name of your Worker".** This is workers-sdk **#15682**, open as of 2026-09-16: non-production builds get a wrong `WRANGLER_CI_MATCH_TAG`. Set the non-production deploy command to `env -u WRANGLER_CI_MATCH_TAG npx wrangler versions upload`.
- **The production build fails with the same message.** The dashboard Worker name isn't `skillnet`; rename it or reconnect.
- **`npm ci` fails in the build image.** The lockfile is out of sync after the rename. Run `npm install` locally and commit the lockfile.
- **You want Worker Previews (named previews per branch, GA) later.** Upgrade wrangler to ≥ 4.135 and add a `previews` block (it doesn't inherit production bindings or secrets), then switch the command to `npx wrangler preview`. That's out of scope now.
- **Fork PRs:** Workers Builds doesn't build them. That's acceptable for a solo repo.

## Phase 6 — Guardrails 🟡

- [x] `[human]` Worker → Settings → Domains & Routes → **Preview URLs → enable Cloudflare Access** (one click). Allow only your email.
  - _Why:_ previews run against the **production** Supabase.
  - `[agent]` verify: `curl -sI <preview-url>` returns a 302 to `cloudflareaccess.com`. **Verified 2026-09-25:** `bece9ffd-skillnet.barwy.workers.dev` → 302 to the Access team `fancy-surf-cca9.cloudflareaccess.com`. Production `skillnet.barwy.workers.dev` stays public (200).
- [ ] `[human]` GitHub branch protection / ruleset on `master`: require the status checks `ci` and `smoke`, and require a PR before merging.
  - _Why:_ Workers Builds deploys on **every push to `master`**, regardless of GitHub Actions results. This is the only thing that stops a red build shipping.
  - _Edge case:_ rulesets and branch protection on **private** repos need GitHub Pro/Team. If the repo is private on Free, the fallback is discipline: always merge through a PR after green CI. Note this as an accepted risk.
- [ ] `[agent]` Verify: open a PR with a deliberate lint error, confirm merge is blocked (or, on the fallback, that CI goes red), then close the PR.

## Phase 7 — Operations loop & docs sync ⬜

- [ ] `[approve]` **Rollback rehearsal.**
  - Run `npx wrangler versions list --json`, then `npx wrangler rollback <previous-id> --message "rehearsal"`.
  - Verify with the read-only smoke.
  - Roll forward with `npx wrangler rollback <latest-id> --message "rehearsal done"`.
  - _Note:_ the next push to `master` redeploys over any rollback, so after a real rollback also revert the commit.
- [ ] `[agent]` Update `context/foundation/tech-stack.md`: set `deployment_target: cloudflare-workers` and add a line saying auto-deploy is via Workers Builds.
- [ ] `[agent]` Update `context/foundation/infrastructure.md` → Operational Story: auto-deploy through Workers Builds (not a GitHub Actions deploy job), pinned `SESSION` KV, previews through `versions upload` behind Access, and the #15682 workaround. Add risk-register rows for Workers Builds deploying without CI gating and for the Supabase built-in SMTP limits.
- [ ] `[agent]` Update `CLAUDE.md`:
  - Remove "package.json still uses 10x-astro-starter" and "not a git repository".
  - Add a **Deploy** section: production URL, `SMOKE_READONLY=1` usage, rollback commands, and "Workers only — never `wrangler pages`, never `Astro.locals.runtime`; env via `astro:env/server`".
  - Add the no-PII-in-logs rule.
- [ ] `[agent]` Update the `README.md` deploy section to match.
- [ ] _(optional)_ `/10x-lesson` for any class of failure hit during this run.

**Runbook (lives in `CLAUDE.md` after Phase 7):**

- **Live errors:** `npx wrangler tail skillnet --format json --status error`
- **State:** `npx wrangler deployments status` · `npx wrangler versions list --json`
- **Rollback:** `npx wrangler rollback <id> --message "<reason>"`. It takes seconds and doesn't undo DB migrations, KV data or secrets.
- **Secret rotation:** `npx wrangler secret put <NAME>` (`[human]`). It deploys immediately, so treat it as a production change.
- **Deploy freeze:** once crisis mode exists, no merges to `master` while a crisis is active.

## Phase 8 — _(optional, later)_ Custom domain ⬜

When needed: the zone on Cloudflare DNS → Worker → Domains & Routes → **Custom Domain**. Then update the Supabase Site URL and redirect URLs, the `site` in `astro.config.mjs`, and the smoke `BASE_URL`, and decide whether `workers_dev` stays on.

---

## Critical files

- `wrangler.jsonc`: name, `SESSION` KV id, `workers_dev`, `preview_urls`, `limits`
- `package.json` and `package-lock.json`: name
- `astro.config.mjs`: `site`
- `scripts/smoke.mjs`: `SMOKE_READONLY` mode
- `.gitignore`: `wrangler-output.json`
- `CLAUDE.md`, `README.md`, `context/foundation/tech-stack.md`, `context/foundation/infrastructure.md`: docs sync
- `.github/workflows/ci.yml`: **unchanged** (deploy is Cloudflare's job)

## End-to-end verification

1. Locally, in Phase 2: lint, `astro check`, build and the `wrangler deploy --dry-run` bindings check are clean.
2. On production, in Phase 4: read-only smoke passes, manual signup → confirm → sign-in → dashboard → signout works, and `wrangler tail` shows no errors.
3. In the pipeline, in Phases 5 and 6: a push to `master` auto-deploys (the version source is Workers Builds), a PR gets a preview URL gated by Access, and red CI blocks the merge.
4. In operations, in Phase 7: the rollback-and-forward rehearsal succeeds with the smoke green after each step.

## Open items (not blocking this release)

- Custom SMTP provider for Supabase auth emails (needed before real users). Confirmed on 2026-09-25: the built-in limit blocked sign-up after a handful of attempts. Sending to arbitrary addresses needs a verified own domain, which `workers.dev` can't provide, so this is tied to Phase 8.
- Supabase Pro upgrade before the pilot (removes pausing and adds backups).
- A staging Supabase project, if previews ever need writable test data.
- Upgrade to wrangler ≥ 4.135 and Worker Previews once #15682 is resolved.

## Research sources (checked 2026-09-24)

- [Workers Builds overview](https://developers.cloudflare.com/workers/ci-cd/builds/) · [Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/) · [Build image / Node versions](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/)
- [Worker Previews (needs wrangler ≥ 4.135)](https://developers.cloudflare.com/workers/previews/)
- [workers-sdk #14284: KV auto-provision error 10014](https://github.com/cloudflare/workers-sdk/issues/14284) · [#14262](https://github.com/cloudflare/workers-sdk/issues/14262) · [astro #15802: SESSION binding injected](https://github.com/withastro/astro/issues/15802)
- [workers-sdk #15682: preview builds fail on WRANGLER_CI_MATCH_TAG (open)](https://github.com/cloudflare/workers-sdk/issues/15682)
- [workers-sdk #9045: workers.dev subdomain required](https://github.com/cloudflare/workers-sdk/issues/9045)
- [Supabase production checklist](https://supabase.com/docs/guides/deployment/going-into-prod) · [Supabase custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
