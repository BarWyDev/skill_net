// The normalisation behind a coordinator's reason (security audit F-05) and a course's texts: the same
// fold as `check_reason` in the meaningful reasons migration. No catalogue here, so a client island can
// import it without bundling messages. Relative imports only, so `node:test` can load it.

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
