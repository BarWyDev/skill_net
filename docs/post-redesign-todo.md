# Post-redesign TODO

Items deliberately left as placeholders during the pre-redesign cleanup (branch `chore/pre-redesign-cleanup`). Resolve them once the new design lands.

- [x] **OG image:** design a share image and add `<meta property="og:image">` (plus `og:image:alt`) in `src/layouts/Layout.astro`. No tag exists yet on purpose.
- [x] **Favicons:** replace the placeholder `public/favicon.png`, `public/favicon.ico` and `public/apple-touch-icon.png` with the new brand icons. `favicon.png` is also listed in `src/lib/consent.ts` (consent-gate exempt paths), so keep that path or update the list and its test.
- [x] **Meta description:** the Polish default in `src/layouts/Layout.astro` stays for `/`. The public pages (`/mapa`, `/prywatnosc`, `/auth/signin`, `/auth/signup`) set their own through `Layout`, `PageShell` and `AuthShell`; signed-in pages keep the default.
- [x] **Landing page:** `Welcome.astro` became `src/components/Landing.astro` with its own palette, fonts and header. Every other page now uses the same graphite shell; `bg-cosmic` is gone.
- [x] **Theme tokens:** dropped the unused shadcn tokens (sidebar, chart, `.dark`) from `src/styles/global.css` (design audit, `docs/design-audit.md`). The remaining shadcn tokens serve only the unused `src/components/ui/button.tsx` (audit finding 12).
