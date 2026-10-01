import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { activateCrisis } from "@/lib/services/crisis";
import { parseCrisisForm } from "@/lib/validation/crisis";

// The middleware gates this prefix: anonymous users go to sign-in, residents get 403.
// activate_crisis checks the role again in the database.

const errorRedirect = (message: string) => `/koordynator?error=${encodeURIComponent(message)}`;

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return context.redirect("/auth/signin");
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(errorRedirect("Supabase nie jest skonfigurowany."));
  }

  const parsed = parseCrisisForm(await context.request.formData());
  if (!parsed.success) {
    return context.redirect(errorRedirect(parsed.message));
  }

  const result = await activateCrisis(supabase, parsed.data);
  if (!result.ok) {
    return context.redirect(errorRedirect(result.message));
  }

  return context.redirect(`/koordynator/kryzys/${result.id}`);
};
