import type { SupabaseClient } from "@/lib/supabase";
import { authErrorMessage } from "@/lib/auth-errors";

// Never log the email or password here: both are personal data.

const GENERIC_UNREGISTER_ERROR = "Nie udało się usunąć konta. Spróbuj ponownie.";
const WRONG_PASSWORD = "Nieprawidłowe hasło.";

// Messages raised by `unregister_me` in the unregister-and-erase migration.
const DB_ERROR_MESSAGES: Record<string, string> = {
  reauthentication_required: "Potwierdź hasło ponownie.",
};

/**
 * Erases the caller's account and all personal data, then clears the session cookies.
 * Signing in again refreshes the JWT `amr` timestamp that `unregister_me` requires, so it needs the
 * form's Turnstile token like any sign-in. Returns a Polish message on failure.
 */
export async function unregisterMe(
  supabase: SupabaseClient,
  email: string,
  password: string,
  captchaToken: string | undefined,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
    options: { captchaToken },
  });
  if (signInError) {
    if (signInError.code === "invalid_credentials") return { ok: false, message: WRONG_PASSWORD };
    if (signInError.code === "captcha_failed") return { ok: false, message: authErrorMessage(signInError.code) };
    return { ok: false, message: GENERIC_UNREGISTER_ERROR };
  }

  const { error } = await supabase.rpc("unregister_me");
  if (error) {
    return { ok: false, message: DB_ERROR_MESSAGES[error.message] ?? GENERIC_UNREGISTER_ERROR };
  }

  // The auth.users row is gone, so a global sign-out would call GoTrue for a session that no longer exists.
  await supabase.auth.signOut({ scope: "local" });
  return { ok: true };
}
