import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { authErrorMessage } from "@/lib/auth-errors";
import { CONSENT_REQUIRED_MESSAGE, CURRENT_CONSENT_VERSION } from "@/lib/consent";
import { redirectWithError } from "@/lib/flash";

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const email = form.get("email");
  const password = form.get("password");

  // The browser form checks this first; this covers a POST without it (no JS, a script).
  if (typeof email !== "string" || !email.trim() || typeof password !== "string" || !password) {
    return redirectWithError(context, "/auth/signup", "Podaj adres e-mail i hasło.");
  }

  // Checked before GoTrue is called. The database refuses an email sign-up without a published
  // consent version anyway (`consent_required`), so this check only gives a clear message.
  if (form.get("consent") !== "on") {
    return redirectWithError(context, "/auth/signup", CONSENT_REQUIRED_MESSAGE);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return redirectWithError(context, "/auth/signup", "Supabase nie jest skonfigurowany.");
  }
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { consent_version: CURRENT_CONSENT_VERSION } },
  });

  if (error) {
    return redirectWithError(context, "/auth/signup", authErrorMessage(error.code));
  }

  return context.redirect("/auth/confirm-email");
};
