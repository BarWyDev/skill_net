import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { isProfileMatchable } from "@/lib/services/profile";
import { authErrorMessage } from "@/lib/auth-errors";

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const email = form.get("email") as string;
  const password = form.get("password") as string;

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/auth/signin?error=${encodeURIComponent("Supabase nie jest skonfigurowany.")}`);
  }
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return context.redirect(`/auth/signin?error=${encodeURIComponent(authErrorMessage(error.code))}`);
  }

  // Nudge residents with an incomplete profile to finish it. A failed check (null) must
  // never block sign-in, so it falls back to the home page.
  const matchable = await isProfileMatchable(supabase, data.user.id);
  return context.redirect(matchable === false ? "/profil" : "/");
};
