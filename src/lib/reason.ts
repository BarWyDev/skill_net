// The rule for a coordinator's reason (security audit F-05): the break-glass reveal and crisis
// activation. The same rule lives in `check_reason` in the meaningful reasons migration, which
// checks it again; change both together. Relative imports only, so `node:test` can load it.

export const REASON_MIN = 10;
export const REASON_MAX = 500;

export const REASON_REQUIRED_MESSAGE = `Opisz powód słowami: co najmniej ${REASON_MIN} znaków i dwa słowa.`;
export const REASON_TOO_LONG_MESSAGE = `Powód może mieć najwyżej ${REASON_MAX} znaków.`;

// Whitespace, control characters and invisible formatting characters: zero-width spaces and
// joiners, direction marks and overrides, the BOM, soft hyphens, variation selectors, fillers.
const INVISIBLE_RUN =
  // Combining and variation-selector escapes on purpose: they are among the characters to strip.
  // eslint-disable-next-line no-misleading-character-class
  /[\s\p{Cc}\u00a0\u00ad\u034f\u061c\u115f\u1160\u1680\u17b4\u17b5\u180b-\u180f\u2000-\u200f\u2028-\u202f\u205f-\u206f\u3000\u3164\ufe00-\ufe0f\ufeff\uffa0]+/gu;

/** The reason as a reader sees it: every invisible or whitespace run is one space, then trimmed. */
export function normaliseReason(raw: string): string {
  return raw.replace(INVISIBLE_RUN, " ").trim();
}

/** A Polish message when a normalised reason is not acceptable, otherwise null. */
export function reasonProblem(reason: string): string | null {
  if (reason.length < REASON_MIN) return REASON_REQUIRED_MESSAGE;
  if (reason.length > REASON_MAX) return REASON_TOO_LONG_MESSAGE;
  const words = reason.match(/\p{L}{3,}/gu) ?? [];
  const letters = new Set(reason.toLowerCase().match(/\p{L}/gu) ?? []);
  if (words.length < 2 || letters.size < 4) return REASON_REQUIRED_MESSAGE;
  return null;
}
