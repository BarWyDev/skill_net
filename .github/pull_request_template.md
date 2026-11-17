## Summary

-

## Test plan

- [ ]

## Migracje

Skip this block when the PR adds nothing under `supabase/migrations/`.

Write it expand-then-contract: production runs older code than `master` until the next promotion.

- [ ] Before merging to `master`: pushed to staging (`npm run db:push:staging`) and tried on the branch preview (it signs in against staging)
- [ ] Production: right before the promotion PR (`master` → `production`) that carries it merges, `npx supabase migration list --linked`, then `npx supabase db push`
