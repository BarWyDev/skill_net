// Staging database commands (change staging-and-domain). scripts/db-staging.mjs runs them; the logic
// lives here so it has unit tests. The production-ref check is the only guard between a typo in
// .staging-db-url and pushing seed data to production, so every path that can reach the CLI goes
// through checkStagingUrl first.

export const PRODUCTION_REF = "grbhvhfwwjmzmrbzpxzu";

export const COMMANDS = {
  status: ["migration", "list"],
  push: ["db", "push"],
  seed: ["db", "push", "--include-seed"],
  reset: ["db", "reset"],
} as const;

export type StagingCommand = keyof typeof COMMANDS;

const REF = /^[a-z0-9]{20}$/;

// The project ref from a Supabase connection string: the pooler user `postgres.<ref>` or the direct
// host `db.<ref>.supabase.co`. Null when neither is there or the URL does not parse.
export function parseProjectRef(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") return null;
  const user = decodeURIComponent(url.username);
  if (user.startsWith("postgres.")) {
    const ref = user.slice("postgres.".length);
    return REF.test(ref) ? ref : null;
  }
  const host = /^db\.([a-z0-9]{20})\.supabase\.co$/.exec(url.hostname);
  return host ? host[1] : null;
}

export type UrlCheck = { ok: true; ref: string } | { ok: false; reason: string };

// Refuses an empty URL, one without a parsable ref, and one that points at a production ref. The
// production ref is also refused when it appears anywhere in the string, so an odd URL shape
// can't slip past the parser. Reasons are in Polish and never contain the URL.
export function checkStagingUrl(raw: string, productionRefs: readonly string[]): UrlCheck {
  const url = raw.trim();
  if (!url) return { ok: false, reason: "plik .staging-db-url jest pusty." };
  if (productionRefs.some((ref) => ref && url.includes(ref))) {
    return {
      ok: false,
      reason: "adres w .staging-db-url wskazuje na projekt produkcyjny. Nic nie zostało uruchomione.",
    };
  }
  const ref = parseProjectRef(url);
  if (!ref) {
    return {
      ok: false,
      reason:
        "nie umiem odczytać ref projektu z adresu w .staging-db-url. Wklej connection string z Supabase " +
        "(Session pooler, port 5432) z hasłem zakodowanym procentowo.",
    };
  }
  return { ok: true, ref };
}

export function isStagingCommand(value: string | undefined): value is StagingCommand {
  return value !== undefined && Object.hasOwn(COMMANDS, value);
}

// The Supabase CLI arguments for a command, with extra args (e.g. --dry-run) passed through.
export function cliArgs(command: StagingCommand, url: string, extra: readonly string[]): string[] {
  return ["supabase", ...COMMANDS[command], "--db-url", url.trim(), ...extra];
}
