// One-shot error notices for form POSTs (security audit F-06). An endpoint used to redirect with
// the Polish message in `?error=`, so any link could put its own text in the red alert box. Now the
// message travels in a short-lived httpOnly cookie that only this server sets, scoped to the page
// it is meant for, and the page reads it once and deletes it. Relative imports only, so `node:test`
// can load it.

import type { AstroCookies } from "astro";

export const FLASH_COOKIE = "skillnet_flash";

// Long enough for the redirect, short enough that a notice never surfaces on a later visit.
const MAX_AGE_SECONDS = 60;

// Every notice is our own text and far shorter; anything longer is not ours.
const MAX_MESSAGE_LENGTH = 500;

/** The cookie value: the page the notice is for, and the message. */
export function encodeFlash(pathname: string, message: string): string {
  return JSON.stringify({ p: pathname, m: message });
}

/** The message, when the value is well formed and meant for `pathname`; otherwise null. */
export function decodeFlash(raw: string, pathname: string): string | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const { p, m } = value as { p?: unknown; m?: unknown };
  if (p !== pathname || typeof m !== "string") return null;
  if (m === "" || m.length > MAX_MESSAGE_LENGTH) return null;
  return m;
}

interface RedirectContext {
  url: URL;
  cookies: AstroCookies;
  redirect: (path: string) => Response;
}

/** Redirects to `location` (a same-site path) and leaves `message` for that page to show once. */
export function redirectWithError(context: RedirectContext, location: string, message: string): Response {
  const { pathname } = new URL(location, context.url);
  context.cookies.set(FLASH_COOKIE, encodeFlash(pathname, message), {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: context.url.protocol === "https:",
    maxAge: MAX_AGE_SECONDS,
  });
  return context.redirect(location);
}

/** The notice left for this page, if any. Deletes the cookie, so a reload shows nothing. */
export function takeFlashError(context: { url: URL; cookies: AstroCookies }): string | null {
  const raw = context.cookies.get(FLASH_COOKIE)?.value;
  if (raw === undefined) return null;
  context.cookies.delete(FLASH_COOKIE, { path: "/" });
  return decodeFlash(raw, context.url.pathname);
}
