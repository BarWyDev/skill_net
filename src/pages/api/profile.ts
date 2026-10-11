import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { saveMyProfile } from "@/lib/services/profile";
import { parseProfileForm } from "@/lib/validation/profile";
import { redirectWithError } from "@/lib/flash";

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return context.redirect("/auth/signin");
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return redirectWithError(context, "/profil", "Supabase nie jest skonfigurowany.");
  }

  const parsed = parseProfileForm(await context.request.formData());
  if (!parsed.success) {
    return redirectWithError(context, "/profil", parsed.message);
  }

  const result = await saveMyProfile(supabase, parsed.data);
  if (!result.ok) {
    return redirectWithError(context, "/profil", result.message);
  }

  return context.redirect("/profil?zapisano=1");
};
