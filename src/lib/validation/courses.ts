import { z } from "zod";
import { checkCourseText, type CourseTextField } from "@/lib/course-text";
import type { CourseInput } from "@/types";

/** The durations the form offers, in minutes. The database accepts any multiple of 15 up to 480. */
export const COURSE_DURATIONS = [30, 45, 60, 90, 120, 180, 240, 360, 480] as const;
export const COURSE_CAPACITY_MAX = 50;

/** "45 min", "1 godz.", "1,5 godz." */
export function formatCourseDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  return `${String(minutes / 60).replace(".", ",")} godz.`;
}

const COURSE_NOT_FOUND = "Nie znaleziono kursu.";
export const DELETE_CONFIRM_MESSAGE = "Zaznacz „Usuwam kurs i wszystkie zapisy”, aby usunąć kurs.";

const courseText = (field: CourseTextField) =>
  z.string().transform((value, ctx) => {
    const result = checkCourseText(value, field);
    if (!result.ok) {
      ctx.addIssue({ code: "custom", message: result.message });
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
    .refine((n) => (COURSE_DURATIONS as readonly number[]).includes(n), "Wybierz czas trwania z listy."),
  // Empty means "no limit".
  capacity: z.string().transform((value, ctx) => {
    if (value.trim() === "") return null;
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1 || n > COURSE_CAPACITY_MAX) {
      ctx.addIssue({ code: "custom", message: `Liczba miejsc to od 1 do ${COURSE_CAPACITY_MAX} albo puste pole.` });
      return z.NEVER;
    }
    return n;
  }),
  meeting_details: courseText("meeting"),
};

const idSchema = z.uuid(COURSE_NOT_FOUND);

const createSchema = z.object({
  // Whether the resident holds the skill is checked by create_course, the single source of truth.
  skill_slug: z.string().regex(/^[a-z-]{1,40}$/, "Wybierz umiejętność z listy."),
  ...courseFields,
});
const updateSchema = z.object({ id: idSchema, ...courseFields });
const deleteSchema = z.object({
  id: idSchema,
  confirm: z.literal("1", DELETE_CONFIRM_MESSAGE),
});

type Parsed<T> = { success: true; data: T } | { success: false; message: string };

const text = (form: FormData, name: string) => {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
};

const firstMessage = (error: z.ZodError) => error.issues[0]?.message ?? "Nieprawidłowe dane formularza.";

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

/** Parses the new course form. Messages are Polish and safe to show. */
export function parseCreateCourseForm(form: FormData): Parsed<CourseInput & { skillSlug: string }> {
  const result = createSchema.safeParse({ skill_slug: text(form, "skill_slug"), ...courseFieldValues(form) });
  if (!result.success) return { success: false, message: firstMessage(result.error) };
  return { success: true, data: { skillSlug: result.data.skill_slug, ...courseInput(result.data) } };
}

/** Parses the edit form of an existing course. */
export function parseUpdateCourseForm(form: FormData): Parsed<CourseInput & { id: string }> {
  const result = updateSchema.safeParse({ id: text(form, "id"), ...courseFieldValues(form) });
  if (!result.success) return { success: false, message: firstMessage(result.error) };
  return { success: true, data: { id: result.data.id, ...courseInput(result.data) } };
}

/** Parses a form that carries only the course id: close, reopen, renew. */
export function parseCourseIdForm(form: FormData): Parsed<string> {
  const result = idSchema.safeParse(text(form, "id"));
  return result.success ? { success: true, data: result.data } : { success: false, message: COURSE_NOT_FOUND };
}

/** Parses the delete form, which needs the "Usuwam kurs i wszystkie zapisy" tick. */
export function parseDeleteCourseForm(form: FormData): Parsed<string> {
  const result = deleteSchema.safeParse({ id: text(form, "id"), confirm: form.get("confirm") ?? undefined });
  return result.success
    ? { success: true, data: result.data.id }
    : { success: false, message: firstMessage(result.error) };
}
