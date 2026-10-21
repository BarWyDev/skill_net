# Email delivery (S-16) Implementation Plan

## Overview

Give SkillNet its own sending domain (`auth.skillnet.org.pl`) on Resend, switch Supabase Auth to that SMTP and publish Polish templates, so a resident with any address can confirm an account on production. In the same change, make the confirmation link safe against link scanners: today the token is consumed by a GET, so Outlook Safe Links or a council's mail gateway can spend it before the resident clicks.

## Current State Analysis

- Production sign-up works and records consent (S-05), but Supabase's built-in sender delivers only to project-team addresses, about 2 emails an hour, in English, and refuses template edits (`change.md`).
- `src/pages/auth/confirm.ts:14` reads `token_hash` and `type` from the query string and calls `verifyOtp` on the GET. Any automated fetch of the link spends the single-use token. Supabase documents this ("email prefetching") and recommends a page that completes the action only on a user click (research.md §4.3).
- `supabase/templates/confirmation.html` already links to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`, and `supabase/config.toml:232` sets its Polish subject. Production never receives either: the hosted project is configured only through the Dashboard or the Management API, and `supabase config push` would also push local-only values (`site_url = "http://localhost:4321"`, `enable_confirmations = false`), so it is not an option.
- The app has no password-reset or magic-link flow (`resetPasswordForEmail` and `signInWithOtp` appear nowhere in `src/`), but the public GoTrue endpoints `/recover` and `/otp` can still send those emails, in English.
- `scripts/smoke.mjs:181-189` asserts that `GET /auth/confirm` without a token, and with a bogus one, both answer 302 → `/auth/link-wygasl`.
- Local Supabase runs with `enable_confirmations = false` (the smoke test depends on it), so the real email round trip is testable only on production.

## Desired End State

- `skillnet.org.pl` is registered with OVH by the owner's organisation, its zone is on Cloudflare, `kontakt@` and `dmarc@` forward through Cloudflare Email Routing, and `auth.skillnet.org.pl` is verified in Resend (eu-west-1) with SPF, DKIM and a DMARC `p=none` record.
- Production Supabase sends through `smtp.resend.com:465` as `SkillNet <no-reply@auth.skillnet.org.pl>`, with `rate_limit_email_sent = 30` (Supabase's default, while Resend is on the Free tier's 100 a day), the per-IP verify and sign-up limits raised to 300 per 5 minutes, and Polish confirmation, magic-link and recovery templates taken from the repo.
- A confirmation or magic link opens a SkillNet page with one "Potwierdzam" button. Only the button's POST verifies the token and lands the resident on `/profil`. A scanner's GET changes nothing.
- `npm run auth:email-config -- --dry-run` shows the difference between the repo and production without printing secrets. Without the flag, it applies it.
- A non-team address on Gmail, Outlook, wp.pl, o2.pl, interia.pl, onet.pl, iCloud and Proton receives the email from the own domain with `spf=pass dkim=pass dmarc=pass` and confirms the account end to end.

### Key Discoveries:

- `src/pages/koordynator/kryzys/[id]/kontakty.astro:50` is the repo's pattern for an Astro page that renders a form on GET and acts on POST in the same frontmatter. The new confirm page follows it.
- `src/pages/auth/link-wygasl.astro:8` sets `Cache-Control: private, no-store`; the lesson in `context/foundation/lessons.md` forbids `public` on any route behind the auth middleware.
- `.nvmrc` pins Node 22.22.3, which imports `.ts` natively, so a zero-dependency `.mjs` script can import a tested module from `src/lib/` (CLAUDE.md: relative imports and `import type` only).
- Management API field types (OpenAPI `UpdateAuthConfigBody`): `smtp_port` is a **string**, `rate_limit_email_sent` an integer ≥ 1. There is no field for Reply-To, custom headers or a plain-text body (research.md §4.2).
- Resend disables open and click tracking by default (research.md §2.3); it must stay off, because a rewritten link breaks the token.

## What We're NOT Doing

- Moving the Worker to a custom domain (Phase 8 of `deployment-plan.md`). Links in emails keep pointing at `skillnet.barwy.workers.dev`.
- A password-reset flow. The recovery email says the feature isn't available yet and carries no link.
- A 6-digit OTP code as a fallback to the link.
- A backup SMTP provider (Postmark). Rollback is the built-in SMTP, team addresses only.
- Moving to an EU-only provider. The owner is asking the council's DPO; until then Resend stays (research.md §6).
- Switching Resend to Pro, raising the limit to 300 and tightening DMARC to `quarantine` and then `reject`. Phase 4 records these as dated follow-ups in `infrastructure.md` because they belong to the pilot announcement and the weeks after it, not to this change.
- Resend webhooks for bounces and complaints.
- Cleaning up unconfirmed accounts created before this change. They can request a new link at `/auth/link-wygasl`.

## Implementation Approach

The ops track (Phase 1) and the code track (Phase 2) run in parallel, because DNS and Resend verification are the lead-time items and touch no code. Phase 3 pushes the configuration only after Phase 2 is merged and deployed: the magic-link template points at the new `type=magiclink` handling, and the push script ships in Phase 2. Phase 4 proves the whole path on production and closes the documentation.

## Critical Implementation Details

- **Order on production.** The new confirm page is backward compatible: it handles the existing `type=email` links too. So Phase 2 can deploy before Phase 3 without breaking the team accounts that still use the built-in sender. Phase 3 must not run before Phase 2 is live, or a magic-link email would land on a route that rejects `type=magiclink`.
- **The token must not leak from the confirm page.** The GET response carries the token hash in its URL and in a hidden form field. Load nothing from third parties on that page. Don't set a page-level `Referrer-Policy`: `withSecurityHeaders` (`src/middleware.ts:39`) runs after the page and overwrites it with `strict-origin-when-cross-origin`, which already sends only the origin to other sites.
- **Supabase sees the Worker, not the resident.** Sign-up, resend and `verifyOtp` all run on the server, and `createClient` (`src/lib/supabase.ts:10`) forwards no client IP. Supabase's per-IP limits (30 per 5 minutes on sign-up/resend and on `/verify`) therefore count Cloudflare's egress addresses, i.e. many residents at once. Phase 3 raises them to 300 per 5 minutes, and per-visitor protection stays with the app's `AUTH_IP_LIMITER`, keyed on `cf-connecting-ip` (`src/lib/auth-throttle.ts`).
- **Secrets.** `SUPABASE_ACCESS_TOKEN` (a personal access token) and `RESEND_SMTP_KEY` are read from the environment only. The dry run prints `smtp_pass: <set>` rather than the value, and nothing goes to `console.*` except field names and non-secret values. CLAUDE.md forbids logging personal data, and the script handles none.

## Phase 1: Domain, DNS and Resend

### Overview

The owner registers the domain and verifies the sending subdomain. All of it happens in dashboards. Use the records in research.md §4.1, with values copied from Resend's Records tab.

### Changes Required:

#### 1. Domain and zone

**File**: none (OVH, Cloudflare)

**Intent**: Register `skillnet.org.pl` with OVH in the organisation's name, add the zone to Cloudflare (Free) and delegate the nameservers from OVH.

**Contract**: The Cloudflare zone `skillnet.org.pl` shows "Active". Turn on DNSSEC in Cloudflare, then add the DS record at OVH.

#### 2. Contact addresses

**File**: none (Cloudflare Email Routing)

**Intent**: Forward `kontakt@` and `dmarc@` to the owner's private mailbox without exposing that address.

**Contract**: The `@` MX records point to `route1-3.mx.cloudflare.net`. There is exactly one SPF record on `@`: `v=spf1 include:_spf.mx.cloudflare.net ~all`.

#### 3. Sending domain in Resend

**File**: none (Resend, Cloudflare DNS)

**Intent**: Add `auth.skillnet.org.pl` in region eu-west-1, publish its DKIM TXT and its `send.auth` MX and TXT records (all "DNS only"), add `_dmarc` with `v=DMARC1; p=none; rua=mailto:dmarc@skillnet.org.pl; adkim=r; aspf=r; fo=1`, and create an API key with "Sending access" restricted to that domain.

**Contract**: Resend shows the domain "Verified". Open and click tracking stay off. Keep the API key in the owner's password manager only.

### Success Criteria:

#### Automated Verification:

- `dig +short TXT resend._domainkey.auth.skillnet.org.pl` returns the DKIM key
- `dig +short MX send.auth.skillnet.org.pl` returns the Resend feedback host
- `dig +short TXT _dmarc.skillnet.org.pl` returns the `p=none` record

#### Manual Verification:

- Resend shows `auth.skillnet.org.pl` as Verified, with tracking off
- A test email to `kontakt@skillnet.org.pl` reaches the private mailbox
- `skillnet.org.pl` is added to Google Postmaster Tools (TXT verification)

**Implementation Note**: This phase is done by the owner and can run while Phase 2 is in review.

---

## Phase 2: Scanner-safe confirm page, Polish templates and config script

### Overview

One PR. The confirm route becomes a page with a button, it accepts magic links, the three templates are written, and a script can push them with the SMTP settings to production.

### Changes Required:

#### 1. Link parameters

**File**: `src/lib/confirm-link.ts` (new), `src/lib/confirm-link.test.ts` (new)

**Intent**: One pure function validates `token_hash` and `type` from either the query string or the posted form, so the GET and the POST apply the same rules.

**Contract**: `parseConfirmParams(source: URLSearchParams | FormData): { tokenHash: string; type: "email" | "signup" | "magiclink" } | null`. It returns `null` for a missing or empty token, an unknown type, or a non-string value. Tests cover the three accepted types, `recovery` and `invite` (rejected), a missing hash and a `FormData` source.

#### 2. Confirm page

**File**: `src/pages/auth/confirm.astro` (new), replacing `src/pages/auth/confirm.ts` (deleted)

**Intent**: GET validates the parameters and renders an `AuthShell` page ("Potwierdź adres e-mail", one primary button "Potwierdzam") with a `POST` form back to `/auth/confirm` that carries the two values as hidden fields. GET never calls Supabase. POST parses the form, calls `verifyOtp` and redirects to `/profil` on success or to `/auth/link-wygasl` on any error. The copy says it in plain words: the resident clicks to finish setting up the account. For a magic link it says "Zaloguj się".

**Contract**: GET with invalid parameters → 302 `/auth/link-wygasl` (unchanged). GET with valid parameters → 200 HTML containing the form. POST valid → 302 `/profil`. POST invalid or rejected → 302 `/auth/link-wygasl`. Every response sends `Cache-Control: private, no-store`. Follow the GET/POST frontmatter pattern of `src/pages/koordynator/kryzys/[id]/kontakty.astro`, and keep the existing comment's point that a `token_hash` link works in any browser.

#### 3. Email templates

**File**: `supabase/templates/confirmation.html` (rewrite), `supabase/templates/magic_link.html` (new), `supabase/templates/recovery.html` (new)

**Intent**: The confirmation template becomes the table-based, inline-styled HTML from research.md §4.3, with the visible fallback URL and a footer naming `kontakt@skillnet.org.pl`. The magic-link template follows the same layout and links to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink`. The recovery template has no link: it says that password reset is not available in SkillNet yet, that the resident can write to `kontakt@skillnet.org.pl`, and that they can ignore the email if they didn't ask for it.

**Contract**: The only variables used are `{{ .SiteURL }}`, `{{ .TokenHash }}` and `{{ .Email }}`. Nothing uses `{{ .ConfirmationURL }}`, and there are no images or external CSS.

#### 4. Local config

**File**: `supabase/config.toml`

**Intent**: Register the two new templates next to the existing confirmation entry, so local Supabase and the push script read the same subjects and files.

**Contract**: Add `[auth.email.template.magic_link]` (subject `Twój link do logowania w SkillNet`) and `[auth.email.template.recovery]` (subject `Resetowanie hasła w SkillNet`), each with a `content_path`. Leave `[auth.rate_limit] email_sent` and the local SMTP settings unchanged.

#### 5. Config push script

**File**: `src/lib/auth-email-config.ts` (new), `src/lib/auth-email-config.test.ts` (new), `scripts/auth-email-config.mjs` (new), `package.json`

**Intent**: The repo becomes the source of truth for production's email settings. The module reads the `[auth.email.template.*]` sections from `config.toml`, builds the PATCH body from the templates and environment, and diffs it against the current production config. The script fetches the config, prints the diff, and applies it only without `--dry-run`. It has no dependencies, like `smoke.mjs`.

**Contract**:

- `readTemplateSections(toml: string): Record<"confirmation" | "magic_link" | "recovery", { subject: string; contentPath: string }>`: a minimal parser for those sections only. It throws when one is missing. `content_path` resolves from the project root, as the Supabase CLI does (`./supabase/templates/…`), not from the directory of `config.toml`.
- `buildAuthConfigPatch(input)` returns exactly: `smtp_host "smtp.resend.com"`, `smtp_port "465"` (string), `smtp_user "resend"`, `smtp_admin_email "no-reply@auth.skillnet.org.pl"`, `smtp_sender_name "SkillNet"`, `rate_limit_email_sent` (default 30, overridable with `--email-rate <n>` for the later Pro switch), `rate_limit_verify` 300, the per-IP sign-up/sign-in limit 300, and `mailer_subjects_*` / `mailer_templates_*_content` for the three templates. The Management API docs don't name the sign-up/sign-in field: before writing it, change that limit once in Dashboard → Authentication → Rate Limits and read back which key moved in `GET config/auth` (`rate_limit_otp` is the likely candidate).
- `smtp_pass` is added only with `--set-smtp-pass` (first run, key rotation), read from `RESEND_SMTP_KEY`. The diff never compares it, because the GET response can't show the real key.
- `diffAuthConfig(current, patch)` returns the changed keys, with template bodies shown as `<changed, N chars>` and `smtp_pass`, when sent, as `<set>`.
- The script needs `SUPABASE_PROJECT_REF` and `SUPABASE_ACCESS_TOKEN` (and `RESEND_SMTP_KEY` with `--set-smtp-pass`), exits non-zero when one is missing, and before applying writes the current config (without `smtp_pass`) to `$TMPDIR/auth-config-before-<timestamp>.json` for rollback.
- `--restore <snapshot.json>` PATCHes only the keys `buildAuthConfigPatch` manages (never `smtp_pass`), with their values from the snapshot. It shares the dry run and the confirmation, and a test checks that it ignores every other key in the snapshot.
- Add `"auth:email-config": "node scripts/auth-email-config.mjs"` to `package.json`. Tests cover the parser, the field types, the secret masking, a missing section and the restore key filter.

#### 6. Smoke test

**File**: `scripts/smoke.mjs`

**Intent**: Assert the new contract without a real token.

**Contract**: Keep "confirm without token redirects to link error". Change the bogus-token step to: GET answers 200 with `bodyIncludes: 'method="POST"'` and `cacheControlIncludes: "no-store"`. Add: POST `/auth/confirm` with `token_hash=smoke-not-a-token&type=email` → 302 `/auth/link-wygasl`. All three stay in the read-only steps, so they run against production too.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test:unit`
- Lint passes: `npm run lint`
- Type check passes: `npx astro check`
- Build passes: `npm run build`
- Smoke passes locally: `npm run smoke` against `npm run preview`
- CI `ci` and `smoke` jobs are green on the PR

#### Manual Verification:

- Locally, with `enable_confirmations` temporarily on (not committed): sign up, open the email in Mailpit (http://localhost:54324), and check that the link shows the button page, the button lands on `/profil`, and reloading the GET before clicking does not spend the token
- The confirm page reads well on a phone and in dark mode, and works without JavaScript
- The three templates render in Mailpit without broken layout

**Implementation Note**: After automated verification passes, pause for the owner's manual check, then merge. Workers Builds deploys the merge. Run `SMOKE_READONLY=1 BASE_URL=https://skillnet.barwy.workers.dev npm run smoke` after the deploy.

---

## Phase 3: Production auth configuration

### Overview

With Phase 1 verified and Phase 2 live, push the SMTP settings, the rate limit and the templates to production in one PATCH, through the script.

### Changes Required:

#### 1. Dry run and apply

**File**: none (production Supabase via `npm run auth:email-config`)

**Intent**: The owner exports the three variables in their own terminal, runs the dry run, reviews the diff, then applies it. This is a production change, so it needs explicit confirmation (CLAUDE.md).

**Contract**: After applying, `GET /v1/projects/{ref}/config/auth` shows `smtp_host = smtp.resend.com`, `smtp_port = "465"`, `rate_limit_email_sent = 30`, `rate_limit_verify = 300`, the sign-up/sign-in limit at 300, the three Polish subjects, `mailer_autoconfirm = false`, `site_url = https://skillnet.barwy.workers.dev` and `mailer_otp_exp = 3600`. The first apply runs with `--set-smtp-pass`. A second dry run, without that flag, reports no changes.

### Success Criteria:

#### Automated Verification:

- `npm run auth:email-config -- --dry-run` (without `--set-smtp-pass`) reports no pending changes after the apply

#### Manual Verification:

- The Supabase Dashboard → Authentication → SMTP Settings shows Resend and the sender `SkillNet <no-reply@auth.skillnet.org.pl>`
- The rollback snapshot exists in `$TMPDIR` and contains no `smtp_pass`
- Dashboard → Rate Limits shows 30 emails an hour and 300 per 5 minutes for verification and for sign-ups/sign-ins

---

## Phase 4: End-to-end proof on production and close-out

### Overview

Run the checklist from research.md §4.4 against production, then record the outcome and the follow-ups.

### Changes Required:

#### 1. End-to-end test

**File**: none

**Intent**: Prove that a non-team resident can confirm, on every mailbox provider that matters in Poland, with `npx wrangler tail skillnet --format json --status error` running.

**Contract**: The research.md §4.4 checklist, with the results (inbox or spam, delivery time, `spf`/`dkim`/`dmarc` results) recorded per provider in `context/changes/email-delivery/e2e-results.md`. Record no addresses, only the provider names.

#### 2. Documentation

**File**: `context/foundation/infrastructure.md`, `context/changes/deployment/deployment-plan.md`, `CLAUDE.md`

**Intent**: Record the domain, the DNS host, Resend, the sending address and the push script. Close the SMTP open items and the confirmation-email test in the deployment plan. Add dated follow-ups to the risk register.

**Contract**: The follow-ups in `infrastructure.md`:

- Resend Pro + `npm run auth:email-config -- --email-rate 300` before the pilot is announced (30/h on the Free tier caps how much of the 100-a-day quota a bot burst can use up).
- DMARC `quarantine` 2–4 weeks after Phase 3 if the `rua` reports show only passes, then `reject` 2–4 weeks later.
- The DPO's answer on EU-only data.
- A backup SMTP provider before crisis mode.

CLAUDE.md **Deploy** gains one bullet: email settings reach production only through `npm run auth:email-config`, never the Dashboard, and a run is a production change.

### Success Criteria:

#### Automated Verification:

- `SMOKE_READONLY=1 BASE_URL=https://skillnet.barwy.workers.dev npm run smoke` passes
- `npx prettier --check` passes on the changed Markdown

#### Manual Verification:

- Every checklist item in research.md §4.4 passes, or has a recorded, accepted exception (for example, landing in spam at one Polish provider, with the mitigation noted)
- mail-tester.com scores at least 9/10
- The first DMARC aggregate report arrives at `dmarc@` within 48 hours
- Five sign-ups and confirmations in a row, from different devices and networks within 5 minutes, all succeed without a rate-limit error

---

## Testing Strategy

### Unit Tests:

- `confirm-link.test.ts`: accepted and rejected types, missing or empty hash, `URLSearchParams` and `FormData` sources.
- `auth-email-config.test.ts`: section parsing (including a missing section), `smtp_port` as a string, rate-limit default (30) and override, `smtp_pass` only with `--set-smtp-pass`, secret masking in the diff, an empty diff when production already matches, and `--restore` ignoring unmanaged keys.

### Integration Tests:

- `scripts/smoke.mjs`: GET without a token gives 302, GET with a token gives 200 with the form, POST with a bogus token gives 302 to the link-error page. They run in CI and read-only against production.

### Manual Testing Steps:

1. Locally, with confirmations temporarily on: sign up, open the email in Mailpit, reload the link page twice, then click. The account confirms and `/profil` opens.
2. On production: run the full research.md §4.4 checklist with eight providers.
3. Outlook.com: wait 5 minutes before clicking, so any scanner has fetched the link. Confirmation still works.

## Performance Considerations

None. The confirm page adds one render and one form post per confirmation.

## Migration Notes

- No database migration.
- Accounts left unconfirmed by the built-in sender can request a new link at `/auth/link-wygasl` once Phase 3 is live. Old emails sent to team addresses still work, because the new page accepts `type=email`.
- Rollback: `npm run auth:email-config -- --restore <snapshot.json>` (dry run first), or, as a last resort, turn custom SMTP off in the Dashboard. Sign-up then works only for team addresses again, but nothing else breaks. Rolling back the Worker restores the old GET-verifying route. Its links stay compatible.

## References

- Research: `context/changes/email-delivery/research.md` (decisions in §7)
- Scope: `context/changes/email-delivery/change.md`
- GET/POST page pattern: `src/pages/koordynator/kryzys/[id]/kontakty.astro:50`
- Current confirm route: `src/pages/auth/confirm.ts:14`
- Smoke steps: `scripts/smoke.mjs:181-211`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Domain, DNS and Resend

#### Automated

- [ ] 1.1 `dig +short TXT resend._domainkey.auth.skillnet.org.pl` returns the DKIM key
- [ ] 1.2 `dig +short MX send.auth.skillnet.org.pl` returns the Resend feedback host
- [ ] 1.3 `dig +short TXT _dmarc.skillnet.org.pl` returns the `p=none` record

#### Manual

- [ ] 1.4 Resend shows `auth.skillnet.org.pl` as Verified, with tracking off
- [ ] 1.5 A test email to `kontakt@skillnet.org.pl` reaches the private mailbox
- [ ] 1.6 `skillnet.org.pl` is added to Google Postmaster Tools

### Phase 2: Scanner-safe confirm page, Polish templates and config script

#### Automated

- [ ] 2.1 Unit tests pass: `npm run test:unit`
- [ ] 2.2 Lint passes: `npm run lint`
- [ ] 2.3 Type check passes: `npx astro check`
- [ ] 2.4 Build passes: `npm run build`
- [ ] 2.5 Smoke passes locally against `npm run preview`
- [ ] 2.6 CI `ci` and `smoke` jobs are green on the PR

#### Manual

- [ ] 2.7 Local Mailpit round trip: button page, `/profil`, reload does not spend the token
- [ ] 2.8 Confirm page works on a phone, in dark mode and without JavaScript
- [ ] 2.9 The three templates render in Mailpit

### Phase 3: Production auth configuration

#### Automated

- [ ] 3.1 `npm run auth:email-config -- --dry-run` (without `--set-smtp-pass`) reports no pending changes after the apply

#### Manual

- [ ] 3.2 Dashboard SMTP Settings show Resend and the own-domain sender
- [ ] 3.3 Rollback snapshot exists and contains no `smtp_pass`
- [ ] 3.4 Dashboard Rate Limits show 30 emails/h and 300 per 5 min for verify and sign-up/sign-in

### Phase 4: End-to-end proof on production and close-out

#### Automated

- [ ] 4.1 Read-only smoke passes against production
- [ ] 4.2 `npx prettier --check` passes on the changed Markdown

#### Manual

- [ ] 4.3 research.md §4.4 checklist passes or has recorded exceptions
- [ ] 4.4 mail-tester.com scores at least 9/10
- [ ] 4.5 First DMARC aggregate report arrives within 48 hours
- [ ] 4.6 Five sign-ups in a row from different devices succeed without a rate-limit error
