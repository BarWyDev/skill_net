// Polish messages for Supabase auth error codes (roadmap S-05). Endpoints pass the result back
// as `?error=`; the raw English `error.message` never reaches the page. Relative imports only,
// so `node:test` can load it.

const MESSAGES: Record<string, string> = {
  invalid_credentials: "Nieprawidłowy e-mail lub hasło.",
  email_not_confirmed: "Adres e-mail nie został jeszcze potwierdzony. Kliknij link z wiadomości, którą wysłaliśmy.",
  user_already_exists: "Konto z tym adresem e-mail już istnieje. Zaloguj się.",
  email_exists: "Konto z tym adresem e-mail już istnieje. Zaloguj się.",
  weak_password: "Hasło jest za słabe. Użyj co najmniej 10 znaków, w tym małej litery, wielkiej litery i cyfry.",
  over_email_send_rate_limit: "Wysłaliśmy już niedawno wiadomość. Spróbuj ponownie za kilka minut.",
  validation_failed: "Sprawdź poprawność adresu e-mail i hasła.",
};

export const GENERIC_AUTH_ERROR = "Coś poszło nie tak. Spróbuj ponownie za chwilę.";

export function authErrorMessage(code: string | undefined): string {
  return code !== undefined && Object.hasOwn(MESSAGES, code) ? MESSAGES[code] : GENERIC_AUTH_ERROR;
}
