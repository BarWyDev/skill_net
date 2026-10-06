import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { resumeMyAvailability } from "@/lib/services/profile";

const errorRedirect = (message: string) => `/profil?error=${encodeURIComponent(message)}`;

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return context.redirect("/auth/signin");
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(errorRedirect("Supabase nie jest skonfigurowany."));
  }

  const result = await resumeMyAvailability(supabase);
  if (!result.ok) {
    return context.redirect(errorRedirect(result.message));
  }

  return context.redirect("/profil?wznowiono=1");
};
