# Review fixes: crisis-team-templates

From `reviews/impl-review.md`.

## F4: push the migrations before merging

Merging to `master` deploys at once (Workers Builds), but migrations are pushed by hand. If the
PR merges first, the "Złóż zespoły" link on every active crisis leads to an error page.

Before merging the PR:

1. Push `20261004140000_crisis_team_templates.sql` and `20261004140100_seed_team_templates.sql`
   to production: `npx supabase db push` (check the list it prints first).
2. In Studio on production, confirm the 4 templates exist.
3. Put this order in the PR description, as for S-09.
