import { z } from "zod";
import { checkCourseText, COURSE_TEXT_BOUNDS, type CourseTextField } from "@/lib/course-text";
import { format } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/locale";
import { courses, type CourseMessages } from "@/lib/i18n/messages/courses";
import type { CourseInput } from "@/types";

/** The durations the form offers, in minutes. The database accepts any multiple of 15 up to 480. */
export const COURSE_DURATIONS = [30, 45, 60, 90, 120, 180, 240, 360, 480] as const;
export const COURSE_CAPACITY_MAX = 50;

/** "45 min", "1 godz.", "1,5 godz."; in English "1.5 h". */
export function formatCourseDuration(minutes: number, locale: Locale): string {
  const t = courses[locale].duration;
  if (minutes < 60) return format(t.minutes, { count: minutes });
  const hours = String(minutes / 60);
  return format(t.hours, { count: locale === "en" ? hours : hours.replace(".", ",") });
}

type ErrorCode = keyof CourseMessages["errors"];
// The schemas' messages are codes: keys of the courses catalogue's `errors`, like the codes the
// database raises. `courseMessage` turns a code into text for the request's language.
const code = (name: ErrorCode): ErrorCode => name;

// The numbers a message names.
const MESSAGE_VALUES: Partial<Record<ErrorCode, Record<string, number>>> = {
  title_invalid: COURSE_TEXT_BOUNDS.title,
  description_invalid: COURSE_TEXT_BOUNDS.description,
  meeting_invalid: COURSE_TEXT_BOUNDS.meeting,
  course_capacity_invalid: { max: COURSE_CAPACITY_MAX },
};

/** The message for a code in `locale`, or `fallback`'s when the catalogue has no such code. */
export function courseMessage(locale: Locale, name: string | undefined, fallback: ErrorCode): string {
  const errors = courses[locale].errors;
  const known = name !== undefined && Object.hasOwn(errors, name) ? (name as ErrorCode) : fallback;
  return format(errors[known], MESSAGE_VALUES[known] ?? {});
}

const courseText = (field: CourseTextField) =>
  z.string().transform((value, ctx) => {
    const result = checkCourseText(value, field);
    if (!result.ok) {
      ctx.addIssue({ code: "custom", message: result.code });
      return z.NEVER;
    }
    return result.text;
  });

const courseFields = {
  title: courseText("title"),
  description: courseText("description"),
  duration_minutes: z
    .string()
    .transform(Number)
    .refine((n) => (COURSE_DURATIONS as readonly number[]).includes(n), code("course_duration_invalid")),
  // Empty means "no limit".
  capacity: z.string().transform((value, ctx) => {
    if (value.trim() === "") return null;
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1 || n > COURSE_CAPACITY_MAX) {
      ctx.addIssue({ code: "custom", message: code("course_capacity_invalid") });
      return z.NEVER;
    }
    return n;
  }),
  meeting_details: courseText("meeting"),
};

const idSchema = z.uuid(code("course_not_found"));

const createSchema = z.object({
  // Whether the resident holds the skill is checked by create_course, the single source of truth.
  skill_slug: z.string().regex(/^[a-z-]{1,40}$/, code("skill_invalid")),
  ...courseFields,
});
const updateSchema = z.object({ id: idSchema, ...courseFields });
const deleteSchema = z.object({
  id: idSchema,
  confirm: z.literal("1", code("delete_confirm")),
});

type Parsed<T> = { success: true; data: T } | { success: false; message: string };

const text = (form: FormData, name: string) => {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
};

const firstMessage = (error: z.ZodError, locale: Locale) =>
  courseMessage(locale, error.issues.at(0)?.message, "invalid_form");

function courseInput(data: z.infer<typeof updateSchema> | z.infer<typeof createSchema>): CourseInput {
  return {
    // Both bounds start above 0, so the normalised title and description are never null.
    title: data.title ?? "",
    description: data.description ?? "",
    durationMinutes: data.duration_minutes,
    capacity: data.capacity,
    meetingDetails: data.meeting_details,
  };
}

const courseFieldValues = (form: FormData) => ({
  title: text(form, "title"),
  description: text(form, "description"),
  duration_minutes: text(form, "duration_minutes"),
  capacity: text(form, "capacity"),
  meeting_details: text(form, "meeting_details"),
});

/** Parses the new course form. Messages are in `locale` and safe to show. */
export function parseCreateCourseForm(form: FormData, locale: Locale): Parsed<CourseInput & { skillSlug: string }> {
  const result = createSchema.safeParse({ skill_slug: text(form, "skill_slug"), ...courseFieldValues(form) });
  if (!result.success) return { success: false, message: firstMessage(result.error, locale) };
  return { success: true, data: { skillSlug: result.data.skill_slug, ...courseInput(result.data) } };
}

/** Parses the edit form of an existing course. */
export function parseUpdateCourseForm(form: FormData, locale: Locale): Parsed<CourseInput & { id: string }> {
  const result = updateSchema.safeParse({ id: text(form, "id"), ...courseFieldValues(form) });
  if (!result.success) return { success: false, message: firstMessage(result.error, locale) };
  return { success: true, data: { id: result.data.id, ...courseInput(result.data) } };
}

/** Parses a form that carries only the course id: close, reopen, renew, sign up, withdraw. */
export function parseCourseIdForm(form: FormData, locale: Locale): Parsed<string> {
  const result = idSchema.safeParse(text(form, "id"));
  return result.success
    ? { success: true, data: result.data }
    : { success: false, message: courseMessage(locale, "course_not_found", "course_not_found") };
}

/** Parses the delete form, which needs the "Usuwam kurs i wszystkie zapisy" tick. */
export function parseDeleteCourseForm(form: FormData, locale: Locale): Parsed<string> {
  const result = deleteSchema.safeParse({ id: text(form, "id"), confirm: form.get("confirm") ?? undefined });
  return result.success
    ? { success: true, data: result.data.id }
    : { success: false, message: firstMessage(result.error, locale) };
}
