import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { redirectWithError } from "@/lib/flash";
import { authErrorMessage } from "@/lib/auth-errors";
import { captchaToken } from "@/lib/captcha";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Sends a new confirmation link (roadmap S-05). The answer never depends on whether the address
// is registered, confirmed or rate limited, so the endpoint cannot be used to probe for accounts:
// every outcome after the format check lands on the same neutral page.
export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const raw = form.get("email");
  const email = typeof raw === "string" ? raw.trim() : "";

  if (!EMAIL_PATTERN.test(email)) {
    return redirectWithError(context, "/auth/link-wygasl", "Podaj poprawny adres e-mail.");
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (supabase) {
    // Every other error is ignored on purpose (see above), and never logged: it would carry the
    // address. A failed captcha is checked before the address, so reporting it reveals nothing.
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { captchaToken: captchaToken(form) },
    });
    if (error?.code === "captcha_failed") {
      return redirectWithError(context, "/auth/link-wygasl", authErrorMessage(error.code));
    }
  }

  return context.redirect("/auth/confirm-email?ponownie=1");
};
