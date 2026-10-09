import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { isProfileMatchable } from "@/lib/services/profile";
import { authErrorMessage } from "@/lib/auth-errors";
import { RETURN_PARAM, safeReturnPath } from "@/lib/return-path";

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const email = form.get("email") as string;
  const password = form.get("password") as string;
  // Only ever a same-site path; anything else is dropped.
  const returnTo = safeReturnPath(form.get(RETURN_PARAM));
  const back = returnTo ? `&${RETURN_PARAM}=${encodeURIComponent(returnTo)}` : "";

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/auth/signin?error=${encodeURIComponent("Supabase nie jest skonfigurowany.")}`);
  }
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // The form shows a resend block for this flag. The address stays in the browser, never in the URL.
    const unconfirmed = error.code === "email_not_confirmed" ? "&niepotwierdzony=1" : "";
    return context.redirect(
      `/auth/signin?error=${encodeURIComponent(authErrorMessage(error.code))}${unconfirmed}${back}`,
    );
  }

  if (returnTo) return context.redirect(returnTo);

  // Nudge residents with an incomplete profile to finish it. A failed check (null) must
  // never block sign-in, so it falls back to the home page.
  const matchable = await isProfileMatchable(supabase, data.user.id);
  return context.redirect(matchable === false ? "/profil" : "/");
};
