// Production's email settings, built from the repo (roadmap S-16). `scripts/auth-email-config.mjs`
// fetches the hosted project's auth config through the Supabase Management API, diffs it against
// what this module builds from `supabase/config.toml` and the templates, and PATCHes the difference.
// `supabase config push` is not an option: it would also push local-only values (site_url,
// enable_confirmations). Relative imports only, so `node:test` and the script can load it.

export const TEMPLATE_KINDS = ["confirmation", "magic_link", "recovery"] as const;
export type TemplateKind = (typeof TEMPLATE_KINDS)[number];

export interface TemplateSection {
  subject: string;
  contentPath: string;
}

export interface Template {
  subject: string;
  content: string;
}

export type AuthConfig = Record<string, unknown>;

/** Resend's free tier sends 100 emails a day; 30 an hour keeps a bot burst from using them all. */
export const DEFAULT_EMAIL_RATE = 30;

// Supabase counts its per-IP limits against the Worker's egress addresses, which many residents
// share, so they are raised; the app's AUTH_IP_LIMITER counts the real visitor (auth-throttle.ts).
const PER_IP_LIMIT = 300;

// The dashboard's "sign ups and sign ins" limit. The Management API docs don't name its field:
// before the first apply, change it once in the dashboard and check which key moved in the dry run.
export const SIGNIN_LIMIT_FIELD = "rate_limit_otp";

const SMTP = {
  smtp_host: "smtp.resend.com",
  // The Management API takes the port as a string.
  smtp_port: "465",
  smtp_user: "resend",
  smtp_admin_email: "no-reply@auth.skillnet.org.pl",
  smtp_sender_name: "SkillNet",
};

const subjectKey = (kind: TemplateKind) => `mailer_subjects_${kind}`;
const contentKey = (kind: TemplateKind) => `mailer_templates_${kind}_content`;

/** Every key this tool writes, apart from smtp_pass. A restore touches these and nothing else. */
export const MANAGED_KEYS: readonly string[] = [
  ...Object.keys(SMTP),
  "rate_limit_email_sent",
  "rate_limit_verify",
  SIGNIN_LIMIT_FIELD,
  ...TEMPLATE_KINDS.flatMap((kind) => [subjectKey(kind), contentKey(kind)]),
];

const SECTION_RE = /^\[auth\.email\.template\.([a-z_]+)\]\s*(#.*)?$/;
const KEY_RE = /^(subject|content_path)\s*=\s*("(?:[^"\\]|\\.)*")\s*(#.*)?$/;

/**
 * The subject and template file of each auth email, from `supabase/config.toml`. A minimal reader
 * for these sections only (basic strings, one key per line). Throws when one is missing.
 */
export function readTemplateSections(toml: string): Record<TemplateKind, TemplateSection> {
  const found: Partial<Record<string, Partial<TemplateSection>>> = {};
  let current: string | null = null;
  for (const raw of toml.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("[")) {
      current = SECTION_RE.exec(line)?.[1] ?? null;
      if (current) found[current] = {};
      continue;
    }
    const match = current ? KEY_RE.exec(line) : null;
    if (!match || !current) continue;
    const value = JSON.parse(match[2]) as string;
    const section = found[current] ?? {};
    if (match[1] === "subject") section.subject = value;
    else section.contentPath = value;
    found[current] = section;
  }

  const sections = {} as Record<TemplateKind, TemplateSection>;
  for (const kind of TEMPLATE_KINDS) {
    const section = found[kind];
    if (!section?.subject || !section.contentPath) {
      throw new Error(`config.toml: [auth.email.template.${kind}] needs a subject and a content_path`);
    }
    sections[kind] = { subject: section.subject, contentPath: section.contentPath };
  }
  return sections;
}

export interface PatchInput {
  templates: Record<TemplateKind, Template>;
  emailRate?: number;
  /** Sent only on the first run and after a key rotation: the API never shows the stored key. */
  smtpPass?: string;
}

/** The PATCH body for `/v1/projects/{ref}/config/auth`. */
export function buildAuthConfigPatch({ templates, emailRate = DEFAULT_EMAIL_RATE, smtpPass }: PatchInput): AuthConfig {
  if (!Number.isInteger(emailRate) || emailRate < 1) {
    throw new Error(`email rate must be a whole number of at least 1, got ${emailRate}`);
  }
  const patch: AuthConfig = {
    ...SMTP,
    rate_limit_email_sent: emailRate,
    rate_limit_verify: PER_IP_LIMIT,
    [SIGNIN_LIMIT_FIELD]: PER_IP_LIMIT,
  };
  for (const kind of TEMPLATE_KINDS) {
    patch[subjectKey(kind)] = templates[kind].subject;
    patch[contentKey(kind)] = templates[kind].content;
  }
  if (smtpPass !== undefined) {
    if (smtpPass === "") throw new Error("the SMTP key is empty");
    patch.smtp_pass = smtpPass;
  }
  return patch;
}

/** The patch restricted to the managed keys a snapshot holds. Never smtp_pass. */
export function restorePatch(snapshot: AuthConfig): AuthConfig {
  const patch: AuthConfig = {};
  for (const key of MANAGED_KEYS) {
    if (key in snapshot) patch[key] = snapshot[key];
  }
  return patch;
}

/** The current config without the SMTP key, safe to write to disk for a rollback. */
export function withoutSecrets(config: AuthConfig): AuthConfig {
  const { smtp_pass: _omitted, ...rest } = config;
  return rest;
}

export interface Change {
  key: string;
  from: string;
  to: string;
}

const isTemplate = (key: string) => key.startsWith("mailer_templates_");

function show(key: string, value: unknown): string {
  if (value === undefined || value === null) return "<none>";
  if (isTemplate(key) && typeof value === "string") return `<${value.length} chars>`;
  return JSON.stringify(value);
}

function same(a: unknown, b: unknown): boolean {
  // The API has returned smtp_port both as a number and as a string.
  if ((typeof a === "number" || typeof a === "string") && (typeof b === "number" || typeof b === "string")) {
    return String(a) === String(b);
  }
  return a === b;
}

/** What the patch would change. Template bodies show only their length; the SMTP key shows as set. */
export function diffAuthConfig(current: AuthConfig, patch: AuthConfig): Change[] {
  const changes: Change[] = [];
  for (const [key, to] of Object.entries(patch)) {
    if (key === "smtp_pass") {
      changes.push({ key, from: "<hidden>", to: "<set>" });
      continue;
    }
    const from = current[key];
    if (same(from, to)) continue;
    changes.push({
      key,
      from: show(key, from),
      to: isTemplate(key) && typeof to === "string" ? `<changed, ${to.length} chars>` : show(key, to),
    });
  }
  return changes;
}

export interface Options {
  dryRun: boolean;
  setSmtpPass: boolean;
  emailRate: number;
  restore: string | null;
}

/** The script's flags. Throws on anything it doesn't know, so a typo never applies a default. */
export function parseOptions(argv: readonly string[]): Options {
  const options: Options = { dryRun: false, setSmtpPass: false, emailRate: DEFAULT_EMAIL_RATE, restore: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--set-smtp-pass") options.setSmtpPass = true;
    else if (arg === "--email-rate" || arg === "--restore") {
      const value = argv.at(++i);
      if (value === undefined || value.startsWith("--")) throw new Error(`${arg} needs a value`);
      if (arg === "--restore") options.restore = value;
      else {
        if (!/^\d+$/.test(value) || Number(value) < 1) throw new Error(`--email-rate needs a whole number ≥ 1`);
        options.emailRate = Number(value);
      }
    } else throw new Error(`unknown option ${arg}`);
  }
  if (options.restore && (options.setSmtpPass || options.emailRate !== DEFAULT_EMAIL_RATE)) {
    throw new Error("--restore takes no other option than --dry-run");
  }
  return options;
}
