// Throttle for the auth form endpoints (security audit F-09). The Worker calls Supabase Auth, so its
// per-IP limits see Cloudflare's egress addresses, not visitors: one attacker spread across them is
// not slowed, and residents sharing one can lock each other out. Two Workers rate-limiting bindings
// (wrangler.jsonc) count the real visitor instead:
//
//   * AUTH_IP_LIMITER: every auth POST, keyed on the visitor's address (`cf-connecting-ip`);
//   * AUTH_ACCOUNT_LIMITER: per endpoint and email address (hashed), so one account cannot be
//     guessed or mail-bombed from many addresses.
//
// Cloudflare's limits are per location and eventually consistent: a ceiling, not an exact count.
// A request without `cf-connecting-ip`, or with a loopback one (local workerd sets it), did not come
// through Cloudflare's edge, so nothing is limited: local development and the CI smoke test stay
// deterministic. A missing binding or a failing call never blocks a sign-in (fail open).
// Relative imports only, so `node:test` can load it.

export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface AuthLimiters {
  ip?: RateLimiter;
  account?: RateLimiter;
}

/** The POST endpoints the throttle covers. Each takes credentials or sends an email. */
export const THROTTLED_AUTH_PATHS: readonly string[] = [
  "/api/auth/signin",
  "/api/auth/signup",
  "/api/auth/resend",
  "/api/auth/unregister",
];

/** Where a throttled request is sent: a page that explains the wait. */
export const THROTTLED_PAGE = "/auth/zbyt-wiele-prob";

// What local workerd puts in `cf-connecting-ip`. Cloudflare's edge never sends these.
const LOOPBACK = new Set(["127.0.0.1", "::1"]);

/** A key for the account limiter that never holds the address itself. */
export async function accountKey(path: string, email: string): Promise<string> {
  const data = new TextEncoder().encode(email.trim().toLowerCase());
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  const hex = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${path}:${hex}`;
}

async function allowed(limiter: RateLimiter | undefined, key: string): Promise<boolean> {
  if (!limiter) return true;
  try {
    return (await limiter.limit({ key })).success;
  } catch {
    return true;
  }
}

/**
 * Whether this request is over a limit. Reads the email from a clone of the body, so the endpoint
 * still gets the original.
 */
export async function authThrottled(request: Request, path: string, limiters: AuthLimiters): Promise<boolean> {
  if (request.method !== "POST" || !THROTTLED_AUTH_PATHS.includes(path)) return false;

  const visitor = request.headers.get("cf-connecting-ip");
  if (!visitor || LOOPBACK.has(visitor)) return false;

  if (!(await allowed(limiters.ip, `ip:${visitor}`))) return true;

  let email: FormDataEntryValue | null = null;
  try {
    email = (await request.clone().formData()).get("email");
  } catch {
    // Not a form: the endpoint refuses it on its own.
  }
  if (typeof email !== "string" || email.trim() === "") return false;

  return !(await allowed(limiters.account, await accountKey(path, email)));
}
