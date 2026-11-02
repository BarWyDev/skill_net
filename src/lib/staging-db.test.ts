// Staging database guard (change staging-and-domain). Run with `npm run test:unit`.

import assert from "node:assert/strict";
import { test } from "node:test";

import { PRODUCTION_REF, checkStagingUrl, cliArgs, isStagingCommand, parseProjectRef } from "./staging-db.ts";

const STAGING = "abcdefghijklmnopqrst";
const POOLER = `postgresql://postgres.${STAGING}:p%40ss@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`;
const DIRECT = `postgresql://postgres:p%40ss@db.${STAGING}.supabase.co:5432/postgres`;
const PROD = [PRODUCTION_REF];

test("parseProjectRef reads the pooler user and the direct host", () => {
  assert.equal(parseProjectRef(POOLER), STAGING);
  assert.equal(parseProjectRef(DIRECT), STAGING);
  assert.equal(parseProjectRef(`postgres://postgres.${STAGING}:x@host:6543/postgres`), STAGING);
});

test("parseProjectRef returns null for other shapes", () => {
  assert.equal(parseProjectRef("postgresql://postgres:x@localhost:54322/postgres"), null);
  assert.equal(parseProjectRef("https://abcdefghijklmnopqrst.supabase.co"), null);
  assert.equal(parseProjectRef("postgresql://postgres.short:x@host/postgres"), null);
  assert.equal(parseProjectRef("not a url"), null);
});

test("checkStagingUrl accepts a staging URL and trims it", () => {
  assert.deepEqual(checkStagingUrl(`  ${POOLER}\n`, PROD), { ok: true, ref: STAGING });
});

test("checkStagingUrl refuses an empty file", () => {
  const result = checkStagingUrl(" \n", PROD);
  assert.equal(result.ok, false);
});

test("checkStagingUrl refuses production in every shape", () => {
  for (const url of [
    `postgresql://postgres.${PRODUCTION_REF}:x@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`,
    `postgresql://postgres:x@db.${PRODUCTION_REF}.supabase.co:5432/postgres`,
    `postgresql://someone:x@host/${PRODUCTION_REF}`,
  ]) {
    const result = checkStagingUrl(url, PROD);
    if (result.ok) assert.fail(url);
    assert.match(result.reason, /produkcyjny/);
  }
});

test("checkStagingUrl refuses a linked ref other than the hard-coded one", () => {
  assert.equal(checkStagingUrl(POOLER, [PRODUCTION_REF, STAGING]).ok, false);
});

test("checkStagingUrl refuses a URL without a ref and never echoes it", () => {
  const url = "postgresql://postgres:secret-pass@localhost:5432/postgres";
  const result = checkStagingUrl(url, PROD);
  if (result.ok) assert.fail(url);
  assert.doesNotMatch(result.reason, /secret-pass/);
});

test("isStagingCommand knows the four commands only", () => {
  for (const command of ["status", "push", "seed", "reset"]) assert.ok(isStagingCommand(command));
  for (const command of [undefined, "", "toString", "deploy"]) assert.equal(isStagingCommand(command), false);
});

test("cliArgs maps commands and passes extra args through", () => {
  assert.deepEqual(cliArgs("status", POOLER, []), ["supabase", "migration", "list", "--db-url", POOLER]);
  assert.deepEqual(cliArgs("push", ` ${POOLER} `, ["--dry-run"]), [
    "supabase",
    "db",
    "push",
    "--db-url",
    POOLER,
    "--dry-run",
  ]);
  assert.deepEqual(cliArgs("seed", POOLER, []), ["supabase", "db", "push", "--include-seed", "--db-url", POOLER]);
  assert.deepEqual(cliArgs("reset", POOLER, []), ["supabase", "db", "reset", "--db-url", POOLER]);
});
