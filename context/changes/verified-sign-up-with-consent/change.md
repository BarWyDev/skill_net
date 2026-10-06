---
change_id: verified-sign-up-with-consent
title: Verified sign up with consent
status: impl_reviewed
created: 2026-10-06
updated: 2026-10-06
archived_at: null
---

## Notes

Closed on 2026-10-06 with email delivery split out to `context/changes/email-delivery/`.

- PR #59 merged (`a57da98`); the Worker deployed at 17:35 UTC; `20261006140000_signup_consent` pushed right after. Before and after the push: 0 active crises and 0 matchable residents, so nobody dropped out of matching.
- 5.1 (migration applied remotely) and 5.2 (read-only production smoke) passed on 2026-10-06.
- 5.3–5.5 (wrangler tail during a production sign-up, Polish email from the own domain, gated team accounts) need custom SMTP and moved to `email-delivery`. On the free plan with the default sender, Supabase refuses edits to the confirmation template, in the dashboard and through the Management API.
