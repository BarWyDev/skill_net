# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Public cache headers on routes that pass through the auth middleware

- **Context**: src/pages/api/kody-pocztowe/[kod].ts:7
- **Problem**: Middleware calls `supabase.auth.getUser()` on every request; on token refresh, `setAll` writes `sb-*-auth-token` cookies onto the response. With `Cache-Control: public, max-age=86400`, a shared proxy may store a response carrying a session `Set-Cookie`.
- **Rule**: Never send `Cache-Control: public` from a route that runs the Supabase auth middleware; use `private` (or skip `getUser()` for that path first).
- **Applies to**: All `src/pages/api/**` routes and any page that sets `Cache-Control`.

## Push migrations to production right after merge

- **Context**: Any change that adds a file under `supabase/migrations/` and is merged to `master`.
- **Problem**: Workers Builds auto-deploys every merge to `master`, but migrations reach production only through a manual `npx supabase db push`. After #56 merged, the Worker expected `get_my_profile.complete` and `crises.visible_match_count` while production lacked the migration, so `/profil` and the coordinator pages failed until the push.
- **Rule**: Write migrations expand-then-contract so the code currently on `master` keeps working with them. Right after merging a change with a migration, run `npx supabase migration list --linked` and `npx supabase db push`, then verify production.
- **Applies to**: plan, implement, impl-review
