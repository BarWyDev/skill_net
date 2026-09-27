# Review fixes: resident-skills-profile

Queued from `reviews/impl-review.md` (2026-09-27). Each item needs its own change (`/10x-new`), because S-01 is closed.

## F1: Stop persisting the postcode (Fix A). Must land before S-03.

- Drop or permanently null `profiles.postcode`. The `profiles_resolve_and_coarsen` trigger still resolves the typed postcode to the coarsened centroid and then discards the code. Keep `location_source = 'postcode'`.
- Update `get_my_profile` (no `postcode` key), the table checks that reference `postcode`, the pgTAP cases (`postcode_resolves`, `pin_clears_postcode`), `src/db/database.types.ts`, `MyProfileDTO`, and `LocationPicker` / `profil.astro`, which should show "Ustawiono z kodu pocztowego" instead of the code.
- Why: 981 postcodes have 1 address and 3,217 have 5 or fewer, so a stored code can identify a building. S-03's security-definer RPC would be the first cross-user reader.
