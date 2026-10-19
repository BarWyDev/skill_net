// Data visibility controls (roadmap S-12): the pure parts of the four switches, shared by the profile
// form parser and the contacts page. Relative imports only, so `node:test` can load it.

// The form sends every profile switch explicitly as "1" or "0", so an unchecked box is never
// mistaken for "not sent".
export const SWITCH_ON = "1";
export const SWITCH_OFF = "0";

export const CRISIS_OFF_UNKNOWN_SKILL = "Nie można ukryć w kryzysie umiejętności, której nie zaznaczono.";

/** "1" is on, "0" is off, anything missing (an old client, the smoke test) is null: unchanged. */
export function parseSwitch(value: string | null): boolean | null | undefined {
  if (value === null) return null;
  if (value === SWITCH_ON) return true;
  if (value === SWITCH_OFF) return false;
  return undefined;
}

/**
 * Marks each skill with its crisis use (V2). `crisisOff` lists the slugs hidden from crises; every
 * one must be a submitted skill. Returns null when one is not.
 */
export function withCrisisUse<T extends { slug: string }>(
  skills: T[],
  crisisOff: string[],
): (T & { crisis: boolean })[] | null {
  const submitted = new Set(skills.map((s) => s.slug));
  if (crisisOff.some((slug) => !submitted.has(slug))) return null;
  const off = new Set(crisisOff);
  return skills.map((s) => ({ ...s, crisis: !off.has(s.slug) }));
}

/** "1 osoba nie zgodziła się", "2 osoby nie zgodziły się", "5 osób nie zgodziło się": the verb after `formatPeople`. */
export function declinedVerb(n: number): string {
  if (n === 1) return "nie zgodziła się";
  const lastTwo = n % 100;
  const last = n % 10;
  return last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14) ? "nie zgodziły się" : "nie zgodziło się";
}

/**
 * After a reveal: of the people the coordinator sees, those revealed, those who declined an
 * emergency reveal (V4) and the rest, who gave no number. Floored at 0, because the count and the
 * reveal are two reads and a resident may change their profile in between.
 */
export function revealCounts(matchCount: number, revealed: number, declined: number) {
  const declinedShown = Math.max(0, Math.min(declined, matchCount - revealed));
  return { declined: declinedShown, withoutPhone: Math.max(0, matchCount - revealed - declinedShown) };
}
