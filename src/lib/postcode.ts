// Polish postcode input (00-000). Shared by the server-side form validation and the postcode
// fields in the map and location picker islands, so it stays dependency-free. Relative imports
// only, so `node:test` can load it. Never put the typed value into a message or a log.

export const POSTCODE_ERROR = "Podaj kod pocztowy w formacie 00-000.";

const POSTCODE_RE = /^(\d{2})-?(\d{3})$/;
// What can still grow into a valid code while the user types: `3`, `31`, `31-`, `31-0`, `310`.
const POSTCODE_PREFIX_RE = /^\d{0,2}$|^\d{2}-?\d{0,3}$/;

/** Normalises `NNNNN` or `NN-NNN` to `NN-NNN`; returns null for anything else. */
export function normalisePostcode(raw: string): string | null {
  const match = POSTCODE_RE.exec(raw.trim());
  return match ? `${match[1]}-${match[2]}` : null;
}

export type PostcodeInput =
  { kind: "empty" } | { kind: "partial" } | { kind: "invalid" } | { kind: "valid"; postcode: string };

/**
 * Classifies what is in a postcode field. `partial` is an unfinished code, which is only an
 * error once the field loses focus; `invalid` can never become a code, so it is an error at once.
 */
export function checkPostcodeInput(raw: string): PostcodeInput {
  const value = raw.trim();
  if (value === "") return { kind: "empty" };
  const postcode = normalisePostcode(value);
  if (postcode !== null) return { kind: "valid", postcode };
  return POSTCODE_PREFIX_RE.test(value) ? { kind: "partial" } : { kind: "invalid" };
}
