import type { SupabaseClient } from "@/lib/supabase";
import { authErrorMessage } from "@/lib/auth-errors";
import type { Locale } from "@/lib/i18n/locale";
import { profile } from "@/lib/i18n/messages/profile";

// Never log the email or password here: both are personal data.

/**
 * Erases the caller's account and all personal data, then clears the session cookies.
 * Signing in again refreshes the JWT `amr` timestamp that `unregister_me` requires, so it needs the
 * form's Turnstile token like any sign-in. Returns a message in `locale` on failure.
 */
export async function unregisterMe(
  supabase: SupabaseClient,
  email: string,
  password: string,
  captchaToken: string | undefined,
  locale: Locale,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
    options: { captchaToken },
  });
  const messages = profile[locale].deleteAccount;
  if (signInError) {
    if (signInError.code === "invalid_credentials") return { ok: false, message: messages.wrongPassword };
    if (signInError.code === "captcha_failed")
      return { ok: false, message: authErrorMessage(signInError.code, locale) };
    return { ok: false, message: messages.failed };
  }

  const { error } = await supabase.rpc("unregister_me");
  if (error) {
    // Raised by `unregister_me` in the unregister-and-erase migration.
    const stale = error.message === "reauthentication_required";
    return { ok: false, message: stale ? messages.reauthenticate : messages.failed };
  }

  // The auth.users row is gone, so a global sign-out would call GoTrue for a session that no longer exists.
  await supabase.auth.signOut({ scope: "local" });
  return { ok: true };
}
