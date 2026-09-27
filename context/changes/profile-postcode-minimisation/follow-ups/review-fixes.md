# Review fixes: profile-postcode-minimisation

Queued from `reviews/impl-review.md` (2026-09-27). Each item needs its own change (`/10x-new`) unless it is folded into a later slice.

## F1: Keep the typed postcode out of request URLs (Workers Logs)

- The island looks postcodes up with `GET /api/kody-pocztowe/<code>` (`src/components/profile/LocationPicker.tsx:97`). `wrangler.jsonc` has `observability.enabled: true`, so every looked-up code lands in Workers Logs with the request metadata, for the retention window.
- Fix: switch the lookup to `POST /api/kody-pocztowe` with a JSON body `{ "postcode": "NN-NNN" }`. Keep the 400/404/200 contract, keep `Cache-Control: private` (lessons.md), and update the island and a smoke step.
- Why: S-15 guarantees that no database, RPC or page reader sees a typed postcode. This closes the last copy, which sits in operator-visible logs.
- Before S-03 is preferable, but not blocking: the log entries carry no user_id.
