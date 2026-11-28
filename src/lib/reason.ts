// The rule for a coordinator's reason (security audit F-05): the break-glass reveal and crisis
// activation. The same rule lives in `check_reason` in the meaningful reasons migration, which
// checks it again; change both together. Relative imports only, so `node:test` can load it.

import { format } from "./i18n/format.ts";
import type { Locale } from "./i18n/locale.ts";
import { crisis } from "./i18n/messages/crisis.ts";
import { normaliseReason } from "./reason-text.ts";

// The normalisation lives in its own module, so the course form island, which needs only that,
// does not bundle the crisis catalogue.
export { normaliseReason };

export const REASON_MIN = 10;
export const REASON_MAX = 500;

/** The two refusals of the rule, in `locale`. */
export function reasonMessages(locale: Locale): { required: string; tooLong: string } {
  const t = crisis[locale].reason;
  return { required: format(t.required, { min: REASON_MIN }), tooLong: format(t.tooLong, { max: REASON_MAX }) };
}

/** A message in `locale` when a normalised reason is not acceptable, otherwise null. */
export function reasonProblem(reason: string, locale: Locale): string | null {
  const messages = reasonMessages(locale);
  if (reason.length < REASON_MIN) return messages.required;
  if (reason.length > REASON_MAX) return messages.tooLong;
  const words = reason.match(/\p{L}{3,}/gu) ?? [];
  const letters = new Set(reason.toLowerCase().match(/\p{L}/gu) ?? []);
  if (words.length < 2 || letters.size < 4) return messages.required;
  return null;
}
