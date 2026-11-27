# Interface Language Switch Implementation Plan

## Overview

Roadmap S-18, FR-021. A visitor can use the public pages and the sign-in and sign-up flow in Polish, English or Ukrainian, at the same addresses. The language comes from a cookie the visitor set, otherwise from the browser. This change also builds what S-19, S-20 and S-21 reuse: the language resolution on the server, the message catalogues, and the switch that says which languages an environment offers.

## Current State Analysis

- All copy is Polish and hardcoded: about 600 lines in 73 files. `src/layouts/Layout.astro:29` hardcodes `<html lang="pl">`.
- The server produces user-facing text in several places, not only in pages: `src/lib/auth-errors.ts` (Supabase error codes to Polish sentences), `src/lib/password.ts` (password rule messages), `src/lib/consent.ts` (consent label), and the auth endpoints `src/pages/api/auth/{signin,signup,resend}.ts`, which put a finished Polish sentence into the `skillnet_flash` cookie (`src/lib/flash.ts`).
- React islands hold their own copy: `SignInForm.tsx`, `SignUpForm.tsx` (including a Polish plural function, `charactersWord`), `FormField.tsx`, `PasswordToggle.tsx`, `SubmitButton.tsx`, `DensityMap.tsx`.
- The public map shows skill category names read from the database (`skill_categories.name_pl` through `getTaxonomy`, `src/lib/services/profile.ts:30`).
- `src/middleware.ts` fills `Astro.locals` (`user`, `isCoordinator`, `needsConsent`) on every request. `/api/mapa` skips the auth lookup and is the only response cached as `public`.
- Fonts: `@fontsource/big-shoulders-display` and `@fontsource/atkinson-hyperlegible-next` ship `latin` and `latin-ext` only. Neither has Cyrillic.
- `scripts/smoke.mjs` asserts 16 Polish strings (for example "Brak dostępu") and sends no language header of its own; Node's `fetch` sends `Accept-Language: *`.
- `wrangler.jsonc` has no `vars`. Previews do not inherit bindings or variables from the top level (`context/foundation/infrastructure.md`).
- Unit tests run on `node:test` with no build step, so tested modules use relative imports only.

## Desired End State

On an environment that offers all three languages:

- The header shows `PL · EN · UA`. Choosing one reloads the same page in that language and the choice holds for a year.
- A first visit with no choice follows the browser: Polish, English or Ukrainian when the browser prefers one of them; English for any other language; Polish when the request names no language.
- `https://<host>/<any page>?lang=uk` opens that page in Ukrainian and remembers it.
- The landing page, `/mapa`, `/auth/*`, the 404 page, `/brak-dostepu` and the header and footer on every page are fully translated, including page titles, descriptions, server error messages and island copy. `<html lang>` matches.
- The sign-up form shows the consent in the chosen language with the Polish original below it, marked as the binding text.
- Ukrainian text renders in the added Cyrillic fonts, not a system font.

On an environment that offers only Polish (production until S-19 is done), nothing visible changes: no switcher, Polish everywhere, `?lang=` is stripped and ignored.

Verify with `npm run test:unit`, `npm run smoke` and the manual steps in Phase 4.

### Key Discoveries:

- The sign-up form renders the consent label (`src/components/auth/SignUpForm.tsx:9`), so the courtesy translation of the consent is in this slice, not only in S-19.
- The map's category filter needs six translated category names now; skills, crisis types and team templates wait for S-19 and S-20.
- The flash cookie carries finished text, so the endpoints must know the language when they build the message (`src/lib/flash.ts:42`).
- Node's `fetch` sends `Accept-Language: *`. Treating `*` and a missing header as "no preference" keeps the smoke test on Polish with no change to its existing assertions.
- `/api/mapa` is cached as `public` (`src/pages/api/mapa.ts:9`). Its responses must stay the same in every language.
- A missing key in a translation must be a type error, because S-20 puts crisis-path text into the same catalogues.

## What We're NOT Doing

- No translation of `/profil`, `/kursy`, `/zgoda`, `/prywatnosc` (S-19) or of `/koordynator/**` (S-20). Their pages stay Polish under a translated header.
- No names for skills, crisis types or team templates, and no database migration. Only the six category names, from a catalogue keyed by slug.
- No emails in the chosen language and no storing of the language on the account (S-21). The choice lives in the cookie only.
- No `/en/` or `/uk/` address prefixes and no `hreflang` alternates; search engines see Polish.
- No switch to English or Ukrainian on production in this change. Production offers Polish only until S-19 is done; Ukrainian also waits for a native reader (Open Roadmap Question 13).
- No translation of the configuration banner (`src/lib/config-status.ts`); it is for developers.
- No change to the privacy notice. It does not list cookies today; whether to list the language cookie is decided with S-19, which translates that page.
- No per-language share image. `og-image.png` is one generated picture with Polish words; only its alt text is translated.
- No change to error codes, redirect targets or the `powrot` parameter.

## Implementation Approach

One small module decides the language from three inputs (cookie, `Accept-Language`, the environment's enabled list) and the middleware puts the result on `Astro.locals`. Copy moves into typed catalogues, one file per area, with Polish as the shape every other language must match. Astro pages and endpoints read the catalogue for `Astro.locals.locale`; islands get `locale` as a prop and import only their own area. Text is moved area by area, so every phase leaves the app working and Polish output byte-for-byte the same.

The translations into English and Ukrainian are written by the implementer. The Ukrainian text is marked for review by a native reader before it is enabled on production.

## Critical Implementation Details

- **Language resolution order.** Cookie first, when its value is an enabled language. Otherwise walk `Accept-Language` by descending quality and take the first entry whose primary subtag is an enabled language. Entries with `q=0` are dropped (they mean "never this language"), and entries with equal quality keep the header's order. If the header is missing, empty or only `*`: Polish. If the header names languages but none is supported: English when enabled, otherwise Polish. So `ru, pl;q=0.5` gives Polish, `de` gives English, `uk-UA` gives Ukrainian, and `en` on a Polish-only environment gives Polish.
- **`?lang=` runs before the auth lookup and never on `/api/`.** On a GET or HEAD of a page, a `lang` parameter is always removed with a 303 to the same address without it; the cookie is set only when the value is an enabled language. The redirect target is the absolute URL built from the request's own URL object with only `lang` deleted, never a path string: a request to `//evil.example?lang=en` has the path `//evil.example`, which a browser reads as another host when it arrives as a relative `Location` (the class fixed in `return-path.ts`, security audit F-01). Keeping it off `/api/` leaves `/api/mapa` cacheable and identical in every language.
- **The enabled list fails closed.** An unset or unparsable `ENABLED_LOCALES` means Polish only; Polish can never be switched off. A misconfigured production then shows less, never unreviewed Ukrainian.
- **Cyrillic fonts load as subsets behind the current fonts.** Import only the `cyrillic` subset files of the added families and list them after the existing family in each font stack. Their `unicode-range` means a browser downloads them only for a page with Cyrillic text, and Latin text keeps its current look.
- **Polish output must not change.** The smoke test asserts Polish strings; moving a string into a catalogue must keep it identical, including punctuation and non-breaking characters.

## Phase 1: Language foundation

### Overview

The server knows the language of every request, the header offers the switch, and the header and footer are translated. Page content is still Polish.

### Changes Required:

#### 1. Language resolution

**File**: `src/lib/i18n/locale.ts` (new), `src/lib/i18n/locale.test.ts` (new)

**Intent**: The single place that names the supported languages and decides which one a request gets. Pure functions, relative imports only, so `node:test` loads it.

**Contract**: Exports `LOCALES = ["pl", "en", "uk"]`, the `Locale` type, `DEFAULT_LOCALE = "pl"`, `LOCALE_COOKIE = "skillnet_lang"`, `LANG_PARAM = "lang"`, `parseEnabledLocales(raw: string | undefined): Locale[]` (comma-separated, unknown entries ignored, always contains `pl`) and `resolveLocale({ cookie, acceptLanguage, enabled }): Locale`, following the order in Critical Implementation Details. Also `isLocale(value): value is Locale`.

#### 2. Message catalogues

**File**: `src/lib/i18n/messages/common.ts` (new), `src/lib/i18n/format.ts` (new), `src/lib/i18n/catalogues.test.ts` (new)

**Intent**: Typed catalogues, one file per area, starting with `common` (header, footer, switcher, default page title and description, share-image alt text). A small formatter fills `{name}` placeholders and picks plural forms.

**Contract**: Each area file exports one object per language; `en` and `uk` are typed as the shape of `pl`, so a missing or extra key fails `astro check`. `format(template, values)` replaces `{name}` placeholders. `plural(locale, count, forms)` picks by `Intl.PluralRules` (`one`, `few`, `many`, `other`). The test walks every catalogue file and fails on an empty string or on a placeholder set that differs between languages. Relative imports only.

#### 3. Environment switch

**File**: `astro.config.mjs`, `wrangler.jsonc`, `.env.example`

**Intent**: Each environment declares which languages it offers.

**Contract**: `ENABLED_LOCALES` in the `env.schema` as an optional public server string. In `wrangler.jsonc`: top level (production) `"pl"`, `env.staging` and `previews` `"pl,en,uk"` (the installed Wrangler's config schema lists `vars` under `previews`). `.env.example` documents `ENABLED_LOCALES=pl,en,uk` for local `.env` and `.dev.vars`.

#### 4. Middleware

**File**: `src/middleware.ts`, `src/env.d.ts`

**Intent**: Resolve the language once per request and handle the `?lang=` link.

**Contract**: `App.Locals` gains `locale: Locale` and `enabledLocales: Locale[]`, set for every request including the `/api/mapa` early return. The `?lang=` handling follows Critical Implementation Details, with the building of the redirect target in a pure function in `src/lib/i18n/locale.ts` so a unit test covers a path that starts with `//`; the cookie is `httpOnly`, `sameSite: "lax"`, `secure` on HTTPS, `path: "/"`, one year. Protected-route redirects, the consent gate and the coordinator check are unchanged.

#### 5. Layout, header, footer, switcher

**File**: `src/layouts/Layout.astro`, `src/components/SiteHeader.astro`, `src/components/LanguageSwitch.astro` (new)

**Intent**: `<html lang>` follows the request, the default title, description and share-image alt come from `common`, and the header and footer links are translated. The switcher shows `PL · EN · UA`.

**Contract**: The switcher renders only when more than one language is enabled, and only the enabled ones. Each item is a link to the current path and query with `lang=<code>`, carries `lang` and `hreflang` for its language and the full native name (Polski, English, Українська) as its accessible name; the current language is marked with `aria-current="true"` and is not a link. Touch targets keep the header's 44 px minimum. `og:locale` is added. The header must still fit a 360 px wide screen for a signed-in coordinator (six items plus the switcher).

#### 6. Cyrillic fonts

**File**: `package.json`, `src/styles/global.css`

**Intent**: Ukrainian headings and body text render in chosen fonts.

**Contract**: Add `@fontsource/oswald` (weight 700, for the display stack) and `@fontsource/noto-sans` (400 and 700, for the body stack), importing the `cyrillic` subset files only, and place each family after the existing one in `font-display` and `--font-body`. If the installed packages' newer releases already include a Cyrillic subset for the current families, use that instead and add nothing.

### Success Criteria:

#### Automated Verification:

- Unit tests pass, including the resolution table and the catalogue check: `npm run test:unit`
- Type check passes: `npx astro sync && npx astro check`
- Lint passes: `npm run lint`
- Build passes: `npm run build`
- Smoke passes unchanged against a local server: `npm run smoke`

#### Manual Verification:

- With `ENABLED_LOCALES=pl,en,uk`, the switcher changes the header and footer language on `/`, `/mapa` and `/profil`, and the choice survives a browser restart
- With `ENABLED_LOCALES` unset, there is no switcher and `/?lang=en` lands on `/` in Polish
- `/profil?lang=uk` while signed out ends on the sign-in page with the header in Ukrainian and the return path kept
- The header fits a 360 px screen for a signed-in coordinator in all three languages
- Ukrainian header text renders in the added fonts; the network panel shows no Cyrillic font file on a Polish page

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Public pages and map

### Overview

The landing page, the public map and the error pages are translated.

### Changes Required:

#### 1. Landing page

**File**: `src/components/Landing.astro`, `src/pages/index.astro`, `src/lib/i18n/messages/landing.ts` (new)

**Intent**: Move the landing copy and the "account deleted" notice into a catalogue and render the request's language.

**Contract**: No markup or class changes beyond replacing literal text. Sentences that embed a link are split into parts in the catalogue, never concatenated around a translated fragment in the template.

#### 2. Public map

**File**: `src/pages/mapa.astro`, `src/components/map/DensityMap.tsx`, `src/lib/i18n/messages/map.ts` (new), `src/lib/i18n/messages/taxonomy.ts` (new)

**Intent**: Translate the page, the island (legend, filter, postcode jump, empty and error states, zoom control labels) and the six category names.

**Contract**: `DensityMap` takes a `locale` prop. `taxonomy.ts` maps category slug to name per language; a slug missing from the catalogue falls back to the database's Polish name, so a category added by migration never shows blank. `/api/mapa` and `/api/kody-pocztowe` are not touched: the island already maps the HTTP status to its own message and never displays text from an API response (`DensityMap.tsx:119`), so only the island's own messages are translated. The Polish `error` strings in those JSON responses stay as they are.

#### 3. Error pages

**File**: `src/pages/404.astro`, `src/pages/brak-dostepu.astro`, `src/pages/auth/zbyt-wiele-prob.astro`, `src/components/PageShell.astro`, `src/lib/i18n/messages/errors.ts` (new)

**Intent**: Translate the three error pages and any literal text in the shell they share.

**Contract**: Status codes, `Cache-Control` and the `Retry-After` header are unchanged. The Polish headings "Brak dostępu" and "Zbyt wiele prób" stay exactly as the smoke test asserts them.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test:unit`
- Type check passes: `npx astro sync && npx astro check`
- Lint passes: `npm run lint`
- Smoke passes unchanged: `npm run smoke`
- Only `/api/mapa` sends a public cache header: `grep -rn "public, max-age" src` shows that file alone

#### Manual Verification:

- `/`, `/mapa`, a missing address and `/koordynator` as a resident read fully in English and in Ukrainian, with no Polish left on the page body
- On `/mapa` the category filter, the legend, the postcode jump (valid, unknown and malformed code) and the empty state are translated
- Page titles and descriptions in the browser tab and page source match the language
- Polish pages look and read exactly as before

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Sign-in and sign-up

### Overview

The whole account flow is translated, including the messages the server produces.

### Changes Required:

#### 1. Server-side messages

**File**: `src/lib/auth-errors.ts`, `src/lib/password.ts`, `src/lib/services/account.ts`, `src/lib/i18n/messages/auth.ts` (new), their `*.test.ts` files

**Intent**: The functions that return user-facing sentences take the language and read the `auth` catalogue.

**Contract**: `authErrorMessage(code, locale)` and `passwordProblem(password, locale)` become per-language lookups, and the Polish constants exported by `password.ts` are replaced by catalogue reads. `consent.ts` keeps its Polish exports exactly as they are (`CONSENT_LABEL` is the binding text, and `src/pages/zgoda.astro`, an S-19 page, imports it and stays untouched); the translations of the consent label, link text and required-message are added beside them in the `auth` catalogue. `src/lib/services/account.ts` also calls `authErrorMessage`: it gains a `locale` argument that its caller on `/profil` (S-19) passes as `"pl"` for now. Error codes and the fallback-to-generic rule are unchanged. `CURRENT_CONSENT_VERSION` is untouched. Existing tests keep asserting the Polish text and gain one case per added language.

#### 2. Auth endpoints

**File**: `src/pages/api/auth/signin.ts`, `src/pages/api/auth/signup.ts`, `src/pages/api/auth/resend.ts`

**Intent**: Build the flash message in the request's language.

**Contract**: Each endpoint reads `context.locals.locale`. Redirect targets and status codes are unchanged, so the smoke assertions hold. `unregister.ts` and `signout.ts` are not touched (the first belongs to `/profil`, S-19; the second shows no text).

#### 3. Forms and pages

**File**: `src/components/auth/{SignInForm,SignUpForm,FormField,PasswordToggle,SubmitButton,ServerError,FieldError}.tsx`, `src/components/auth/{AuthShell,Turnstile}.astro`, `src/pages/auth/{signin,signup,confirm-email,confirm,link-wygasl}.astro`

**Intent**: Translate the forms, their client-side validation messages and the confirmation pages.

**Contract**: Each form island takes a `locale` prop. `charactersWord` is replaced by `plural`. Turnstile's `data-language` follows the request (`pl`, `en`, `uk`). Session-storage keys and form field names are unchanged.

#### 4. Consent on the sign-up form

**File**: `src/components/auth/SignUpForm.tsx`, `src/lib/i18n/messages/auth.ts`

**Intent**: In English and Ukrainian the checkbox label is the translation; below it, in smaller text and marked `lang="pl"`, the Polish original with one sentence saying the Polish text is the binding one.

**Contract**: In Polish the form is unchanged. The submitted field, the recorded `consent_version` and the endpoint check are unchanged. The original is associated with the checkbox through `aria-describedby`.

### Success Criteria:

#### Automated Verification:

- Unit tests pass, with per-language cases for auth errors and password messages: `npm run test:unit`
- Type check passes: `npx astro sync && npx astro check`
- Lint passes: `npm run lint`
- Smoke passes unchanged, including the full sign-up and sign-in walk: `npm run smoke`

#### Manual Verification:

- In English and in Ukrainian: sign up with a weak password, mismatched passwords and no consent, and see each message in that language, both from the form and (with JavaScript off) from the server
- Sign in with a wrong password and see the translated error once; a reload shows nothing
- The sign-up form shows the translated consent with the Polish original and the binding-text note; in Polish it looks as before
- The confirmation pages (`/auth/confirm-email`, an expired link, a valid link) read in the chosen language
- The Turnstile widget, where a site key is set, follows the language

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Verification and rollout

### Overview

The smoke test covers the language rules, the docs describe them, and the change is checked on staging.

### Changes Required:

#### 1. Smoke checks

**File**: `scripts/smoke.mjs`, `.github/workflows/ci.yml`

**Intent**: Guard the resolution rules and the `?lang=` link over HTTP.

**Contract**: The smoke job writes `ENABLED_LOCALES=pl,en,uk` next to the Supabase values it already writes to `.env` and `.dev.vars`. New checks, skipped under `SMOKE_READONLY=1` except the last: no language header gives `<html lang="pl"`; `Accept-Language: uk` gives `lang="uk"`; `Accept-Language: de` gives `lang="en"`; `GET /mapa?lang=en` answers 303 to `/mapa` with the language cookie, and the next request reads in English; `GET /api/mapa` has the same body with and without the cookie. Read-only, against any environment: `GET /?lang=en` answers 303 to `/`, and `GET //example.com/?lang=en` answers with a `Location` on the tested origin.

#### 2. Documentation

**File**: `CLAUDE.md`, `README.md`, `context/foundation/infrastructure.md`

**Intent**: Record the rules a later change must follow.

**Contract**: `CLAUDE.md` gains: the `ENABLED_LOCALES` variable and its per-environment values under **Env**; a convention that user-facing text goes in `src/lib/i18n/messages/` in all three languages and never as a literal in a page, island or endpoint; and that the config banner is the one exception. `infrastructure.md` records where each environment's value lives.

#### 3. Roadmap

**File**: `context/foundation/roadmap.md`

**Intent**: Carry the two rollout decisions to the slices they bind.

**Contract**: S-19 notes that production's `ENABLED_LOCALES` stays `pl` until S-19 is done, and that S-18 already ships the consent translation on the sign-up form and the category names. S-19's taxonomy unknown is narrowed to: catalogues keyed by slug are in use for categories; decide whether skills follow.

### Success Criteria:

#### Automated Verification:

- Smoke passes with the new checks: `npm run smoke`
- Unit tests, type check, lint and build pass: `npm run test:unit && npx astro check && npm run lint && npm run build`
- CI is green on the PR (`ci`, `smoke`)
- Production offers Polish only: the top-level `vars.ENABLED_LOCALES` in the merged `wrangler.jsonc` is `"pl"`

#### Manual Verification:

- On `https://staging.skillnet.org.pl` all three languages work end to end: landing, map, sign-in, and the sign-up form up to its validation (staging has public sign-up off)
- A branch preview offers all three languages
- The owner has read the English text on every translated page and listed the Ukrainian pages for the native reader

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful. The check on production is not a step of this change: the read-only smoke that every promotion already runs covers it, and its new `?lang=` checks pass on a Polish-only environment.

---

## Testing Strategy

### Unit Tests:

- `resolveLocale`: cookie wins; cookie naming a disabled or unknown language is ignored; missing, empty and `*` headers give Polish; `uk-UA`, `en-GB;q=0.9, pl;q=0.8`, `ru, pl;q=0.5`, `de`, `de` on a Polish-only environment, `pl;q=0, en` (English), `uk, en` at equal quality (Ukrainian), malformed quality values.
- The `?lang=` redirect target: the parameter is removed and other parameters kept; a path starting with `//` stays on the request's origin.
- `parseEnabledLocales`: unset, empty, unknown entries, spaces, a list without `pl`.
- Catalogues: no empty strings, equal placeholder sets across languages.
- `plural`: 1, 2, 5, 12, 22 in Polish and Ukrainian; 1 and 2 in English.
- `authErrorMessage` and `passwordProblem` per language, with the unknown-code fallback.

### Integration Tests:

- The smoke checks in Phase 4.

### Manual Testing Steps:

1. Open `/` in a private window with the browser set to Ukrainian, then to German, then to Polish.
2. Switch language on `/mapa?kategoria=...` and confirm the other query parameters survive.
3. Walk sign-up and sign-in in English and Ukrainian with JavaScript on and off.
4. Check the header on a 360 px wide screen as a signed-in coordinator.
5. Set `ENABLED_LOCALES=pl` locally and confirm the app is indistinguishable from today.

## Performance Considerations

Resolution is string parsing with no I/O, so it adds nothing measurable to the 10 ms CPU limit of the Free plan. Catalogues for a few hundred strings add a few kilobytes to the Worker bundle. An island bundles its own area in three languages; for the auth forms and the map this is well under 10 kB before compression. Cyrillic font files are fetched only by pages that render Cyrillic.

## Migration Notes

No database change. The rollout switch is `ENABLED_LOCALES` in `wrangler.jsonc`: production stays `pl` through this change and until S-19 is done, and enabling a language there is a one-line change promoted like any other. Rolling back is setting the value back to `pl`; visitors' language cookies are then ignored.

## References

- Roadmap: `context/foundation/roadmap.md` (S-18 to S-21, Open Roadmap Questions 13 and 14)
- PRD: `context/foundation/prd.md` (FR-021)
- Lesson on public cache headers: `context/foundation/lessons.md`
- Flash notices: `src/lib/flash.ts:42`
- Auth error mapping: `src/lib/auth-errors.ts:5`
- Public map endpoint: `src/pages/api/mapa.ts:9`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Language foundation

#### Automated

- [x] 1.1 Unit tests pass, including the resolution table and the catalogue check — a19bd0d
- [x] 1.2 Type check passes — a19bd0d
- [x] 1.3 Lint passes — a19bd0d
- [x] 1.4 Build passes — a19bd0d
- [x] 1.5 Smoke passes unchanged against a local server — a19bd0d

#### Manual

- [x] 1.6 Switcher changes header and footer language and the choice survives a browser restart — a19bd0d
- [x] 1.7 With `ENABLED_LOCALES` unset there is no switcher and `/?lang=en` lands on `/` in Polish — a19bd0d
- [x] 1.8 `/profil?lang=uk` signed out ends on sign-in in Ukrainian with the return path kept — a19bd0d
- [x] 1.9 Header fits a 360 px screen for a signed-in coordinator in all three languages — a19bd0d
- [x] 1.10 Ukrainian renders in the added fonts and Polish pages fetch no Cyrillic font file — a19bd0d

### Phase 2: Public pages and map

#### Automated

- [ ] 2.1 Unit tests pass
- [ ] 2.2 Type check passes
- [ ] 2.3 Lint passes
- [ ] 2.4 Smoke passes unchanged
- [ ] 2.5 Only `/api/mapa` sends a public cache header

#### Manual

- [ ] 2.6 Landing, map, 404 and access-denied pages read fully in English and Ukrainian
- [ ] 2.7 Map filter, legend, postcode jump and empty state are translated
- [ ] 2.8 Page titles and descriptions match the language
- [ ] 2.9 Polish pages look and read exactly as before

### Phase 3: Sign-in and sign-up

#### Automated

- [ ] 3.1 Unit tests pass with per-language cases for auth errors and password messages
- [ ] 3.2 Type check passes
- [ ] 3.3 Lint passes
- [ ] 3.4 Smoke passes unchanged, including the full sign-up and sign-in walk

#### Manual

- [ ] 3.5 Sign-up validation messages appear in the chosen language, with and without JavaScript
- [ ] 3.6 Wrong-password error is translated and shown once
- [ ] 3.7 Sign-up shows the translated consent with the Polish original and the binding-text note
- [ ] 3.8 Confirmation pages read in the chosen language
- [ ] 3.9 Turnstile widget follows the language

### Phase 4: Verification and rollout

#### Automated

- [ ] 4.1 Smoke passes with the new language checks
- [ ] 4.2 Unit tests, type check, lint and build pass
- [ ] 4.3 CI is green on the PR
- [ ] 4.4 Production offers Polish only in the merged `wrangler.jsonc`

#### Manual

- [ ] 4.5 All three languages work end to end on staging
- [ ] 4.6 A branch preview offers all three languages
- [ ] 4.7 Owner has read the English text and listed the Ukrainian pages for the native reader
