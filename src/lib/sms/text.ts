// SMS texts (S-07). Every outgoing message is GSM-7 only: one Polish diacritic switches the whole
// SMS to UCS-2 (70 characters per segment instead of 160), which doubles the cost of an alert.
// So diacritics are folded (ą→a, ł→l, …) and every text fits one 160-character segment.
// Relative imports only, so `node:test` can load it.

/** One GSM-7 segment. */
export const SMS_MAX_LENGTH = 160;

// The GSM 03.38 basic character set. The extension table (€ [ ] { } ^ ~ | \) is left out on
// purpose: each of those costs two characters, and no SkillNet text needs them.
const GSM7_BASIC = new Set(
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡" +
    "ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà",
);

/** True when every character is in the GSM-7 basic set, so the SMS is not sent as UCS-2. */
export function isGsm7(text: string): boolean {
  for (const char of text) {
    if (!GSM7_BASIC.has(char)) return false;
  }
  return true;
}

// ł and Ł have no canonical decomposition, so NFD leaves them alone.
const NO_DECOMPOSITION: Record<string, string> = { ł: "l", Ł: "L" };

/** Folds diacritics to plain letters (ą→a, ł→l, ż→z, …) and typographic punctuation to ASCII. */
export function foldDiacritics(text: string): string {
  return text
    .replace(/[łŁ]/g, (char) => NO_DECOMPOSITION[char] ?? char)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[„”“]/g, '"')
    .replace(/[’‘]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/\u00a0/g, " ");
}

/** Folds the text, then replaces whatever is still outside GSM-7 with `?`. */
export function toGsm7(text: string): string {
  let out = "";
  for (const char of foldDiacritics(text)) {
    out += GSM7_BASIC.has(char) ? char : "?";
  }
  return out;
}

const ALERT_PREFIX = "SkillNet: ";
const ALERT_SUFFIX = " Koordynator prosi o pomoc. Odpisz TAK jesli mozesz pomoc lub NIE.";

export interface AlertTextInput {
  /** The crisis type as the coordinator sees it, e.g. "Powódź". */
  crisisTypeLabel: string;
  /** `crises.epicentre_postcode`; null when the crisis was activated from a map pin. */
  postcode: string | null;
}

/**
 * The crisis alert. `crises` holds no place name, only the epicentre's postcode, so the text says
 * "w Twojej okolicy" and adds the postcode when there is one. A long type label is cut so the
 * whole message stays within one segment.
 */
export function alertText({ crisisTypeLabel, postcode }: AlertTextInput): string {
  const where = postcode ? ` w Twojej okolicy (${toGsm7(postcode.trim())}).` : " w Twojej okolicy.";
  const room = SMS_MAX_LENGTH - ALERT_PREFIX.length - where.length - ALERT_SUFFIX.length;
  const label = toGsm7(crisisTypeLabel.trim()).slice(0, room).trimEnd();
  return `${ALERT_PREFIX}${label}${where}${ALERT_SUFFIX}`;
}

/** The phone verification code. */
export function codeText(code: string): string {
  return `SkillNet: kod potwierdzajacy numer telefonu to ${code}. Wazny 10 minut. Nie podawaj go nikomu.`;
}

/** Auto-reply to an answer that arrives after the crisis has ended. */
export function endedText(): string {
  return "SkillNet: ta akcja jest juz zakonczona. Dziekujemy za gotowosc do pomocy.";
}

/** Auto-reply to an answer that is neither TAK nor NIE. */
export function unclearText(): string {
  return "SkillNet: nie rozumiemy odpowiedzi. Odpisz TAK jesli mozesz pomoc lub NIE.";
}
