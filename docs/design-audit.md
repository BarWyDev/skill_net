# SkillNet design audit after the redesign

Date: 2026-10-10. Branch audited: `feat/coordinator-redesign` at `0038b59` (redesign base `607c1db`). The references are the landing (`src/components/Landing.astro`, `src/layouts/Layout.astro`, `src/styles/global.css`, `src/lib/site-styles.ts`) and the `frontend-design` skill. Screenshots are in [`docs/design-audit/`](design-audit/), full page, at 375 px and 1280 px, rendered by headless Chromium against the local dev server and local Supabase, with reduced motion on.

## 1. Landing design system (the reference)

| Token             | Value                                                                                                                                                                                                                                              |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Palette           | graphite `#1e2024` (background), chalk `#ece9e2` (text), ash `#a3a6ad` (secondary text, field edges), seam `#3a3d44` (hairlines, hover fill), signal `#f2c230` (the one accent; hover `#f7d564`), alarm `#ff9b7a` (errors and destructive actions) |
| Typefaces         | Big Shoulders Display 800 (`font-display`): wordmark, h1, section headings, rank numbers. Atkinson Hyperlegible Next 400/700 (`font-body`): everything else                                                                                        |
| Type scale        | Landing hero `clamp(2.5rem, 14.5vw, 10rem)`/0.86. Page h1 `clamp(2.75rem, 10vw, 6.5rem)`/0.9. Section h2 `2rem`/1. Lead `text-lg`→`sm:text-xl`. Body 1.0625rem. Small `0.9375rem`                                                                  |
| Grid and widths   | `max-w-6xl`, `px-4 sm:px-8`, 12-column grid with `gap-x-6`. Running text 38–64ch. Form column `max-w-md`/`42rem`. Map bleeds to `96rem`                                                                                                            |
| Spacing rhythm    | Page top `pt-12 sm:pt-20`, bottom `pb-20 lg:pb-28`. Sections `mt-16 sm:mt-20`. Hairline sections `border-t border-seam pt-10`                                                                                                                      |
| Primary button    | `BUTTON` + `btn-primary`: signal fill, graphite bold text, square, min height 48 px                                                                                                                                                                |
| Secondary button  | `btn-secondary`: 2 px inset chalk edge, seam fill on hover. Destructive: `btn-danger`, a 2 px alarm edge with alarm text                                                                                                                           |
| Links             | `NAV_LINK`: ash, chalk with underline on hover, 44 px tall. `TEXT_LINK`: chalk, bold, always underlined. Current page: chalk with a 2 px signal underline                                                                                          |
| Inputs            | `.field`: transparent, 2 px inset ash edge, chalk on hover, signal on focus, alarm when invalid, 48 px tall. `.check` and `.radio` drawn the same way                                                                                              |
| Focus             | 3 px signal outline, 3 px offset (inset inside fields)                                                                                                                                                                                             |
| Status vocabulary | `StatusLine` / `StatusMark`: a square from the map grid plus text. done = filled signal, attention = empty signal, neutral = empty ash, error = alarm text with the `CircleAlert` icon                                                             |
| Header            | `SiteHeader`: wordmark left, `NAV_LINK` nav right, e-mail in ash when signed in                                                                                                                                                                    |
| Footer            | Graphite, one underlined ash link to `/prywatnosc` on the content's left edge                                                                                                                                                                      |
| Motion            | One orchestrated moment: the hero lines rise on load, only with `prefers-reduced-motion: no-preference`                                                                                                                                            |

## 2. Pass/fail matrix

`ok`, `minor` or `fail`; a number links to a finding in section 3. "Behaviour" means form actions, field names, redirects and routes are unchanged (section 3, D).

| Page / state                                                                   | Header/footer | Background    | Type          | Grid           | Controls                  | Status language  | Map              | A11y                      | Behaviour |
| ------------------------------------------------------------------------------ | ------------- | ------------- | ------------- | -------------- | ------------------------- | ---------------- | ---------------- | ------------------------- | --------- |
| `/`                                                                            | ok            | ok            | ok            | ok             | ok                        | ok               | –                | ok                        | ok        |
| `/?konto-usuniete`                                                             | ok            | ok            | ok            | ok             | ok                        | minor [9](#f9)   | –                | ok                        | ok        |
| `/mapa` (anon, signed in)                                                      | ok            | ok            | ok            | ok             | minor [5](#f5)            | ok               | minor [11](#f11) | minor [5](#f5)            | ok        |
| `/prywatnosc`                                                                  | fail [2](#f2) | fail [2](#f2) | fail [2](#f2) | fail [2](#f2)  | fail [2](#f2)             | fail [2](#f2)    | –                | minor [2](#f2)            | ok        |
| `/zgoda`                                                                       | ok (static)   | ok (static)   | ok (static)   | ok (static)    | minor [14](#f14)          | ok               | –                | not reached               | ok        |
| `/404`                                                                         | fail [1](#f1) | fail [1](#f1) | fail [1](#f1) | fail [1](#f1)  | fail [1](#f1)             | –                | –                | minor [1](#f1)            | ok        |
| `/brak-dostepu`                                                                | ok            | ok            | ok            | ok             | ok                        | –                | –                | ok                        | ok        |
| `/auth/signin` (empty, error, unconfirmed)                                     | ok            | ok            | ok            | ok             | minor [5](#f5)            | ok               | –                | minor [5](#f5)            | ok        |
| `/auth/signin?powrot=`                                                         | ok            | ok            | ok            | ok             | minor [5](#f5)            | minor [9](#f9)   | –                | minor [5](#f5)            | ok        |
| `/auth/signup` (empty, errors)                                                 | ok            | ok            | ok            | ok             | minor [5](#f5) [14](#f14) | ok               | –                | minor [5](#f5)            | ok        |
| `/auth/confirm-email` (3 variants)                                             | ok            | ok            | ok            | ok             | ok                        | ok               | –                | ok                        | ok        |
| `/auth/link-wygasl` (empty, error)                                             | ok            | ok            | ok            | ok             | minor [5](#f5)            | ok               | –                | minor [5](#f5)            | ok        |
| `/profil` (incomplete, complete, paused ×2, saved, resumed, error, validation) | ok            | ok            | ok            | minor [6](#f6) | minor [5](#f5)            | minor [15](#f15) | minor [11](#f11) | minor [5](#f5)            | ok        |
| `/koordynator` (list, error)                                                   | ok            | ok            | ok            | ok             | minor [17](#f17)          | ok               | minor [11](#f11) | minor [5](#f5)            | ok        |
| `/koordynator/kryzys/[id]` (active, populated, ended, not found)               | ok            | ok            | ok            | ok             | ok                        | ok               | –                | minor [10](#f10)          | ok        |
| End-crisis dialog                                                              | ok            | ok            | ok            | ok             | ok                        | minor [16](#f16) | –                | ok                        | ok        |
| `.../zespoly` (form, result, error, ended)                                     | ok            | ok            | ok            | ok             | minor [8](#f8)            | ok               | –                | minor [10](#f10)          | ok        |
| `.../kontakty` (before, error, revealed, ended)                                | ok            | ok            | ok            | ok             | minor [5](#f5) [8](#f8)   | ok               | –                | minor [5](#f5) [10](#f10) | ok        |
| `Banner.astro`                                                                 | fail [4](#f4) | fail [4](#f4) | ok            | ok             | –                         | fail [4](#f4)    | –                | ok                        | ok        |
| Layout footer (`footer="dark"`)                                                | fail [3](#f3) | –             | –             | –              | –                         | –                | –                | –                         | ok        |
| Favicon, OG image, meta                                                        | ok            | –             | –             | –              | –                         | –                | –                | minor [10](#f10)          | ok        |

## 3. Findings

Severity: **A** broken or inconsistent, **B** visible deviation, **C** polish. Status is updated after the fix pass (section 6).

<a id="f1"></a>**1. A. `/404` still has the old look.** `src/pages/404.astro:3-30`: `bg-cosmic`, `Topbar`, a glass panel (`rounded-2xl border-white/10 bg-white/10 backdrop-blur-xl`), purple links, the system font, no `header`/`nav` landmarks. Evidence: `05-404-375.jpg`, `05-404-1280.jpg`, grep hits. Fix: render it through `PageShell`, as `/brak-dostepu` already does.

<a id="f2"></a>**2. A. `/prywatnosc` still has the old look.** `src/pages/prywatnosc.astro:15-108`: the same glass shell plus a yellow `bg-yellow-500/15` draft note and `text-blue-100/*` body text. Evidence: `04-prywatnosc-*.jpg`. Fix: `PageShell`, section headings in the section-title style, the draft note as a `StatusLine tone="attention"`, with the wording unchanged.

<a id="f3"></a>**3. A. Two footers, and the default is the old one.** `src/layouts/Layout.astro:16,78-95`: `footer="dark"` is the default, painted `bg-[#0a0e1a]` with purple links; any new page that forgets the prop gets it. Fix: keep one graphite footer and drop the prop.

<a id="f4"></a>**4. A. `Banner.astro` uses a light-theme palette.** `src/components/Banner.astro:26-41`: nine hex values (`#dbeafe`, `#fef3c7`, `#fee2e2`, …) and centred text, unrelated to the landing. It shows on every page whenever configuration is missing. Fix: graphite background, chalk text, an alarm, signal or ash bottom edge per variant, on the content's left edge.

<a id="f5"></a>**5. B. Placeholder text fails AA contrast.** `src/styles/global.css` `.field::placeholder { opacity: 0.7 }` turns ash into `#7b7e84` on graphite: 4.0:1, below 4.5:1. It affects every field with a placeholder (sign-in, sign-up, link-wygasl, profile postcode and phone, map postcode, crisis epicentre, reveal reason). Evidence: `audit-report` sweep, pair `placeholder #7b7e84 on #1e2024`. Fix: drop the opacity; ash on graphite is 6.69:1 and still reads as a hint next to chalk values.

<a id="f6"></a>**6. B. `/profil` re-implements `PageShell`.** `src/pages/profil.astro:39-48` repeats the shell's markup class for class (header, `pt-12 sm:pt-20`, display h1, `max-w-[42rem]` column). Fix: use `PageShell`.

<a id="f7"></a>**7. B. The page-title and section-title styles are copied, not shared.** The h1 string `font-display text-[clamp(2.75rem,10vw,6.5rem)] leading-[0.9]` appears in `AuthShell.astro:22`, `PageShell.astro:56`, `mapa.astro:47` and `profil.astro:45`. The section h2 `font-display text-[2rem] leading-none` appears 11 times (profile, coordinator, dialog, delete and pause sections). Fix: `PAGE_TITLE` and `SECTION_TITLE` in `site-styles.ts`.

<a id="f8"></a>**8. B. The field error is implemented three times.** `zespoly.astro:176-179` and `kontakty.astro:154-157` copy `FieldError.tsx` by hand. Fix: render `FieldError` (it accepts a `role`).

<a id="f9"></a>**9. B. Two notices sit outside the status vocabulary.** `index.astro:11` (account deleted) and `signin.astro:15` (sign in to continue) are plain seam-bordered boxes. Evidence: `02-landing-konto-usuniete-*.jpg`, `12-signin-powrot-*.jpg`. Fix: the account-deleted confirmation becomes `StatusLine tone="done"`, like "Zapisano." on the profile. The sign-in notice is information, and the vocabulary has no info tone, so it needs a design decision. Leave it.

<a id="f10"></a>**10. C. Coordinator page titles miss the site name.** `koordynator/index.astro:44`, `kryzys/[id].astro:48`, `zespoly.astro:104`, `kontakty.astro:98` give `Panel koordynatora` and `Kryzys: Pożar`; every other page ends with `— SkillNet`. Fix: add the suffix.

<a id="f11"></a>**11. C. Leaflet's zoom buttons use a monospace face.** `leaflet.css:342` sets `'Lucida Console', Monaco, monospace` on `+`/`−`, the only third typeface on the site (sweep: `fonts` on `/mapa`, `/profil`, `/koordynator`). Fix: inherit `--font-body` in `.site-map .leaflet-bar a`.

<a id="f12"></a>**12. C. The shadcn `Button` is unused and off-system.** `src/components/ui/button.tsx` has no importers and renders with the light shadcn tokens (`bg-primary`, `rounded-md`, `shadow-xs`). Fix: restyle it to `BUTTON`/`btn-*` or delete it. That is a decision about the component kit, so leave it.

<a id="f13"></a>**13. C. Unused leftovers.** The `bg-cosmic` utility (`global.css:136`), `Topbar.astro` (used only by findings 1 and 2), the `tw-animate-css` import (no class from it is used), the `sidebar`, `chart` and `.dark` tokens and `@custom-variant dark` (open item in `docs/post-redesign-todo.md`), and stale comments (`SiteHeader.astro:2`, `Layout.astro:78`, the `.field` comment in `global.css`, `site-styles.ts:1`). Fix: remove them and update the comments.

<a id="f14"></a>**14. C. The inline consent link is styled by hand twice.** `zgoda.astro:35` and `SignUpForm.tsx:193` spell out `text-chalk font-bold underline underline-offset-4`. `TEXT_LINK` can't be used inside a sentence (it is `inline-flex` and 44 px tall). Fix: an `INLINE_LINK` constant, which `TEXT_LINK` builds on.

<a id="f15"></a>**15. C. A "WORD — fragment" label.** `profil.astro:75` reads "**Profil niekompletny** — dodaj lokalizację…", one of the skill's template tells. Fix: two sentences, "Profil niekompletny. Dodaj lokalizację…", with the meaning unchanged.

<a id="f16"></a>**16. C. A middot meta string in the end-crisis dialog.** `formatCrisisTitle` (`src/lib/crisis-format.ts:42`) gives "Wypadek masowy · 1 km · okolice 86-300", another skill tell. It is a tested data format whose job is to tell crises apart, so leave it and reconsider when the copy is reviewed.

<a id="f17"></a>**17. C. The disabled "Aktywuj kryzys" button has an ad-hoc style.** `CrisisActivationForm.tsx:118`, `bg-seam text-ash`, 4.46:1. Disabled controls are exempt from 1.4.3, and the reason is spelled out above the button. No change.

### Checks that passed

- **Old look (grep):** after findings 1–4 and 13 there are no other hits for `backdrop-blur`, `bg-white/*`, `border-white/`, gradients, `bg-clip-text`, `rounded-xl/2xl`, `Welcome` or `AuthHomeLink`. There are no emoji icons, arrows glued to links, ALL-CAPS eyebrows or `tracking-*`. The `✓` in the availability grid is `aria-hidden` and doubles the signal fill. The rank numbers on the crisis and contacts lists mark a real order.
- **Colours:** apart from findings 4 and 13, the only hex values are the palette tokens, `#6b6e75` (disabled Leaflet zoom, decorative) and `SIGNAL` in `DensityMap.tsx` (SVG attributes can't read CSS variables; documented). There are no Tailwind palette classes outside findings 1, 2 and 3.
- **Accessibility sweep** (`audit.js`, every state at 375 and 1280, plus 320 for every non-mutating state): exactly one `h1` and no skipped heading levels on every page, `lang="pl"`, every control showing a focus outline when focused, no target under 44 px apart from inline links, and no horizontal scroll at 320 px. All text pairs pass AA except finding 5 (and finding 17, which is exempt). Palette contrast on graphite: chalk 13.45, ash 6.69, signal 9.74, alarm 7.94; graphite on signal 9.74. Motion is the hero rise, the end-crisis dialog fade and the submit spinner, all off under `prefers-reduced-motion`. Leaflet zoom and fade animations follow the same setting. Status never relies on colour alone: every mark pairs a square or icon with text. Notices on `/profil` are hidden with `visibility`, not removed, so the form doesn't jump.
- **Behaviour guard (D):** `git diff 607c1db..HEAD --stat` shows no change in `src/pages/api`, `src/lib/services`, `src/middleware.ts`, `supabase/` or `scripts/smoke.mjs`. Form `action`/`method`/`name` attributes and the 53 `redirect(` calls match the base; the one extra sign-out form is the `SiteHeader` one. `src/lib` changes: `consent.ts` adds the new icon and OG paths to the consent-gate exempt list, and `crisis-format.ts` swaps class strings for a status tone (label "Nie podano" became "Dostępności nie podano"). `npm run lint`, `npx astro check`, `npm run build` and `npm run test:unit` pass.
- **Skill compliance (E):** the hero is the subject itself, a three-line type-only headline with the crisis line in signal, so the boldness is spent in one place. The palette (graphite, chalk, hi-vis yellow) is none of the default looks: not cream and terracotta, not black and acid green, not broadsheet hairlines, not the SaaS card kit. Inner pages stay quiet: the display face only for titles, hairlines only between list rows and sections, and no cards, shadows or gradients. The copy is concrete and active ("Wznów dostępność", "Usuń konto na zawsze", "Ujawnij kontakty"), and errors say what to do. Remaining tells: findings 15 and 16.

## 4. Not verified

- **`/zgoda` at runtime:** it needs an account whose consent is not the current version, and producing one means rewriting consent rows. It was reviewed statically: `AuthShell`, `StatusLine`, `.check`, `btn-primary`, `TEXT_LINK`.
- **`Banner.astro` at runtime:** configuration is present locally. Reviewed statically.
- **Keyboard-only operation:** checked as "focus lands and shows an outline" on every control and by reading the code (native `dialog` with focus moved to "Anuluj", radios and checkboxes kept native). A full manual tab-through per page was not done.
- **The `/koordynator` activation form on the shared dev server (port 4321):** it didn't hydrate there because that server's Vite cache served a 404 for `zod.js`. On the 4330 dev server (same working tree) it works: `30-koordynator-formularz-*.jpg`. This is an environment issue, not a product bug.
- **The Astro dev toolbar** (a small pill of icons) appears at the viewport's bottom edge in full-page dev screenshots, e.g. `32b-kryzys-lista-1280.jpg`. It is dev-only.
- **Smoke test:** not run. It creates accounts and needs email confirmation off; the redirect targets it asserts were not touched (D).
- **Populated lists** were captured on a test crisis activated for the audit (Kraków, 5 km), then ended. Phone numbers are masked as `+48 [ukryte]` in the screenshots.

## 5. Verdict

**Mostly consistent:** every resident, auth and coordinator page shares the landing's shell, palette, type and status language. Only `/404`, `/prywatnosc`, the default footer and the config banner still carry the old or the shadcn look. The three changes with the best payoff: move `/404` and `/prywatnosc` onto `PageShell` (findings 1–2), collapse the footer to the graphite one and restyle `Banner` (findings 3–4), and fix the placeholder contrast (finding 5).

## 6. Fix status

Filled in after the fix pass.
