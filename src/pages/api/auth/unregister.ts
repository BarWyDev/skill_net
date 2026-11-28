import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { unregisterMe } from "@/lib/services/account";
import { redirectWithError } from "@/lib/flash";
import { captchaToken } from "@/lib/captcha";
import { auth } from "@/lib/i18n/messages/auth";
import { profile } from "@/lib/i18n/messages/profile";

// Errors go back to the page the form came from, so a resident refusing consent on /zgoda sees them
// there instead of being bounced through the gate. Only these pages are accepted.
const RETURN_PAGES = ["/profil", "/zgoda"];

export const POST: APIRoute = async (context) => {
  const { locale } = context.locals;
  const t = profile[locale].deleteAccount;
  const form = await context.request.formData();
  const returnTo = form.get("return_to");
  const errorPage = typeof returnTo === "string" && RETURN_PAGES.includes(returnTo) ? returnTo : "/profil";

  const user = context.locals.user;
  if (!user) {
    return context.redirect("/auth/signin");
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return redirectWithError(context, errorPage, auth[locale].notConfigured);
  }

  const password = form.get("password");
  if (typeof password !== "string" || password === "") {
    return redirectWithError(context, errorPage, t.passwordRequired);
  }
  if (!user.email) {
    return redirectWithError(context, errorPage, t.noPasswordAccount);
  }

  const result = await unregisterMe(supabase, user.email, password, captchaToken(form), locale);
  if (!result.ok) {
    return redirectWithError(context, errorPage, result.message);
  }

  return context.redirect("/?konto-usuniete=1");
};
