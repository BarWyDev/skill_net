import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { authErrorMessage } from "@/lib/auth-errors";
import { CONSENT_REQUIRED_MESSAGE, CURRENT_CONSENT_VERSION } from "@/lib/consent";

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const email = form.get("email") as string;
  const password = form.get("password") as string;

  // Checked before GoTrue is called. The database refuses an email sign-up without a published
  // consent version anyway (`consent_required`), so this check only gives a clear message.
  if (form.get("consent") !== "on") {
    return context.redirect(`/auth/signup?error=${encodeURIComponent(CONSENT_REQUIRED_MESSAGE)}`);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/auth/signup?error=${encodeURIComponent("Supabase nie jest skonfigurowany.")}`);
  }
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { consent_version: CURRENT_CONSENT_VERSION } },
  });

  if (error) {
    return context.redirect(`/auth/signup?error=${encodeURIComponent(authErrorMessage(error.code))}`);
  }

  return context.redirect("/auth/confirm-email");
};
