// Polish mobile numbers. Shared by the server-side validation and the profile form island,
// so it stays dependency-free. Never put the typed value into a message or a log.

export const PHONE_ERROR = "Podaj polski numer komórkowy, np. 600 123 456.";

// `+48`, `0048` or no prefix, then 9 digits starting with 4–8 (mobile ranges).
const PHONE_RE = /^(?:\+48|0048)?([4-8]\d{8})$/;

/** Normalises to `+48XXXXXXXXX`, ignoring spaces and dashes; returns null for anything else. */
export function normalisePhone(raw: string): string | null {
  const match = PHONE_RE.exec(raw.replace(/[\s-]/g, ""));
  return match ? `+48${match[1]}` : null;
}

/** Displays a normalised `+48XXXXXXXXX` as `+48 600 123 456`; anything else is returned as is. */
export function formatPhone(phone: string): string {
  const match = /^\+48(\d{3})(\d{3})(\d{3})$/.exec(phone);
  return match ? `+48 ${match[1]} ${match[2]} ${match[3]}` : phone;
}
