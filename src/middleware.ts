import type { APIContext, MiddlewareNext } from "astro";
import { defineMiddleware } from "astro:middleware";
import { createClient } from "@/lib/supabase";
import { isCoordinator } from "@/lib/services/roles";
import { latestConsentVersion } from "@/lib/services/consent";
import { CURRENT_CONSENT_VERSION, isConsentGateExempt } from "@/lib/consent";
import { RETURN_PARAM } from "@/lib/return-path";
import { HSTS_HEADER, httpsRedirect, sendsHsts } from "@/lib/https";

const PROTECTED_ROUTES = ["/dashboard", "/profil", "/koordynator", "/api/koordynator", "/zgoda", "/api/zgoda"];
// Signed-in users without the coordinator role get a 403 here.
const COORDINATOR_ROUTES = ["/koordynator", "/api/koordynator"];
const ACCESS_DENIED_PAGE = "/brak-dostepu";
// Signed-in users without the current consent are redirected here (see isConsentGateExempt).
const CONSENT_PAGE = "/zgoda";

// Sent with every response this Worker renders (QA-028). No full CSP yet: Leaflet loads OSM
// tiles and the islands use inline styles, so only framing is restricted for now.
const SECURITY_HEADERS: [name: string, value: string][] = [
  ["Content-Security-Policy", "frame-ancestors 'none'"],
  ["X-Frame-Options", "DENY"],
  ["X-Content-Type-Options", "nosniff"],
  ["Referrer-Policy", "strict-origin-when-cross-origin"],
];

function withSecurityHeaders(response: Response, url: URL): Response {
  const headers = sendsHsts(url) ? [...SECURITY_HEADERS, HSTS_HEADER] : SECURITY_HEADERS;
  try {
    for (const [name, value] of headers) response.headers.set(name, value);
    return response;
  } catch {
    // Some responses (e.g. from Response.redirect) have immutable headers: copy them first.
    const copy = new Response(response.body, response);
    for (const [name, value] of headers) copy.headers.set(name, value);
    return copy;
  }
}

export const onRequest = defineMiddleware(async (context, next) => {
  // First, so a plain-HTTP request never reaches Supabase or gets a cookie (security audit F-10).
  // 308 keeps the method and body of a form POST.
  const secure = httpsRedirect(context.url);
  if (secure) {
    return withSecurityHeaders(new Response(null, { status: 308, headers: { Location: secure } }), context.url);
  }
  return withSecurityHeaders(await route(context, next), context.url);
});

async function route(context: APIContext, next: MiddlewareNext): Promise<Response> {
  const supabase = createClient(context.request.headers, context.cookies);
  context.locals.user = null;
  context.locals.isCoordinator = false;
  context.locals.needsConsent = false;

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    context.locals.user = user ?? null;

    if (user) {
      // Both lookups run in parallel, so a signed-in request still costs one round trip.
      const [coordinator, consentVersion] = await Promise.allSettled([
        isCoordinator(supabase),
        latestConsentVersion(supabase),
      ]);
      // Fail closed: a lookup error (migration not pushed, Supabase down) never grants the role.
      context.locals.isCoordinator = coordinator.status === "fulfilled" && coordinator.value;
      // Fail open: a lookup error never gates. Otherwise a missing RPC would send everyone to a
      // /zgoda page whose accept fails too. Matching enforces consent in the database regardless.
      context.locals.needsConsent =
        consentVersion.status === "fulfilled" && consentVersion.value !== CURRENT_CONSENT_VERSION;
    }
  }

  const path = context.url.pathname;

  if (PROTECTED_ROUTES.some((route) => path.startsWith(route)) && !context.locals.user) {
    // A page remembers where the visitor was going; an endpoint cannot be returned to.
    const back =
      (context.request.method === "GET" || context.request.method === "HEAD") && !path.startsWith("/api/")
        ? `?${RETURN_PARAM}=${encodeURIComponent(path)}`
        : "";
    return context.redirect(`/auth/signin${back}`);
  }

  if (context.locals.needsConsent && !isConsentGateExempt(path)) {
    return context.redirect(CONSENT_PAGE);
  }
  // Nothing to accept: going home avoids writing a duplicate consent row.
  if (context.locals.user && !context.locals.needsConsent && path === CONSENT_PAGE) {
    return context.redirect("/");
  }

  if (!COORDINATOR_ROUTES.some((route) => path.startsWith(route))) {
    return next();
  }

  // next(path) renders the denial page in place without re-running this middleware,
  // so the URL stays put and the page sets the 403 status itself.
  const response = context.locals.isCoordinator ? await next() : await next(ACCESS_DENIED_PAGE);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
