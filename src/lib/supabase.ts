import { createServerClient, parseCookieHeader } from "@supabase/ssr";
import type { AstroCookies } from "astro";
import { SUPABASE_URL, SUPABASE_KEY } from "astro:env/server";
import type { Database } from "@/db/database.types";

// Only the server reads the session, so the browser never needs it in JS (security audit S-01).
// Without HttpOnly an XSS could steal the refresh token. Browsers accept Secure on http://localhost.
const SESSION_COOKIE_OPTIONS = { httpOnly: true, secure: true, sameSite: "lax", path: "/" } as const;
// 30 days instead of the library's 400: a resident who stays away that long signs in again.
// @supabase/ssr overwrites `cookieOptions.maxAge`, so the cap is applied in setAll.
const SESSION_MAX_AGE = 30 * 24 * 60 * 60;

export function createClient(requestHeaders: Headers, cookies: AstroCookies) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return null;
  }
  return createServerClient<Database>(SUPABASE_URL, SUPABASE_KEY, {
    cookieOptions: SESSION_COOKIE_OPTIONS,
    cookies: {
      getAll() {
        return parseCookieHeader(requestHeaders.get("Cookie") ?? "");
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          // maxAge 0 deletes a cookie and must stay 0.
          const maxAge = options.maxAge ? Math.min(options.maxAge, SESSION_MAX_AGE) : options.maxAge;
          cookies.set(name, value, { ...options, maxAge });
        });
      },
    },
  });
}

/**
 * A client for public data that never reads or writes cookies, so a response built with it carries
 * no session and may be cached publicly. Calls run as anon.
 */
export function createPublicClient() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return null;
  }
  return createServerClient<Database>(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll() {
        return [];
      },
      setAll() {
        // No session to store.
      },
    },
  });
}

export type SupabaseClient = NonNullable<ReturnType<typeof createClient>>;
