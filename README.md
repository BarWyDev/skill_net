# SkillNet

A local skills directory for crisis coordination. Residents register their skills (medical, technical, logistics, languages, equipment), an approximate location and when they are available. When a crisis hits, a municipal coordinator activates it and gets nearby residents ranked by distance, skill match and confirmed availability. Day to day, the same directory supports neighbour-to-neighbour help through a public skills density map.

The UI is in Polish. Production runs at https://skillnet.barwy.workers.dev.

Product source of truth: [`context/foundation/prd.md`](context/foundation/prd.md). Stack rationale: [`context/foundation/tech-stack.md`](context/foundation/tech-stack.md).

## Features

- **Sign-up with consent:** email/password accounts with email confirmation and a versioned data-processing consent (`/zgoda`). The privacy notice is at `/prywatnosc`.
- **Resident profile** (`/profil`): skills from a fixed taxonomy, location from a postcode or a map pin (stored only to about 500 m), phone number, weekly availability, pausing availability, and deleting the account with all its data.
- **Public skills map** (`/mapa`): skill density in 2 km squares, shown as ranges only.
- **Coordinator panel** (`/koordynator`): activate a crisis by type, place and radius, get a ranked list of matching residents, assemble teams from templates, reveal contact details through an audited break-glass step, and end the crisis.

## Tech stack

- [Astro](https://astro.build/) 7 (SSR, `output: "server"`) with [React](https://react.dev/) 19 islands
- [TypeScript](https://www.typescriptlang.org/) 6, [Tailwind CSS](https://tailwindcss.com/) 4, [shadcn/ui](https://ui.shadcn.com/)
- [Leaflet](https://leafletjs.com/) / react-leaflet for maps, [zod](https://zod.dev/) for input validation
- [Supabase](https://supabase.com/): Postgres with PostGIS and RLS, Auth with cookie sessions via `@supabase/ssr`
- [Cloudflare Workers](https://workers.cloudflare.com/) with static assets, via `@astrojs/cloudflare`

## Prerequisites

- Node.js 22 (`.nvmrc`). `npm run test:unit` needs Node 22.18 or newer, because it relies on native TypeScript stripping.
- npm
- Docker, for the local Supabase stack

## Getting started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start the local Supabase stack. It applies all migrations and loads `supabase/seed.sql`:

   ```bash
   npx supabase start
   ```

3. Configure environment variables (see [Supabase setup](#supabase-setup)):

   ```bash
   cp .env.example .env
   ```

   ```bash
   cp .env.example .dev.vars
   ```

4. Run the development server at http://localhost:4321:

   ```bash
   npm run dev
   ```

## Supabase setup

| Variable       | Description                                                         |
| -------------- | ------------------------------------------------------------------- |
| `SUPABASE_URL` | API URL (`http://127.0.0.1:54321` locally)                          |
| `SUPABASE_KEY` | Publishable (anon) key, printed by `npx supabase start` or `status` |

Both are declared in the `env.schema` of `astro.config.mjs` as optional server-only secrets and read through `astro:env/server`. Put them in `.env` (Astro) and `.dev.vars` (the workerd runtime). Both files are gitignored. If they are missing, the app still starts, auth is disabled and a banner says so.

Locally, email confirmation is turned off in `supabase/config.toml`, so new accounts can sign in right away. Studio runs at http://localhost:54323. Stop the stack with `npx supabase stop`.

## Scripts

| Script              | What it does                                                                      |
| ------------------- | --------------------------------------------------------------------------------- |
| `npm run dev`       | Dev server on http://localhost:4321, on the Cloudflare workerd runtime            |
| `npm run build`     | Production build                                                                  |
| `npm run preview`   | Serve the production build on the Cloudflare runtime                              |
| `npm run lint`      | ESLint with type-checked rules (`lint:fix` to auto-fix)                           |
| `npm run format`    | Prettier, with the Astro and Tailwind plugins                                     |
| `npx astro check`   | Type check                                                                        |
| `npm run test:unit` | Unit tests (`src/**/*.test.ts`) on Node's built-in `node:test`                    |
| `npm run test:db`   | pgTAP suites in `supabase/tests/` against the local Supabase                      |
| `npm run smoke`     | HTTP smoke test of the auth flow and access gates (see [Smoke test](#smoke-test)) |
| `npm run db:types`  | Regenerate `src/db/database.types.ts` from the local database                     |

A pre-commit hook (husky + lint-staged) runs `eslint --fix` and `prettier --write` on staged files.

## Project structure

```text
.
├── src/
│   ├── components/      # Astro and React components (auth, crisis, map, profile, ui)
│   ├── db/              # Generated Supabase types
│   ├── layouts/         # Page layout
│   ├── lib/             # Pure helpers (with unit tests), validation/ and services/
│   ├── pages/           # Routes; pages/api/ holds the form POST endpoints
│   ├── middleware.ts    # Session, protected routes, coordinator and consent gates
│   └── types.ts         # Shared entity and DTO types
├── supabase/
│   ├── migrations/      # Schema, RLS policies, RPCs and seed data
│   ├── tests/           # pgTAP suites
│   └── seed.sql         # Local-only synthetic residents
├── scripts/             # Smoke test, postcode-centroid builder, perf check
├── context/             # Product docs, plans and change history
├── docs/qa/             # Manual QA plan and findings
└── wrangler.jsonc       # Cloudflare Workers config
```

Routes under `/profil`, `/zgoda` and `/koordynator` require sign-in (`PROTECTED_ROUTES` in `src/middleware.ts`). `/koordynator` also requires the coordinator role.

## Postcode data

The `postcodes` table holds one centroid per Polish postcode (the mean of that postcode's address points). It is loaded by the migration `supabase/migrations/20260927130000_seed_postcode_centroids.sql`, so postcode lookup never calls an external service at runtime.

- **Source:** GUGiK PRG address points (Państwowy Rejestr Granic, about 8.6M points), open data made available free of charge under the Polish Law on Geodesy and Cartography of 17 May 1989. No attribution is required. The current migration was built from the [OpenAddresses](https://github.com/openaddresses/openaddresses/tree/master/sources/pl) per-voivodeship CSV snapshots of PRG dated 2026-06-03 (coordinates in EPSG:2180). The official national file is `https://opendata.geoportal.gov.pl/prg/adresy/PRG-punkty_adresowe.zip`.
- **Privacy:** the table stores centroids of whole postcodes, not addresses. The raw address files are never committed; keep them outside the repo (or in the gitignored `data/` folder).
- **Regenerating:** download the 16 `<voivodeship>.csv.zip` files listed in the OpenAddresses `sources/pl/*.json` definitions, then run:

  ```bash
  node scripts/build-postcode-centroids.mjs --out supabase/migrations/20260927130000_seed_postcode_centroids.sql data/*.csv.zip
  ```

  The script needs only Node and `unzip`. For other inputs (for example the official GML converted with `ogr2ogr`), see the options in the script's header comment. The migration is an idempotent upsert, but an already applied migration is not re-run by `db push`, so ship updated data in a new migration with a fresh timestamp.

## Coordinator role

The operator (the product owner) grants and revokes the coordinator role in the Supabase SQL editor (local Studio at http://localhost:54323, or the hosted dashboard). The app has no operator screen, and no client can call these functions.

```sql
select public.grant_coordinator('jan@example.com', 'operator: OPS Kraków request, 2026-09-28');
select public.revoke_coordinator('jan@example.com', 'operator: pilot ended');
```

- The note is required. Say who is acting and why, and keep personal data out of it.
- `unknown_email`: no account has that email. The user has to sign up first.
- Notice `already_coordinator` / `not_coordinator`: nothing changed and nothing was logged.
- A revoke takes effect on the user's next request.
- **Never** `insert` into or `delete` from `public.user_roles` by hand. That bypasses the append-only history in `public.coordinator_role_events`.
- History: `select e.*, u.email from public.coordinator_role_events e left join auth.users u on u.id = e.user_id order by e.occurred_at;`
- On production, a grant or revoke is a production data change. Only the operator does it.

## Local crisis-mode demo

`supabase/seed.sql` loads about 500 synthetic residents around Kraków (within about 15 km of 31-001) on every `npx supabase db reset`. The data is the same on every reset. It is **local only**: `supabase db push` never runs seeds, so production never gets it. The synthetic accounts use `@seed.skillnet.test` emails and have no password, so nobody can sign in as them.

1. Reset the local database (migrations plus the seed):

   ```bash
   npx supabase db reset
   ```

   In Studio (http://localhost:54323), the SQL editor should report 500:

   ```sql
   select count(*) from public.profiles where public.profile_is_matchable(user_id);
   ```

2. Start the app with `npm run dev`, sign up at http://localhost:4321/auth/signup, then grant yourself the role in Studio:

   ```sql
   select public.grant_coordinator('<your email>', 'local demo');
   ```

3. Open http://localhost:4321/koordynator and activate **Awaria prądu** at postcode 31-001 with a 5 km radius. Electricians and generator owners should lead the list.

   Without the UI, activate as yourself in the Studio SQL editor instead (run the whole block at once):

   ```sql
   begin;
   select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true)
   from auth.users where email = '<your email>';
   set local role authenticated;
   select public.activate_crisis('awaria-pradu', 'postcode', '31-001', null, null, 5);
   select * from public.get_crisis_matches((select id from public.crises order by activated_at desc limit 1), 20);
   commit;
   ```

4. Performance check: `scripts/perf-crisis.sql` adds 20,000 residents in a rolled-back transaction and times a 20 km activation. The target is under 1 s, with `profiles_location_idx` in the printed plan. It runs as the local superuser, because loading `auto_explain` needs it:

   ```bash
   docker exec -i supabase_db_10x-astro-starter psql -U supabase_admin -d postgres < scripts/perf-crisis.sql
   ```

## Deployment

SkillNet runs on [Cloudflare Workers](https://workers.cloudflare.com/) (Workers + static assets, not Pages) at **https://skillnet.barwy.workers.dev**.

- **Production:** every push to `master` is built and deployed by Cloudflare Workers Builds. It doesn't wait for GitHub CI, so merge through PRs after `ci` and `smoke` pass.
- **Previews:** other branches get `https://<branch>-skillnet.barwy.workers.dev`, behind Cloudflare Access. Previews carry no Supabase secrets, so auth is disabled there.
- **Manual deploy** (normally not needed):

```bash
npm run build
```

```bash
npx wrangler deploy
```

- **Secrets:** `SUPABASE_URL` and `SUPABASE_KEY` (the publishable key). Setting either one deploys a new version immediately:

```bash
npx wrangler secret bulk .dev.vars --name skillnet
```

- **Rollback:** find the last good version, then roll back to it. The next push to `master` redeploys, so revert the bad commit as well.

```bash
npx wrangler versions list --json
```

```bash
npx wrangler rollback <version-id> --message "<reason>"
```

- **Live errors:**

```bash
npx wrangler tail skillnet --format json --status error
```

The full deployment record is in `context/changes/deployment/deployment-plan.md`.

## Smoke test

`scripts/smoke.mjs` is a dependency-free Node script that walks the whole auth flow (sign-up, sign-in, protected page, sign-out) over HTTP. Run it against the dev server or the production preview after dependency upgrades:

```bash
npm run dev            # or: npm run build && npm run preview
BASE_URL=http://localhost:4321 npm run smoke
```

It needs a reachable Supabase instance (local or cloud) with email confirmation disabled.

Against production, run only the read-only steps. They create no accounts:

```bash
SMOKE_READONLY=1 BASE_URL=https://skillnet.barwy.workers.dev npm run smoke
```

It also checks the access gates (coordinator-only routes, consent gate, break-glass contact reveal) and security headers. It is a sanity check, not a substitute for the unit and pgTAP suites.

## CI

GitHub Actions runs two jobs on every push and PR to `master`:

- **ci** — lint, unit tests, `astro check` and build. Configure `SUPABASE_URL` and `SUPABASE_KEY` as repository secrets for the build step.
- **smoke** — starts a local Supabase via the Supabase CLI, runs the pgTAP suites, builds, serves the production preview on the Cloudflare runtime and runs `npm run smoke` against it. No secrets required.

GitHub Actions never deploys. Branch protection on `master` requires both jobs to pass.
