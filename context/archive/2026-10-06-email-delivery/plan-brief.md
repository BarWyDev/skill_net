# Email delivery (S-16) — Plan Brief

> Full plan: `context/changes/email-delivery/plan.md`
> Research: `context/changes/email-delivery/research.md`

## What & Why

Residents outside the project team can't confirm their accounts: Supabase's built-in sender reaches team addresses only, about 2 emails an hour, in English. That blocks the pilot. This change gives SkillNet its own sending domain on Resend, Polish auth emails, and a confirmation link that mail scanners can't spend before the resident clicks it.

## Starting Point

Sign-up and consent are live (S-05). `/auth/confirm` verifies the token on the GET, so any automated fetch of the link uses it up. The Polish confirmation template exists in the repo but has never reached production, and no own domain exists.

## Desired End State

A resident with any address (Gmail, Outlook, wp.pl, o2.pl, interia.pl, onet.pl, iCloud, Proton) gets a Polish email from `no-reply@auth.skillnet.org.pl` that passes SPF, DKIM and DMARC. The link opens a SkillNet page with one button, and the button confirms the account and opens `/profil`. Production's email settings come from the repo through one script.

## Key Decisions Made

| Decision             | Choice                                                                   | Why (1 sentence)                                                                 | Source      |
| -------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------- | ----------- |
| Domain               | `skillnet.org.pl` at OVH, organisation as registrant, DNS on Cloudflare  | `skillnet.pl` is taken; `.org.pl` fits a community project at 122 zł for 3 years | Research §7 |
| Sending provider     | Resend, eu-west-1, subdomain `auth.`                                     | Listed in Supabase's docs, tracking off by default, free tier covers setup       | Research    |
| Contact addresses    | Cloudflare Email Routing (`kontakt@`, `dmarc@`)                          | Free, and its records don't conflict with Resend's subdomain                     | Research    |
| App domain           | Stays on `workers.dev`                                                   | Keeps S-16 small; Phase 8 is separate                                            | Research §7 |
| Resend Pro           | Before the pilot is announced, not in this change                        | Free tier's 100/day is enough for setup and testing                              | Research §7 |
| Backup SMTP          | Later                                                                    | Rollback is the built-in sender (team only)                                      | Research §7 |
| EU-only data         | Owner asks the DPO; Resend meanwhile                                     | Switching later is DNS records plus one script run                               | Research §7 |
| Confirm page         | Button and POST, no auto-submit, no OTP code                             | No scanner can spend the token; works without JS                                 | Plan        |
| Reset and magic link | Magic link works through the same page; reset email has no link          | No email leads to a dead end, and no reset sign-in without a password page       | Plan        |
| Config push          | `npm run auth:email-config` with `--dry-run`, logic tested in `src/lib/` | Repo is the source of truth; the same script handles the Pro switch and rollback | Plan        |

## Scope

**In scope:** domain, DNS, Email Routing and Resend verification; the scanner-safe confirm page with `magiclink` support; three Polish templates; the config script and its tests; smoke updates; the production config push; E2E on eight providers; docs and dated follow-ups.

**Out of scope:** custom domain for the Worker, a password-reset flow, OTP codes, backup SMTP, an EU-only provider, Resend Pro and DMARC enforcement (recorded as follow-ups), bounce webhooks, cleanup of old unconfirmed accounts.

## Architecture / Approach

Ops and code run in parallel. The owner sets up the domain while the code PR is reviewed. The new `src/pages/auth/confirm.astro` validates the parameters on GET and renders a form, and only its POST calls `verifyOtp`. It accepts the old `type=email` links, so it can deploy before SMTP switches. `scripts/auth-email-config.mjs` reads the templates and subjects from `supabase/templates/` and `config.toml` and PATCHes the Management API. Its logic lives in a tested `src/lib/auth-email-config.ts`.

## Phases at a Glance

| Phase                              | What it delivers                                                              | Key risk                                                 |
| ---------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------- |
| 1. Domain, DNS and Resend          | Verified `auth.skillnet.org.pl`, forwarding contact addresses, DMARC `p=none` | NS delegation or verification takes up to 72 h           |
| 2. Confirm page, templates, script | One PR: button page, three templates, push script, smoke updates              | Smoke contract change for `/auth/confirm`                |
| 3. Production auth config          | SMTP, email limit 30/h, per-IP limits 300/5 min, templates live               | Production change; must follow Phase 2's deploy          |
| 4. E2E and close-out               | Eight-provider proof, docs, dated follow-ups                                  | Spam placement at Polish providers, measurable only here |

**Prerequisites:** the organisation's details for registration; a Supabase personal access token; Cloudflare and Resend accounts.
**Estimated effort:** about 2–3 sessions. Phase 2 is one PR; Phases 1, 3 and 4 are about a day of owner work, plus DNS waiting time.

## Open Risks & Assumptions

- Deliverability to wp.pl, o2.pl, onet.pl and interia.pl is unknown until Phase 4. A new domain may start in spam.
- Resend Free's 100 emails a day is fine for testing but not for launch day. The Pro switch is a follow-up tied to the announcement.
- Supabase's per-IP limits see the Worker's egress IP, not the resident's; Phase 3 raises them and the app's own throttle keeps per-visitor protection (plan review F1).
- The DPO may require EU-only data, which would mean swapping Resend.
- Resend DKIM and MX values come from its dashboard; research.md §4.1 shows typical ones only.

## Success Criteria (Summary)

- A non-team resident on any of the eight providers confirms an account on production, and the Polish email passes SPF, DKIM and DMARC.
- Fetching the link without clicking the button never spends the token.
- `npm run auth:email-config -- --dry-run` reports no difference between the repo and production.
