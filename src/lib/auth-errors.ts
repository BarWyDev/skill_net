// Messages for Supabase auth error codes (roadmap S-05), in the request's language. Endpoints pass
// the result back through the flash cookie (src/lib/flash.ts); the raw English `error.message`
// never reaches the page. The text lives in the `auth` catalogue. Relative imports only, so
// `node:test` can load it.

import type { Locale } from "./i18n/locale.ts";
import { auth } from "./i18n/messages/auth.ts";

type KnownCode = keyof (typeof auth)["pl"]["errors"];

/** The message for `code`; the generic one for a code with no message of its own. */
export function authErrorMessage(code: string | undefined, locale: Locale): string {
  const messages = auth[locale];
  return code !== undefined && Object.hasOwn(messages.errors, code)
    ? messages.errors[code as KnownCode]
    : messages.genericError;
}
