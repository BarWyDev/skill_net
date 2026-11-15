// One production address (change staging-and-domain, Phase 7). Production answers on three hosts:
// the apex, `www` and the original `workers.dev` address. The last two send every request to the
// apex, keeping the path and query, so links, cookies and Supabase redirects all use one origin.
// Matching is by exact host, never by suffix: branch previews end in `-skillnet.barwy.workers.dev`
// and must keep serving themselves. Relative imports only, so `node:test` can load it.

export const CANONICAL_ORIGIN = "https://skillnet.org.pl";

const REDIRECTED_HOSTS = new Set(["skillnet.barwy.workers.dev", "www.skillnet.org.pl"]);

export interface CanonicalRedirect {
  location: string;
  status: 301 | 308;
}

/**
 * Where to send a request that reached production on a non-canonical host, or null when it may
 * stay. GET and HEAD get a 301; other methods get a 308, which keeps the method and body.
 */
export function canonicalRedirect(url: URL, method: string): CanonicalRedirect | null {
  if (!REDIRECTED_HOSTS.has(url.hostname)) return null;
  const target = new URL(url.pathname + url.search, CANONICAL_ORIGIN);
  const safe = method === "GET" || method === "HEAD";
  return { location: target.toString(), status: safe ? 301 : 308 };
}
