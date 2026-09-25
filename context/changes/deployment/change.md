---
change_id: deployment
created_at: 2026-09-24
status: in-progress
plan: deployment-plan.md
---

# Change: first production deployment on Cloudflare Workers

This change takes SkillNet from local-only to a production Worker at `https://skillnet.<subdomain>.workers.dev`. It follows the platform decision in [`context/foundation/infrastructure.md`](../../foundation/infrastructure.md): Cloudflare Workers on the Paid plan, using Workers + static assets (not Pages).

Workers Builds auto-deploys `master`. GitHub Actions stays the CI gate (lint, check, build, smoke), enforced by branch protection. A single production Supabase project in `eu-central-1` backs it, and preview URLs sit behind Cloudflare Access.

Progress is tracked in [`deployment-plan.md`](deployment-plan.md) with a phase status table and per-step checkboxes.
