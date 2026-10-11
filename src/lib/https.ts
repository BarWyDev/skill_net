// HTTPS only (security audit F-10). `*.workers.dev` answers plain HTTP too. Browsers never use it
// (`.dev` is HSTS-preloaded), but other clients and embedded webviews can, so the middleware sends
// every plain-HTTP request to HTTPS before doing anything else, and HTTPS responses carry HSTS.
// Local hosts stay on HTTP: `npm run dev` and `npm run preview` serve no TLS. Relative imports only,
// so `node:test` can load it.

// Two years, the HSTS preload list's recommendation. The app's own host has no subdomains today, and
// `includeSubDomains` keeps any future one HTTPS too.
export const HSTS_HEADER: [name: string, value: string] = [
  "Strict-Transport-Security",
  "max-age=63072000; includeSubDomains",
];

function isLocalHost(hostname: string): boolean {
  return (
    hostname === "localhost" || hostname.endsWith(".localhost") || hostname === "127.0.0.1" || hostname === "[::1]"
  );
}

/** The HTTPS address to send a plain-HTTP request to, or null when it may stay. */
export function httpsRedirect(url: URL): string | null {
  if (url.protocol !== "http:" || isLocalHost(url.hostname)) return null;
  const secure = new URL(url);
  secure.protocol = "https:";
  secure.port = "";
  return secure.toString();
}

/** Whether a response to this URL should carry HSTS. Browsers ignore it over plain HTTP anyway. */
export function sendsHsts(url: URL): boolean {
  return url.protocol === "https:";
}
