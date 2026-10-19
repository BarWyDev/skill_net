import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { profileNeedsAttention } from "@/lib/services/profile";
import { authErrorMessage } from "@/lib/auth-errors";
import { RETURN_PARAM, safeReturnPath } from "@/lib/return-path";
import { redirectWithError } from "@/lib/flash";

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const email = form.get("email") as string;
  const password = form.get("password") as string;
  // Only ever a same-site path; anything else is dropped.
  const returnTo = safeReturnPath(form.get(RETURN_PARAM));

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return redirectWithError(context, "/auth/signin", "Supabase nie jest skonfigurowany.");
  }
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // The form shows a resend block for this flag. The address stays in the browser, never in the URL.
    const flags = [
      ...(error.code === "email_not_confirmed" ? ["niepotwierdzony=1"] : []),
      ...(returnTo ? [`${RETURN_PARAM}=${encodeURIComponent(returnTo)}`] : []),
    ];
    const location = flags.length ? `/auth/signin?${flags.join("&")}` : "/auth/signin";
    return redirectWithError(context, location, authErrorMessage(error.code));
  }

  if (returnTo) return context.redirect(returnTo);

  // Nudge residents with an incomplete or paused profile to the profile page. A failed check (null)
  // must never block sign-in, so it falls back to the home page.
  const needsAttention = await profileNeedsAttention(supabase);
  return context.redirect(needsAttention === true ? "/profil" : "/");
};
