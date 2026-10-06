<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Verified Sign-up with Consent

- **Plan**: context/changes/verified-sign-up-with-consent/plan.md
- **Scope**: Phases 1–4 of 5 (Phase 5 is the human production rollout)
- **Date**: 2026-10-06
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Evidence: `npm run test:db` 377/377 (11 suites), `npm run test:unit` 23/23, `npm run lint` and `npx astro check` clean, `npm run smoke` all steps pass locally; build passed at each phase. All manual rows for phases 1–4 were confirmed by the owner.

Every contract item in phases 1–4 matches the plan. Harmless differences: the migration is `20261006140000_signup_consent.sql`, seeding version `2026-10-06` (the plan said `20261007120000` and "e.g. 2026-10-07"). Three adaptations are documented: the sign-in resend prefill is carried in sessionStorage; the "/zgoda with nothing to accept" redirect is in middleware; resend ignores every GoTrue error. Files outside the plan, all needed or harmless: `supabase/seed.sql` (required: seed residents are email-provider users), `DeleteAccount.astro` (`returnTo` prop), `PasswordToggle.tsx` (Polish aria labels).

## Findings

### F1 — Admin-created users are not exempt from the consent trigger

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: supabase/migrations/20261006140000_signup_consent.sql:62 (plan.md:54)
- **Detail**: The plan says "direct inserts (fixtures, admin) are exempt". The trigger exempts only rows whose `raw_app_meta_data.provider` is not `email`. Studio's "Add user", `auth.admin.createUser` and `inviteUserByEmail` all create email-provider users, so after the push they fail with `consent_required` unless `user_metadata.consent_version` is passed. The migration comment (L11-13) says this; the plan, Phase 5 and CLAUDE.md don't. GoTrue inserts every account as `supabase_auth_admin`, so the trigger has no reliable way to tell an admin-created account from a public sign-up.
- **Fix A ⭐ Recommended**: Accept the behaviour and document it: fix plan.md:54 and add a note to Phase 5 and to CLAUDE.md's Deploy section (pass `consent_version` in user metadata when creating accounts by admin).
  - Strength: Keeps the database guarantee ("no email account without consent") strict, which is what the pgTAP suite and the migration header already assert.
  - Tradeoff: Creating a test or coordinator account in Studio needs one extra metadata field.
  - Confidence: HIGH — the behaviour is already tested and documented in the migration.
  - Blind spot: Haven't checked whether Studio's "Add user" dialog accepts user metadata; the admin API does.
- **Fix B**: Exempt admin-created rows in the trigger, for example rows with `invited_at` set, or with a marker in app metadata.
  - Strength: The plan's original wording holds and the dashboard workflow is unchanged.
  - Tradeoff: Any discriminator is a GoTrue implementation detail, and a wrong one opens a bypass of the consent rule through the public sign-up.
  - Confidence: LOW — there is no stable, documented field that separates admin creation from sign-up.
  - Blind spot: GoTrue version differences between local and hosted.
- **Decision**: FIXED (Fix A): documented in plan.md (Implementation Approach, Phase 5 §2) and CLAUDE.md Deploy

### F2 — Pushing the migration drops every existing resident from matching until they re-consent

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261006140000_signup_consent.sql:144
- **Detail**: The plan intends this (no backfill), but the Phase 5 rollout steps don't say that from the moment of `db push` until residents accept on `/zgoda`, new crisis activations and the density map exclude every existing resident. A push during an active crisis would empty any re-activation.
- **Fix**: Add to Phase 5 §1: "Push only when no crisis is active; count matchable residents before and after the push and note the drop."
- **Decision**: FIXED: Phase 5 §1 now requires no active crisis and a before/after matchable count

### F3 — pgTAP never inserts as supabase_auth_admin

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/tests/signup_consent_test.sql:43-90
- **Detail**: The GoTrue-shaped inserts run as `postgres`. The plan's "Trigger safety" section names the `supabase_auth_admin` path as the one that breaks every sign-up if wrong; only the local smoke step "signup creates account" exercises it through real GoTrue.
- **Fix**: Add one case under `set local role supabase_auth_admin` that inserts a valid email sign-up and asserts that its `signup` consent row exists.
- **Decision**: FIXED (differently): set role supabase_auth_admin is reserved for superusers, so pgTAP can't run as GoTrue's role. Added structural checks instead (trigger wiring and enabled, empty search_path, definer can insert); suite now 39 tests, test:db 380/380

### F4 — Resend: timing difference and unauthenticated email trigger

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/auth/resend.ts:19-24
- **Detail**: The redirect is identical for every address, but GoTrue sends mail synchronously only for registered, unconfirmed addresses, so response latency can tell them apart. The endpoint also lets anyone spend the project's email quota, throttled only by GoTrue's per-address cooldown and the global email rate limit.
- **Fix**: Accept as risk for the MVP; revisit with Turnstile or a per-IP limit once custom SMTP is live.
- **Decision**: ACCEPTED: MVP risk; revisit with Turnstile or a per-IP limit once custom SMTP is live

### F5 — /api/zgoda has no user guard and appends duplicate consent rows

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/zgoda.ts:9-26
- **Detail**: Unlike `src/pages/api/profile.ts:9`, the endpoint doesn't check `context.locals.user` itself; it relies on `PROTECTED_ROUTES`, and the RPC raises `not_authenticated` anyway, so it is safe. A consented user who POSTs directly appends another `reaccept` row.
- **Fix**: Add the `locals.user` guard (→ `/auth/signin`) and redirect to `/` without calling the RPC when `!locals.needsConsent`.
- **Decision**: FIXED: locals.user guard and needsConsent short-circuit in api/zgoda.ts; smoke step 'consent accept skips consented user'

### F6 — Sign-in email stays in sessionStorage after a successful sign-in

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/auth/SignInForm.tsx:60-64
- **Detail**: The address is stored on every valid submit and removed only when the sign-in page loads again. After a successful sign-in it stays in tab-scoped storage until the tab closes. It is the user's own address in their own tab, so exposure is minimal.
- **Fix**: Remove the key on the next page load anywhere, for example with a tiny inline script in Layout, or accept as is.
- **Decision**: FIXED: Layout.astro removes the key on every page except /auth/signin (which reads then removes it); verified in the browser
