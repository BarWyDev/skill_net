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

/**
 * What is wrong with a text: the same codes the database raises, `<field>_invalid` and
 * `<field>_contact`. Their messages are in the `courses` catalogue, under `errors`.
 */
export type CourseTextCode = `${CourseTextField}_${"invalid" | "contact"}`;

// At least 9 digits separated by at most one space or dash: "600 100 200", "600-100-200",
// "+48600100200". A dot, a colon or anything else ends the run, so dates and times pass
// ("21.10.2026, 10:00-12:00"), and so does "600.100.200", an accepted cost.
const PHONE_RE = /[0-9]([ -]?[0-9]){8,}/;
const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/;

/** The text as the database stores it: invisible and whitespace runs folded, as in check_reason. */
export function normaliseCourseText(raw: string): string {
  return normaliseReason(raw);
}

export type CourseTextResult = { ok: true; text: string | null } | { ok: false; code: CourseTextCode };

/** The normalised text, null for empty meeting details, or the code of what is wrong. */
export function checkCourseText(raw: string | null, field: CourseTextField): CourseTextResult {
  const text = normaliseCourseText(raw ?? "");
  const { min, max } = COURSE_TEXT_BOUNDS[field];
  if (text === "" && min === 0) return { ok: true, text: null };
  // Code points, like char_length in Postgres: an emoji is one character, not two.
  const length = Array.from(text).length;
  if (length < min || length > max) return { ok: false, code: `${field}_invalid` };
  if (PHONE_RE.test(text) || EMAIL_RE.test(text)) {
    return { ok: false, code: `${field}_contact` };
  }
  return { ok: true, text };
}
