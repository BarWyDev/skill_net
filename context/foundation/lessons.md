# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Public cache headers on routes that pass through the auth middleware

- **Context**: src/pages/api/kody-pocztowe/[kod].ts:7
- **Problem**: Middleware calls `supabase.auth.getUser()` on every request; on token refresh, `setAll` writes `sb-*-auth-token` cookies onto the response. With `Cache-Control: public, max-age=86400`, a shared proxy may store a response carrying a session `Set-Cookie`.
- **Rule**: Never send `Cache-Control: public` from a route that runs the Supabase auth middleware; use `private` (or skip `getUser()` for that path first).
- **Applies to**: All `src/pages/api/**` routes and any page that sets `Cache-Control`.
