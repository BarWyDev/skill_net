import type { APIRoute } from "astro";
import { auth } from "@/lib/i18n/messages/auth";
import { createClient } from "@/lib/supabase";
import { activateCrisis } from "@/lib/services/crisis";
import { parseCrisisForm } from "@/lib/validation/crisis";
import { redirectWithError } from "@/lib/flash";

// The middleware gates this prefix: anonymous users go to sign-in, residents get 403.
// activate_crisis checks the role again in the database.

export const POST: APIRoute = async (context) => {
  const { locale } = context.locals;
  if (!context.locals.user) {
    return context.redirect("/auth/signin");
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return redirectWithError(context, "/koordynator", auth[locale].notConfigured);
  }

  const parsed = parseCrisisForm(await context.request.formData(), locale);
  if (!parsed.success) {
    return redirectWithError(context, "/koordynator", parsed.message);
  }

  const result = await activateCrisis(supabase, parsed.data, locale);
  if (!result.ok) {
    return redirectWithError(context, "/koordynator", result.message);
  }

  return context.redirect(`/koordynator/kryzys/${result.id}`);
};
