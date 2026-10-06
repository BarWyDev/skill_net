---
change_id: email-delivery
title: Own sending domain, custom SMTP and Polish auth emails
status: new
created: 2026-10-06
updated: 2026-10-06
archived_at: null
---

## Notes

Split out of `verified-sign-up-with-consent` (roadmap S-05) on 2026-10-06. S-05's code and migration are live on production; only email delivery is left, and it **blocks the pilot**: Supabase's built-in sender delivers about 2 emails an hour, to team addresses only, so residents outside the team can't confirm their accounts.

Scope (the former S-05 Phase 5 §2–§3 and its manual checks 5.3–5.5):

- Register an own domain and add it to Resend or Postmark; publish SPF, DKIM and DMARC. The Worker may stay on `workers.dev`; only the sending domain is needed.
- Supabase → Authentication → SMTP Settings: the provider's credentials and a sender like `no-reply@<domain>`. Raise the auth email rate limit from the built-in one.
- Polish confirmation email: the subject `Potwierdź adres e-mail w SkillNet` and the body from `supabase/templates/confirmation.html`. On the free plan with the default sender, Supabase refuses template edits, in the dashboard and in the Management API (`PATCH /v1/projects/{ref}/config/auth` → 400, tried 2026-10-06), so this comes after SMTP. It is one PATCH of `mailer_subjects_confirmation` and `mailer_templates_confirmation_content`. Site URL and the redirect allowlist on production are already correct.
- End-to-end on production with `npx wrangler tail skillnet --format json --status error` running: sign up with a non-team address; the Polish email arrives from the own domain; the link goes through `/auth/confirm` to `/profil`; the account has a `signup` consent row; an existing team account is gated to `/zgoda` and can accept.
- Record the domain and provider in `context/foundation/infrastructure.md`; close the SMTP open items in `context/changes/deployment/deployment-plan.md`.

Until this lands, production sign-up works and records consent, but confirmation emails are English, go to team addresses only, and their link lands on the site root instead of `/profil`.

Separate, also before the pilot: legal review of `/prywatnosc` and naming the data controller there (S-05 left a visible draft notice).
