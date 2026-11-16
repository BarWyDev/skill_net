# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Public cache headers on routes that pass through the auth middleware

- **Context**: src/pages/api/kody-pocztowe/[kod].ts:7
- **Problem**: Middleware calls `supabase.auth.getUser()` on every request; on token refresh, `setAll` writes `sb-*-auth-token` cookies onto the response. With `Cache-Control: public, max-age=86400`, a shared proxy may store a response carrying a session `Set-Cookie`.
- **Rule**: Never send `Cache-Control: public` from a route that runs the Supabase auth middleware; use `private` (or skip `getUser()` for that path first).
- **Applies to**: All `src/pages/api/**` routes and any page that sets `Cache-Control`.

## Push migrations to production right after merge

> Superseded on 2026-11-16 by "Production code lags `master`" below: `master` no longer deploys production.

- **Context**: Any change that adds a file under `supabase/migrations/` and is merged to `master`.
- **Problem**: Workers Builds auto-deploys every merge to `master`, but migrations reach production only through a manual `npx supabase db push`. After #56 merged, the Worker expected `get_my_profile.complete` and `crises.visible_match_count` while production lacked the migration, so `/profil` and the coordinator pages failed until the push.
- **Rule**: Write migrations expand-then-contract so the code currently on `master` keeps working with them. Before merging, push the migration to staging (`npm run db:push:staging`) and try it on the branch preview. Right after merging, run `npx supabase migration list --linked` and `npx supabase db push`, then verify production.
- **Applies to**: plan, implement, impl-review

## Production code lags `master`

- **Context**: change `staging-environment` (2026-11-16): a merge to `master` deploys only `skillnet-staging`; production deploys from `production` through a promotion PR.
- **Problem**: A migration merged to `master` can wait days for the next promotion, and the production database is shared by whatever code `production` runs. Pushed right after the `master` merge, a contract migration breaks the older code still in production; pushed after the promotion, the new code runs against the old schema until someone remembers.
- **Rule**: Push migrations to staging before merging to `master`, and to production right before the promotion PR that carries them merges. Expand first; a contract migration (drop, rename, tighten) waits for the promotion after the one that shipped the code that stopped using the old shape.
- **Applies to**: plan, implement, impl-review, and every promotion PR
