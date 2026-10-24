// Pushes production's email settings from the repo (roadmap S-16): Resend SMTP, the email and
// per-IP rate limits, and the Polish subjects and templates from supabase/config.toml. Zero
// dependencies on purpose; the logic lives in src/lib/auth-email-config.ts, which has unit tests.
//
//   npm run auth:email-config -- --dry-run                 show what would change, change nothing
//   npm run auth:email-config -- --set-smtp-pass           also send RESEND_SMTP_KEY (first run, rotation)
//   npm run auth:email-config -- --email-rate 300          after switching Resend to Pro
//   npm run auth:email-config -- --restore <snapshot.json> put back the managed keys from a snapshot
//
// Needs SUPABASE_PROJECT_REF and SUPABASE_ACCESS_TOKEN (a personal access token) in the environment.
// Every apply is a production change: it asks for the project ref first and saves the current config,
// without the SMTP key, to $TMPDIR for a rollback. Secrets are never printed.

import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";

import {
  TEMPLATE_KINDS,
  buildAuthConfigPatch,
  diffAuthConfig,
  parseOptions,
  readTemplateSections,
  restorePatch,
  withoutSecrets,
} from "../src/lib/auth-email-config.ts";

const ROOT = resolve(import.meta.dirname, "..");
const API = "https://api.supabase.com/v1/projects";

function fail(message) {
  console.error(`auth-email-config: ${message}`);
  process.exit(1);
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) fail(`${name} is not set`);
  return value;
}

async function api(method, ref, token, body) {
  const response = await fetch(`${API}/${ref}/config/auth`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    // The error body is Supabase's message about the request, not config values.
    fail(`${method} config/auth answered ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }
  return response.json();
}

function buildPatch(options) {
  if (options.restore) {
    return restorePatch(JSON.parse(readFileSync(resolve(options.restore), "utf8")));
  }
  // content_path resolves from the project root, as the Supabase CLI does.
  const sections = readTemplateSections(readFileSync(join(ROOT, "supabase/config.toml"), "utf8"));
  const templates = Object.fromEntries(
    TEMPLATE_KINDS.map((kind) => [
      kind,
      { subject: sections[kind].subject, content: readFileSync(resolve(ROOT, sections[kind].contentPath), "utf8") },
    ]),
  );
  return buildAuthConfigPatch({
    templates,
    emailRate: options.emailRate,
    smtpPass: options.setSmtpPass ? requireEnv("RESEND_SMTP_KEY") : undefined,
  });
}

let options;
try {
  options = parseOptions(process.argv.slice(2));
} catch (error) {
  fail(error.message);
}

const ref = requireEnv("SUPABASE_PROJECT_REF");
const token = requireEnv("SUPABASE_ACCESS_TOKEN");

let patch;
try {
  patch = buildPatch(options);
} catch (error) {
  fail(error.message);
}

const current = await api("GET", ref, token);
const changes = diffAuthConfig(current, patch);

console.log(`Project ${ref}${options.restore ? `, restoring from ${options.restore}` : ""}`);
if (changes.length === 0) {
  console.log("No changes: production already matches.");
  process.exit(0);
}
for (const { key, from, to } of changes) console.log(`  ${key}: ${from} -> ${to}`);
console.log(
  `Unchanged and not managed here: site_url ${JSON.stringify(current.site_url)}, mailer_autoconfirm ${current.mailer_autoconfirm}, mailer_otp_exp ${current.mailer_otp_exp}`,
);

if (options.dryRun) {
  console.log("Dry run: nothing applied.");
  process.exit(0);
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
const answer = await rl.question(`This changes PRODUCTION. Type the project ref (${ref}) to apply: `);
rl.close();
if (answer.trim() !== ref) fail("not confirmed, nothing applied");

const snapshot = join(tmpdir(), `auth-config-before-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
writeFileSync(snapshot, JSON.stringify(withoutSecrets(current), null, 2), { mode: 0o600 });
console.log(`Saved the current config, without the SMTP key, to ${snapshot}`);

const changed = Object.fromEntries(changes.map(({ key }) => [key, patch[key]]));
const updated = await api("PATCH", ref, token, changed);
const remaining = diffAuthConfig(updated, withoutSecrets(changed));
if (remaining.length > 0) {
  fail(`applied, but these keys still differ: ${remaining.map((c) => c.key).join(", ")}`);
}
console.log(`Applied ${changes.length} change(s). Roll back with: npm run auth:email-config -- --restore ${snapshot}`);
