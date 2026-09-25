---
change_id: deployment
created_at: 2026-09-24
status: done
closed_at: 2026-09-25
plan: deployment-plan.md
---

# Change: first production deployment on Cloudflare Workers

This change takes SkillNet from local-only to a production Worker at `https://skillnet.barwy.workers.dev`. It follows the platform decision in [`context/foundation/infrastructure.md`](../../foundation/infrastructure.md): Cloudflare Workers using Workers + static assets (not Pages). It shipped on the **Free** plan by the owner's choice; Paid is required before crisis mode.

Workers Builds auto-deploys `master`. GitHub Actions stays the CI gate (lint, check, build, smoke), meant to be enforced by a `master` ruleset (deferred at closure). A single production Supabase project in `eu-central-1` backs it, and preview URLs sit behind Cloudflare Access.

Progress is tracked in [`deployment-plan.md`](deployment-plan.md) with a phase status table and per-step checkboxes.
