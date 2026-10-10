import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { resumeMyAvailability } from "@/lib/services/profile";
import { redirectWithError } from "@/lib/flash";

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return context.redirect("/auth/signin");
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return redirectWithError(context, "/profil", "Supabase nie jest skonfigurowany.");
  }

  const result = await resumeMyAvailability(supabase);
  if (!result.ok) {
    return redirectWithError(context, "/profil", result.message);
  }

  return context.redirect("/profil?wznowiono=1");
};
