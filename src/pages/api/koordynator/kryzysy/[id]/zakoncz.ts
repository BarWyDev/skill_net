import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { endCrisis } from "@/lib/services/crisis";
import { redirectWithError } from "@/lib/flash";

// The middleware gates this prefix: anonymous users go to sign-in, residents get 403, and it
// sends Cache-Control: private, no-store. end_crisis checks the role again in the database.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return context.redirect("/auth/signin");
  }

  const id = context.params.id ?? "";
  if (!UUID_RE.test(id)) {
    return redirectWithError(context, "/koordynator", "Nie znaleziono kryzysu.");
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return redirectWithError(context, "/koordynator", "Supabase nie jest skonfigurowany.");
  }

  const result = await endCrisis(supabase, id);
  if (!result.ok) {
    return redirectWithError(context, `/koordynator/kryzys/${id}`, result.message);
  }

  return result.ended
    ? context.redirect("/koordynator?ended=1")
    : redirectWithError(context, "/koordynator", "Ten kryzys został już zakończony.");
};
