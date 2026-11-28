import type { APIRoute } from "astro";
import { auth } from "@/lib/i18n/messages/auth";
import { crisis } from "@/lib/i18n/messages/crisis";
import { createClient } from "@/lib/supabase";
import { endCrisis } from "@/lib/services/crisis";
import { redirectWithError } from "@/lib/flash";

// The middleware gates this prefix: anonymous users go to sign-in, residents get 403, and it
// sends Cache-Control: private, no-store. end_crisis checks the role again in the database.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const POST: APIRoute = async (context) => {
  const { locale } = context.locals;
  const t = crisis[locale].end;
  if (!context.locals.user) {
    return context.redirect("/auth/signin");
  }

  const id = context.params.id ?? "";
  if (!UUID_RE.test(id)) {
    return redirectWithError(context, "/koordynator", t.unknown_crisis);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return redirectWithError(context, "/koordynator", auth[locale].notConfigured);
  }

  const result = await endCrisis(supabase, id, locale);
  if (!result.ok) {
    return redirectWithError(context, `/koordynator/kryzys/${id}`, result.message);
  }

  return result.ended
    ? context.redirect("/koordynator?ended=1")
    : redirectWithError(context, "/koordynator", t.alreadyEnded);
};
