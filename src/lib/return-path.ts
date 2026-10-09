// The `powrot` parameter: where sign-in sends the user back to (QA-005). Only a path on this
// site is accepted, never another origin, so it cannot become an open redirect. Relative imports
// only, so `node:test` can load it.

export const RETURN_PARAM = "powrot";

const MAX_LENGTH = 512;

/** Returns the path (with query) when it stays on this site, otherwise null. */
export function safeReturnPath(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_LENGTH) return null;
  // `//host` and `/\host` are protocol-relative in browsers; control characters can smuggle either.
  let hasControl = false;
  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) hasControl = true;
  }
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\") || hasControl) return null;
  const base = "https://skillnet.invalid";
  let url: URL;
  try {
    url = new URL(raw, base);
  } catch {
    return null;
  }
  if (url.origin !== base) return null;
  // Never back to the auth pages or an endpoint: that would loop or POST-only 404.
  if (url.pathname.startsWith("/auth/") || url.pathname.startsWith("/api/")) return null;
  return `${url.pathname}${url.search}`;
}
