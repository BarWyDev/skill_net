// The sign-up password rule (security audit F-09). It mirrors the Supabase Auth settings: a minimum
// length of 10 and `lower_upper_letters_digits`, which counts ASCII letters and digits only. Set the
// same values in the dashboard for production (Authentication > Policies); `supabase/config.toml`
// holds them for local development. The messages live in the `auth` catalogue. Relative imports
// only, so `node:test` can load it.

import { format } from "./i18n/format.ts";
import type { Locale } from "./i18n/locale.ts";
import { auth } from "./i18n/messages/auth.ts";

export const MIN_PASSWORD_LENGTH = 10;

/** A message in `locale` when the password breaks the rule, otherwise null. */
export function passwordProblem(password: string, locale: Locale): string | null {
  const messages = auth[locale].password;
  if (password.length < MIN_PASSWORD_LENGTH) return format(messages.tooShort, { min: MIN_PASSWORD_LENGTH });
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    return messages.needsClasses;
  }
  return null;
}
