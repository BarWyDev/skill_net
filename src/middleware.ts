import { defineMiddleware } from "astro:middleware";
import { createClient } from "@/lib/supabase";
import { isCoordinator } from "@/lib/services/roles";

const PROTECTED_ROUTES = ["/dashboard", "/profil", "/koordynator", "/api/koordynator"];
// Signed-in users without the coordinator role get a 403 here.
const COORDINATOR_ROUTES = ["/koordynator", "/api/koordynator"];
const ACCESS_DENIED_PAGE = "/brak-dostepu";

export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = createClient(context.request.headers, context.cookies);
  context.locals.user = null;
  context.locals.isCoordinator = false;

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    context.locals.user = user ?? null;

    if (user) {
      try {
        context.locals.isCoordinator = await isCoordinator(supabase);
      } catch {
        // Fail closed: a lookup error (migration not pushed, Supabase down) never grants the role.
      }
    }
  }

  const path = context.url.pathname;

  if (PROTECTED_ROUTES.some((route) => path.startsWith(route)) && !context.locals.user) {
    return context.redirect("/auth/signin");
  }

  if (!COORDINATOR_ROUTES.some((route) => path.startsWith(route))) {
    return next();
  }

  // next(path) renders the denial page in place without re-running this middleware,
  // so the URL stays put and the page sets the 403 status itself.
  const response = context.locals.isCoordinator ? await next() : await next(ACCESS_DENIED_PAGE);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
});
