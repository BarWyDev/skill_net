import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { authErrorMessage } from "@/lib/auth-errors";
import { CURRENT_CONSENT_VERSION } from "@/lib/consent";
import { redirectWithError } from "@/lib/flash";
import { passwordProblem } from "@/lib/password";
import { captchaToken } from "@/lib/captcha";
import { auth } from "@/lib/i18n/messages/auth";

export const POST: APIRoute = async (context) => {
  const { locale } = context.locals;
  const t = auth[locale];
  const form = await context.request.formData();
  const email = form.get("email");
  const password = form.get("password");

  // The browser form checks this first; this covers a POST without it (no JS, a script).
  if (typeof email !== "string" || !email.trim() || typeof password !== "string" || !password) {
    return redirectWithError(context, "/auth/signup", t.emailAndPasswordRequired);
  }

  // The same rule as the form and the Supabase Auth settings; this covers a POST without the form.
  const weak = passwordProblem(password, locale);
  if (weak) {
    return redirectWithError(context, "/auth/signup", weak);
  }

  // Checked before GoTrue is called. The database refuses an email sign-up without a published
  // consent version anyway (`consent_required`), so this check only gives a clear message.
  if (form.get("consent") !== "on") {
    return redirectWithError(context, "/auth/signup", t.consent.required);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return redirectWithError(context, "/auth/signup", t.notConfigured);
  }
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { consent_version: CURRENT_CONSENT_VERSION }, captchaToken: captchaToken(form) },
  });

  if (error) {
    return redirectWithError(context, "/auth/signup", authErrorMessage(error.code, locale));
  }

  return context.redirect("/auth/confirm-email");
};
