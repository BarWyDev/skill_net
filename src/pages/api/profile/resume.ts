import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { resumeMyAvailability } from "@/lib/services/profile";
import { redirectWithError } from "@/lib/flash";
import { auth } from "@/lib/i18n/messages/auth";

export const POST: APIRoute = async (context) => {
  const { locale } = context.locals;
  if (!context.locals.user) {
    return context.redirect("/auth/signin");
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return redirectWithError(context, "/profil", auth[locale].notConfigured);
  }

  const result = await resumeMyAvailability(supabase, locale);
  if (!result.ok) {
    return redirectWithError(context, "/profil", result.message);
  }

  return context.redirect("/profil?wznowiono=1");
};
