// Production email settings built from the repo (roadmap S-16). Run with `npm run test:unit`.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  MANAGED_KEYS,
  SIGNIN_LIMIT_FIELD,
  TEMPLATE_KINDS,
  type Template,
  type TemplateKind,
  buildAuthConfigPatch,
  diffAuthConfig,
  parseOptions,
  readTemplateSections,
  restorePatch,
  withoutSecrets,
} from "./auth-email-config.ts";

const TOML = `
[auth.email]
enable_confirmations = false

[auth.email.template.confirmation]
subject = "Potwierdź adres e-mail w SkillNet"
content_path = "./supabase/templates/confirmation.html"

[auth.email.template.magic_link]
subject = "Twój link do logowania w SkillNet" # trailing comment
content_path = "./supabase/templates/magic_link.html"

# [auth.email.template.invite]
# subject = "You have been invited"

[auth.email.template.recovery]
subject = "Resetowanie \\"hasła\\""
content_path = "./supabase/templates/recovery.html"

[auth.sms]
enable_signup = false
`;

const TEMPLATES = Object.fromEntries(
  TEMPLATE_KINDS.map((kind) => [kind, { subject: `Temat ${kind}`, content: `<p>${kind}</p>` }]),
) as Record<TemplateKind, Template>;

test("reads the three template sections", () => {
  const sections = readTemplateSections(TOML);
  assert.deepEqual(sections.confirmation, {
    subject: "Potwierdź adres e-mail w SkillNet",
    contentPath: "./supabase/templates/confirmation.html",
  });
  assert.equal(sections.magic_link.subject, "Twój link do logowania w SkillNet");
  assert.equal(sections.recovery.subject, 'Resetowanie "hasła"');
});

test("the repo's own config.toml has all three sections", () => {
  const sections = readTemplateSections(readFileSync(new URL("../../supabase/config.toml", import.meta.url), "utf8"));
  for (const kind of TEMPLATE_KINDS) assert.match(sections[kind].contentPath, /^\.\/supabase\/templates\//);
});

test("a missing section fails loudly", () => {
  const withoutRecovery = TOML.replace("[auth.email.template.recovery]", "[auth.email.template.invite]");
  assert.throws(() => readTemplateSections(withoutRecovery), /auth\.email\.template\.recovery/);
});

test("the patch sets Resend, the limits and every template", () => {
  const patch = buildAuthConfigPatch({ templates: TEMPLATES });
  assert.equal(patch.smtp_host, "smtp.resend.com");
  assert.equal(patch.smtp_port, "465");
  assert.equal(typeof patch.smtp_port, "string");
  assert.equal(patch.smtp_admin_email, "no-reply@auth.skillnet.org.pl");
  assert.equal(patch.rate_limit_email_sent, 30);
  assert.equal(patch.rate_limit_verify, 300);
  assert.equal(patch[SIGNIN_LIMIT_FIELD], 300);
  assert.equal(patch.mailer_subjects_magic_link, "Temat magic_link");
  assert.equal(patch.mailer_templates_recovery_content, "<p>recovery</p>");
  assert.equal("smtp_pass" in patch, false);
  assert.deepEqual(Object.keys(patch).sort(), [...MANAGED_KEYS].sort());
});

test("the email rate can be raised for the paid tier and must be a whole number", () => {
  assert.equal(buildAuthConfigPatch({ templates: TEMPLATES, emailRate: 300 }).rate_limit_email_sent, 300);
  assert.throws(() => buildAuthConfigPatch({ templates: TEMPLATES, emailRate: 0 }));
  assert.throws(() => buildAuthConfigPatch({ templates: TEMPLATES, emailRate: 2.5 }));
});

test("the SMTP key is sent only when asked for, and never shown", () => {
  const patch = buildAuthConfigPatch({ templates: TEMPLATES, smtpPass: "re_secret_value" });
  assert.equal(patch.smtp_pass, "re_secret_value");
  const changes = diffAuthConfig({}, patch);
  assert.deepEqual(
    changes.find((c) => c.key === "smtp_pass"),
    { key: "smtp_pass", from: "<hidden>", to: "<set>" },
  );
  assert.equal(JSON.stringify(changes).includes("re_secret_value"), false);
  assert.throws(() => buildAuthConfigPatch({ templates: TEMPLATES, smtpPass: "" }));
});

test("template bodies show only their length in the diff", () => {
  const patch = buildAuthConfigPatch({ templates: TEMPLATES });
  const change = diffAuthConfig({ mailer_templates_confirmation_content: "<p>old</p>" }, patch).find(
    (c) => c.key === "mailer_templates_confirmation_content",
  );
  assert.deepEqual(change, {
    key: "mailer_templates_confirmation_content",
    from: "<10 chars>",
    to: "<changed, 19 chars>",
  });
});

test("nothing to do when production already matches", () => {
  const patch = buildAuthConfigPatch({ templates: TEMPLATES });
  // The API may return the port as a number.
  const current = { ...patch, smtp_port: 465, site_url: "https://skillnet.barwy.workers.dev" };
  assert.deepEqual(diffAuthConfig(current, patch), []);
});

test("a restore writes back only the managed keys, never the SMTP key", () => {
  const snapshot = {
    smtp_host: null,
    rate_limit_email_sent: 2,
    mailer_subjects_confirmation: "Confirm Your Signup",
    site_url: "http://localhost:4321",
    mailer_autoconfirm: true,
    smtp_pass: "should-never-be-here",
  };
  assert.deepEqual(restorePatch(snapshot), {
    smtp_host: null,
    rate_limit_email_sent: 2,
    mailer_subjects_confirmation: "Confirm Your Signup",
  });
});

test("the rollback snapshot drops the SMTP key", () => {
  assert.deepEqual(withoutSecrets({ smtp_host: "x", smtp_pass: "y" }), { smtp_host: "x" });
});

test("options: flags, values and typos", () => {
  assert.deepEqual(parseOptions([]), { dryRun: false, setSmtpPass: false, emailRate: 30, restore: null });
  assert.deepEqual(parseOptions(["--dry-run", "--set-smtp-pass", "--email-rate", "300"]), {
    dryRun: true,
    setSmtpPass: true,
    emailRate: 300,
    restore: null,
  });
  assert.equal(parseOptions(["--restore", "/tmp/s.json", "--dry-run"]).restore, "/tmp/s.json");
  assert.throws(() => parseOptions(["--dryrun"]), /unknown option/);
  assert.throws(() => parseOptions(["--email-rate"]), /needs a value/);
  assert.throws(() => parseOptions(["--email-rate", "abc"]));
  assert.throws(() => parseOptions(["--restore", "s.json", "--set-smtp-pass"]));
});
