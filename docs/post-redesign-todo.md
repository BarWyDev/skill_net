# Post-redesign TODO

Items deliberately left as placeholders during the pre-redesign cleanup (branch `chore/pre-redesign-cleanup`). Resolve them once the new design lands.

- [ ] **OG image:** design a share image and add `<meta property="og:image">` (plus `og:image:alt`) in `src/layouts/Layout.astro`. No tag exists yet on purpose.
- [ ] **Favicons:** replace the placeholder `public/favicon.png`, `public/favicon.ico` and `public/apple-touch-icon.png` with the new brand icons. `favicon.png` is also listed in `src/lib/consent.ts` (consent-gate exempt paths), so keep that path or update the list and its test.
- [ ] **Meta description:** review the Polish default `description` in `src/layouts/Layout.astro`, and set per-page descriptions where useful.
- [ ] **Landing page:** replace or rename `src/components/Welcome.astro` (starter name and "cosmic" styling, SkillNet copy).
- [ ] **Theme tokens:** drop the unused shadcn tokens (sidebar, chart, `.dark`) from `src/styles/global.css` once the new palette is defined.
