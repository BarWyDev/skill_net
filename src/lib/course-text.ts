// The text rule for neighbour courses (roadmap S-17): the title, the description and the meeting
// details. The same rule lives in `check_course_text` in the neighbour courses migration, which
// checks it again; change both together. Relative imports only, so `node:test` can load it.

import { normaliseReason } from "./reason.ts";

export type CourseTextField = "title" | "description" | "meeting";

/** Length bounds of the normalised text. A meeting text of length 0 is "not given". */
export const COURSE_TEXT_BOUNDS: Record<CourseTextField, { min: number; max: number }> = {
  title: { min: 5, max: 80 },
  description: { min: 20, max: 1000 },
  meeting: { min: 0, max: 500 },
};

/** Polish messages keyed by the database error codes `<field>_invalid` and `<field>_contact`. */
export const COURSE_TEXT_MESSAGES: Record<`${CourseTextField}_${"invalid" | "contact"}`, string> = {
  title_invalid: `Tytuł musi mieć od ${COURSE_TEXT_BOUNDS.title.min} do ${COURSE_TEXT_BOUNDS.title.max} znaków.`,
  title_contact: "Tytuł nie może zawierać telefonu ani adresu e-mail.",
  description_invalid: `Opis musi mieć od ${COURSE_TEXT_BOUNDS.description.min} do ${COURSE_TEXT_BOUNDS.description.max} znaków.`,
  description_contact: "Opis nie może zawierać telefonu ani adresu e-mail.",
  meeting_invalid: `Szczegóły spotkania mogą mieć najwyżej ${COURSE_TEXT_BOUNDS.meeting.max} znaków.`,
  meeting_contact:
    "Szczegóły spotkania nie mogą zawierać telefonu ani adresu e-mail. Datę zapisz z kropkami, np. 21.10.2026.",
};

// At least 9 digits separated by at most one space or dash: "600 100 200", "600-100-200",
// "+48600100200". A dot, a colon or anything else ends the run, so dates and times pass
// ("21.10.2026, 10:00-12:00"), and so does "600.100.200", an accepted cost.
const PHONE_RE = /[0-9]([ -]?[0-9]){8,}/;
const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/;

/** The text as the database stores it: invisible and whitespace runs folded, as in check_reason. */
export function normaliseCourseText(raw: string): string {
  return normaliseReason(raw);
}

export type CourseTextResult = { ok: true; text: string | null } | { ok: false; message: string };

/** The normalised text, null for empty meeting details, or a Polish message. */
export function checkCourseText(raw: string | null, field: CourseTextField): CourseTextResult {
  const text = normaliseCourseText(raw ?? "");
  const { min, max } = COURSE_TEXT_BOUNDS[field];
  if (text === "" && min === 0) return { ok: true, text: null };
  // Code points, like char_length in Postgres: an emoji is one character, not two.
  const length = Array.from(text).length;
  if (length < min || length > max) return { ok: false, message: COURSE_TEXT_MESSAGES[`${field}_invalid`] };
  if (PHONE_RE.test(text) || EMAIL_RE.test(text)) {
    return { ok: false, message: COURSE_TEXT_MESSAGES[`${field}_contact`] };
  }
  return { ok: true, text };
}
