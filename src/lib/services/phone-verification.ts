import { SMSAPI_SENDER, SMSAPI_TOKEN, SMS_PROVIDER, SMS_WORKER_TOKEN } from "astro:env/server";
import { generateCode, hashCode, normaliseCode } from "@/lib/phone-code";
import { getSmsProvider } from "@/lib/sms";
import { codeText } from "@/lib/sms/text";
import { createPublicClient } from "@/lib/supabase";

// Phone verification (S-07). The database functions are gated by the worker token and callable only
// by `anon`, so they run on the cookie-less public client, never on the resident's session.
// Never log a number, a code or the token here.

const UNAVAILABLE = "Potwierdzanie numeru nie jest jeszcze dostępne. Spróbuj później.";
const GENERIC_SEND_ERROR = "Nie udało się wysłać kodu. Spróbuj ponownie.";
const GENERIC_CONFIRM_ERROR = "Nie udało się potwierdzić numeru. Spróbuj ponownie.";
const NEW_CODE_NEEDED = "Kod wygasł albo numer się zmienił. Wyślij nowy kod.";

// Messages raised by `begin_phone_verification` and `confirm_phone_verification`.
const DB_ERROR_MESSAGES: Record<string, string> = {
  worker_token_unset: UNAVAILABLE,
  worker_token_invalid: UNAVAILABLE,
  no_phone: "Najpierw zapisz numer telefonu w profilu.",
  already_verified: "Ten numer jest już potwierdzony.",
  phone_taken: "Ten numer jest już potwierdzony na innym koncie.",
  rate_limited: "Wysłaliśmy już 3 kody w ciągu godziny. Spróbuj później.",
  sms_budget_exhausted: "Dzisiaj nie możemy wysłać więcej SMS-ów. Spróbuj jutro.",
  expired: NEW_CODE_NEEDED,
  too_many_attempts: "Za dużo błędnych prób. Wyślij nowy kod.",
};

export type SendCodeResult =
  /** `devCode` is set only by a local dev server on the fake provider, where no SMS exists to read. */
  { ok: true; sent: boolean; devCode?: string } | { ok: false; message: string };

/**
 * Makes a code, stores its hash and sends the code to the resident's saved number. The database
 * refuses first (no number, already verified, limits), so a refused request costs no SMS.
 */
export async function sendPhoneCode(userId: string): Promise<SendCodeResult> {
  const supabase = createPublicClient();
  if (!supabase) return { ok: false, message: "Supabase nie jest skonfigurowany." };
  if (!SMS_WORKER_TOKEN) return { ok: false, message: UNAVAILABLE };

  const code = generateCode();
  const { data: phone, error } = await supabase.rpc("begin_phone_verification", {
    p_token: SMS_WORKER_TOKEN,
    p_user_id: userId,
    p_code_hash: await hashCode(SMS_WORKER_TOKEN, userId, code),
  });
  if (error) return { ok: false, message: DB_ERROR_MESSAGES[error.message] ?? GENERIC_SEND_ERROR };

  const provider = getSmsProvider({ SMSAPI_TOKEN, SMS_PROVIDER, SMSAPI_SENDER });
  const result = await provider.sendSms({ to: phone, text: codeText(code) });
  if (!result.ok) return { ok: false, message: GENERIC_SEND_ERROR };

  if (provider.name === "fake") {
    // No SMS left the Worker. Only a local dev server may show the code instead: on a deployed
    // build that would let anyone "verify" a number they do not hold.
    return import.meta.env.DEV ? { ok: true, sent: false, devCode: code } : { ok: true, sent: false };
  }
  return { ok: true, sent: true };
}

/** Checks the code the resident typed. On success the saved number is verified. */
export async function confirmPhoneCode(
  userId: string,
  rawCode: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const code = normaliseCode(rawCode);
  if (!code) return { ok: false, message: "Wpisz 6 cyfr z SMS-a." };

  const supabase = createPublicClient();
  if (!supabase) return { ok: false, message: "Supabase nie jest skonfigurowany." };
  if (!SMS_WORKER_TOKEN) return { ok: false, message: UNAVAILABLE };

  const { data: confirmed, error } = await supabase.rpc("confirm_phone_verification", {
    p_token: SMS_WORKER_TOKEN,
    p_user_id: userId,
    p_code_hash: await hashCode(SMS_WORKER_TOKEN, userId, code),
  });
  if (error) return { ok: false, message: DB_ERROR_MESSAGES[error.message] ?? GENERIC_CONFIRM_ERROR };
  return confirmed ? { ok: true } : { ok: false, message: "Nieprawidłowy kod. Sprawdź SMS i spróbuj ponownie." };
}
