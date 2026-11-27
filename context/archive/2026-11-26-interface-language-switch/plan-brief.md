# Interface Language Switch — Plan Brief

> Full plan: `context/changes/interface-language-switch/plan.md`

## What & Why

SkillNet is Polish only. FR-021 asks for English and Ukrainian, so that residents who do not read Polish can register and be found in a crisis. This change (roadmap S-18) lets a visitor pick the language and translates the public pages and the sign-in and sign-up flow. It also builds the language machinery that S-19, S-20 and S-21 reuse.

## Starting Point

About 600 lines of Polish copy are hardcoded in 73 files: Astro pages, React islands, and server code that builds error messages. `<html lang="pl">` is fixed, the fonts have no Cyrillic, and the smoke test asserts 16 Polish strings.

## Desired End State

On an environment that offers all three languages, the header shows `PL · EN · UA`. The landing page, the map, the error pages and the whole sign-in and sign-up flow follow the choice, at the same addresses. A first visit follows the browser, and a link such as `/?lang=uk` opens the site in Ukrainian. On production nothing visible changes yet: it offers Polish only until S-19 is done.

## Key Decisions Made

| Decision                           | Choice                                                                 | Why (1 sentence)                                                                  | Source  |
| ---------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------- |
| Addresses                          | Same addresses; language in a cookie                                   | No change to middleware routes, auth redirects or the smoke test.                 | Roadmap |
| Legal texts                        | Courtesy translation; the Polish text is binding                       | The consent version stays single, so nobody is asked to consent again.            | Roadmap |
| Browser in an unsupported language | English; Polish only when the request names no language                | A foreign visitor understands the page at once; robots and smoke stay on Polish.  | Plan    |
| Cyrillic                           | Fallback fonts with Cyrillic subsets behind the current fonts          | Polish and English look unchanged; Cyrillic files load only on Ukrainian pages.   | Plan    |
| Switcher                           | `PL · EN · UA` in the header                                           | One tap, works without JavaScript, fits a phone.                                  | Plan    |
| Ukrainian before review            | `ENABLED_LOCALES` per environment, in `wrangler.jsonc`                 | Code and translations promote normally; production shows only reviewed languages. | Plan    |
| Consent on the sign-up form        | Translation, with the Polish original below it marked as binding       | The person understands the consent and sees the exact text that is recorded.      | Plan    |
| Half-translated app                | Staging gets all three now; production stays Polish until S-19 is done | A resident on production never sees an English header over a Polish profile.      | Plan    |
| Language by link                   | `?lang=pl\|en\|uk` on any page, then a redirect to the clean address   | One mechanism for the switcher, printed links and QR codes.                       | Plan    |
| Category names on the map          | Catalogue keyed by slug, falling back to the database's Polish name    | No migration in this slice.                                                       | Plan    |

## Scope

**In scope:**

- Language resolution in the middleware, the `?lang=` link, the language cookie
- Typed message catalogues in `src/lib/i18n/messages/`
- Header, footer, switcher, Cyrillic fonts
- Landing page, public map (with category names), 404, access denied, too many attempts
- Sign-in, sign-up, confirmation pages, server error messages, the consent label
- Smoke checks and documentation

**Out of scope:**

- Profile, courses, consent page, privacy page (S-19)
- Coordinator area and crisis mode (S-20)
- Emails, and storing the language on the account (S-21)
- Address prefixes, `hreflang`, any database migration
- Switching English or Ukrainian on in production

## Architecture / Approach

One pure module, `src/lib/i18n/locale.ts`, decides the language from the cookie, the `Accept-Language` header and the environment's enabled list. The middleware puts the result on `Astro.locals.locale`. Copy lives in catalogues, one file per area, where English and Ukrainian are typed as the shape of Polish, so a missing key fails the type check. Pages and endpoints read the catalogue for the request's language; islands receive `locale` as a prop and import only their own area. `/api/mapa`, the one publicly cached response, stays identical in every language.

## Phases at a Glance

| Phase                       | What it delivers                                                          | Key risk                                                      |
| --------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 1. Language foundation      | Resolution, `?lang=`, environment switch, switcher, header, footer, fonts | The header no longer fits a phone for a signed-in coordinator |
| 2. Public pages and map     | Landing, map with category names, error pages                             | A changed Polish string breaks a smoke assertion              |
| 3. Sign-in and sign-up      | Forms, server messages, consent with the Polish original, confirm pages   | Server messages built before the language is known            |
| 4. Verification and rollout | Smoke checks, docs, staging check, production stays Polish                | A new smoke check failing on a Polish-only environment        |

**Prerequisites:** none. S-07 and S-08 are paused and touch other files.
**Estimated effort:** about 4 sessions, one per phase, each ending in its own PR to `master`.

## Open Risks & Assumptions

- The Ukrainian text is written by the implementer and needs a native reader before production (Open Roadmap Question 13).
- The data-protection officer has not yet confirmed the courtesy-translation approach to the consent.
- The privacy notice does not mention cookies today; whether to list the language cookie is left to S-19.

## Success Criteria (Summary)

- A visitor can read the landing page and the map, and sign up, in English or Ukrainian without meeting Polish in the page body.
- With Polish only enabled, the app is indistinguishable from today and the existing smoke test passes unchanged.
- A missing translation fails the type check instead of reaching a page.
