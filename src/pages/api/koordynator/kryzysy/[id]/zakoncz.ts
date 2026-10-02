import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { endCrisis } from "@/lib/services/crisis";

// The middleware gates this prefix: anonymous users go to sign-in, residents get 403, and it
// sends Cache-Control: private, no-store. end_crisis checks the role again in the database.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const panelError = (message: string) => `/koordynator?error=${encodeURIComponent(message)}`;

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return context.redirect("/auth/signin");
  }

  const id = context.params.id ?? "";
  if (!UUID_RE.test(id)) {
    return context.redirect(panelError("Nie znaleziono kryzysu."));
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(panelError("Supabase nie jest skonfigurowany."));
  }

  const result = await endCrisis(supabase, id);
  if (!result.ok) {
    return context.redirect(`/koordynator/kryzys/${id}?error=${encodeURIComponent(result.message)}`);
  }

  return context.redirect(result.ended ? "/koordynator?ended=1" : panelError("Ten kryzys został już zakończony."));
};
