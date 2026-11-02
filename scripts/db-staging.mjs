// Runs Supabase CLI commands against the staging database only (change staging-and-domain). Zero
// dependencies on purpose; the guard lives in src/lib/staging-db.ts, which has unit tests.
//
//   npm run db:status:staging                 local vs staging migrations
//   npm run db:push:staging -- --dry-run      show what would be pushed
//   npm run db:push:staging                   push migrations to staging
//   npm run db:seed:staging                   push migrations plus supabase/seed.sql
//   npm run db:reset:staging                  wipe staging and replay migrations and seed
//
// Reads the connection string from the gitignored .staging-db-url at the repo root and refuses to run
// when it points at production. The CLI runs without a shell, so the password stays out of shell
// history. The URL is never printed.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { PRODUCTION_REF, checkStagingUrl, cliArgs, isStagingCommand } from "../src/lib/staging-db.ts";

const ROOT = resolve(import.meta.dirname, "..");
const URL_FILE = join(ROOT, ".staging-db-url");
const LINKED_REF_FILE = join(ROOT, "supabase/.temp/project-ref");

function fail(message) {
  console.error(`db-staging: ${message}`);
  process.exit(1);
}

const [command, ...extra] = process.argv.slice(2);
if (!isStagingCommand(command)) fail("użycie: node scripts/db-staging.mjs <status|push|seed|reset> [flagi CLI]");

if (!existsSync(URL_FILE)) {
  fail(
    "brak pliku .staging-db-url w katalogu repozytorium. Wklej do niego connection string projektu skillnet-staging.",
  );
}

// The linked project is production (CLAUDE.md, Deploy), so its ref is refused too.
const productionRefs = [PRODUCTION_REF];
if (existsSync(LINKED_REF_FILE)) productionRefs.push(readFileSync(LINKED_REF_FILE, "utf8").trim());

const url = readFileSync(URL_FILE, "utf8");
const check = checkStagingUrl(url, productionRefs);
if (!check.ok) fail(check.reason);

console.log(`db-staging: ${command} na projekcie staging ${check.ref}`);
const result = spawnSync("npx", cliArgs(command, url, extra), { cwd: ROOT, stdio: "inherit" });
if (result.error) fail(`nie udało się uruchomić Supabase CLI: ${result.error.message}`);
process.exit(result.status ?? 1);
