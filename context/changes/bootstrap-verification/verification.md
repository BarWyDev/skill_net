---
bootstrapped_at: 2026-09-22T18:33:40Z
starter_id: 10x-astro-starter
starter_name: "10x Astro Starter (Astro + Supabase + Cloudflare)"
project_name: skillnet
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: "npm audit --json"
---

## Hand-off

Verbatim from `context/foundation/tech-stack.md`:

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: skillnet
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: true
  has_ai: false
  has_background_jobs: true
```

### Why this stack (verbatim from hand-off body)

SkillNet is a solo, after-hours build on a 12+ week budget: a dual-mode web app
where a council coordinator activates a crisis and gets residents ranked by
distance, skill match, and confirmed availability. The recommended default for
`(web, js)` was accepted as-is; it clears all four agent-friendly gates. Three
PRD priors drove that: auth with roles and verification (FR-001, FR-006,
FR-017) ships in the box via Supabase; the weighted ranking rule needs genuine
geospatial radius and distance queries, which Postgres provides through
PostGIS; and confirmations landing on the coordinator's operational list inside
a five-minute window suits Supabase Realtime. Two frictions were surfaced and
accepted rather than solved here. The SMS alert loop (FR-011) is an external
integration no starter in the registry carries. The crisis-mode fan-out fights
the edge runtime's long-task limits, so a queue or external worker is expected
work, not a freebie. Deployment is the starter default, Cloudflare Pages, with
EU data residency left as a deliberate setup decision given that resident phone
numbers and home locations are stored. CI is GitHub Actions with auto-deploy on
merge.

## Pre-scaffold verification

| Signal      | Value                                                          | Severity | Notes                                                                 |
| ----------- | -------------------------------------------------------------- | -------- | --------------------------------------------------------------------- |
| npm package | not run                                                         | n/a      | `cmd_template` starts with `git clone`; no npm CLI package to resolve  |
| GitHub repo | przeprogramowani/10x-astro-starter last pushed 2026-09-12       | fresh    | from `card.docs_url`; 10 days before run. Not archived; branch `master` |

**Registry data discrepancy (observed, not acted on)**: the registry card records
`stars: 50000` for this starter; the live repo reports **97**. This did not affect
the selection (star count is not one of the four agent-friendly gates, and the
`popular_in_training` gate holds via the underlying Astro / React / TypeScript /
Supabase ecosystem rather than this composition repo). Recorded here because the
registry is the source of truth for downstream recommendations and this value
appears to be wrong rather than merely stale.

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone
**Exit code**: 0
**Files moved**: 21 top-level entries (95 files excluding `node_modules`)
**Conflicts (.scaffold siblings)**: `CLAUDE.md.scaffold`
**.gitignore handling**: moved silently (no `.gitignore` existed in cwd)
**.bootstrap-scaffold cleanup**: deleted (no leftovers; `rmdir` succeeded on an empty directory)
**Cloned `.git/` removed before move-up**: yes — upstream starter history not inherited

### Entries moved

`.env.example`, `.github`, `.gitignore`, `.husky`, `.nvmrc`, `.prettierrc.json`,
`.vscode`, `AGENTS.md`, `README.md`, `astro.config.mjs`, `components.json`,
`eslint.config.js`, `node_modules`, `package-lock.json`, `package.json`, `public`,
`scripts`, `src`, `supabase`, `tsconfig.json`, `wrangler.jsonc`

### Conflict resolution detail

`CLAUDE.md` existed in cwd (the 10xDevs lesson router). Per the conflict matrix,
existing wins: the cwd copy is untouched and the starter's version landed as
`CLAUDE.md.scaffold`. Both files are root-level and the starter's copy carries
its own agent conventions — review and merge by hand.

`context/` was not present in the scaffold, so the always-preserve rule had
nothing to drop. The cwd `context/` tree is untouched.

### Toolchain mismatch (non-fatal, surfaced during install)

`npm install` emitted `EBADENGINE` warnings for `astro-eslint-parser@3.1.0` and
`eslint-plugin-astro@3.1.0`, which require `^22.22.3 || ^24.16.0 || >=26.3.0`.
The local runtime is **node v25.9.0**, which falls in a gap between those ranges.
The starter pins **22.14.0** in `.nvmrc`, and the registry card's
`toolchain.runtime_version` is `node 22`. Install completed with exit code 0 and
all 656 packages added, but linting may misbehave until the runtime matches the
pin. Fix: `nvm use` in the project root.

## Post-scaffold audit

**Tool**: `npm audit --json`
**Summary**: 0 CRITICAL, 0 HIGH, 0 MODERATE, 0 LOW (0 INFO, 0 total)
**Direct vs transitive**: no findings, so the distinction does not apply
**Dependency tree**: 804 total — 377 prod, 269 dev, 167 optional, 0 peer

Clean tree. `vulnerabilities` object in the audit report is empty.

#### CRITICAL findings

None.

#### HIGH findings

None.

#### MODERATE findings

None.

#### LOW / INFO findings

None.

## Hints recorded but not acted on

| Hint                    | Value               |
| ----------------------- | ------------------- |
| bootstrapper_confidence | first-class         |
| quality_override        | false               |
| path_taken              | standard            |
| self_check_answers      | null                |
| team_size               | solo                |
| deployment_target       | cloudflare-pages    |
| ci_provider             | github-actions      |
| ci_default_flow         | auto-deploy-on-merge |
| has_auth                | true                |
| has_payments            | false               |
| has_realtime            | true                |
| has_ai                  | false               |
| has_background_jobs     | true                |

v1 surfaces these but takes no action on them. No CI workflow files were written
from `ci_provider` / `ci_default_flow`, no deployment configuration was derived
from `deployment_target` beyond whatever the starter ships (`wrangler.jsonc` came
from the starter, not from this hint), and the `has_*` flags did not modify the
scaffold.

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now,
your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history. This
  directory has no git repo; the cloned starter history was deliberately removed.
- `nvm use` to match the starter's pinned node 22.14.0 and clear the EBADENGINE
  warnings recorded above.
- Review `CLAUDE.md.scaffold` against the existing `CLAUDE.md` and decide which
  parts of each to keep. The starter also shipped its own `AGENTS.md`, which moved
  in without conflict.
- Address audit findings per your project's risk tolerance — none were found in
  this run.
