---
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
---

## Why this stack

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
