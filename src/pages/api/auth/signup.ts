import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { authErrorMessage } from "@/lib/auth-errors";
import { CONSENT_REQUIRED_MESSAGE, CURRENT_CONSENT_VERSION } from "@/lib/consent";
import { passwordProblem } from "@/lib/password";

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const email = form.get("email");
  const password = form.get("password");

  // The browser form checks this first; this covers a POST without it (no JS, a script).
  if (typeof email !== "string" || !email.trim() || typeof password !== "string" || !password) {
    return context.redirect(`/auth/signup?error=${encodeURIComponent("Podaj adres e-mail i hasło.")}`);
  }

  // The same rule as the form and the Supabase Auth settings; this covers a POST without the form.
  const weak = passwordProblem(password);
  if (weak) {
    return context.redirect(`/auth/signup?error=${encodeURIComponent(weak)}`);
  }

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
