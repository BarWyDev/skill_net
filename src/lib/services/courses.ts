import { z } from "zod";
import type { Database } from "@/db/database.types";
import { COURSE_TEXT_MESSAGES } from "@/lib/course-text";
import { formatPauseUntil } from "@/lib/pause";
import type { SupabaseClient } from "@/lib/supabase";
import type {
  CourseAreaDTO,
  CourseEligibility,
  CourseHiddenReason,
  CourseInput,
  MyCourseDTO,
  MyCourseSignupDTO,
  NearbyCourseDTO,
} from "@/types";

// Never log input values here: course texts and meeting details can name a place or a person.

type CreateCourseArgs = Database["public"]["Functions"]["create_course"]["Args"];
type UpdateCourseArgs = Database["public"]["Functions"]["update_course"]["Args"];

type Result<T = object> = ({ ok: true } & T) | { ok: false; message: string };

const GENERIC_ERROR = "Nie udało się zapisać zmian w kursie. Spróbuj ponownie.";

// Every code raised by the RPCs in the neighbour courses migration.
export const COURSE_ERROR_MESSAGES: Record<string, string> = {
  ...COURSE_TEXT_MESSAGES,
  not_authenticated: "Zaloguj się ponownie.",
  course_no_location: "Aby prowadzić kursy, dodaj lokalizację w profilu.",
  course_recent_move: "Lokalizacja zmieniła się w ostatnich 7 dniach. Kursy będą dostępne po 7 dniach od zmiany.",
  course_too_new: "Kursy są dostępne dla kont założonych co najmniej 14 dni temu.",
  course_unconfirmed: "Potwierdź adres e-mail, aby korzystać z kursów.",
  course_no_consent: "Najpierw zaakceptuj zgodę na przetwarzanie danych.",
  course_skill_not_held: "Kurs możesz prowadzić tylko z umiejętności, którą masz w profilu.",
  course_duration_invalid: "Wybierz czas trwania z listy.",
  course_capacity_invalid: "Liczba miejsc to od 1 do 50 albo puste pole.",
  course_limit_reached: "Możesz mieć najwyżej 3 otwarte kursy.",
  course_capacity_below_signups: "Liczba miejsc nie może być mniejsza niż liczba osób, które już się zapisały.",
  course_not_found: "Nie znaleziono kursu.",
  course_own: "Nie możesz zapisać się na własny kurs.",
  course_full: "Na tym kursie nie ma już wolnych miejsc.",
  course_signup_rate_limited: "Zapisałeś się na zbyt wiele kursów w ciągu godziny. Spróbuj później.",
  course_already_signed_up: "Ten kurs masz już w swoich zapisach.",
  course_not_signed_up: "Tego kursu nie ma w Twoich zapisach.",
};

export function courseErrorMessage(error: { message?: string }): string {
  return (error.message && COURSE_ERROR_MESSAGES[error.message]) ?? GENERIC_ERROR;
}

/**
 * Why a course is hidden, in Polish. `eligibleOn` is the organiser's own date from getCourseArea,
 * which for a recent move is the day the course comes back.
 */
export function hiddenReasonLabel(reason: CourseHiddenReason, eligibleOn: string | null): string {
  switch (reason) {
    case "closed":
      return "Zamknięty: sąsiedzi go nie widzą i nie mogą się zapisać.";
    case "expired":
      return "Wygasł: sąsiedzi go nie widzą. Odnów go, aby był widoczny przez kolejne 90 dni.";
    case "paused":
      return "Ukryty: Twoja dostępność jest wstrzymana.";
    case "skill_removed":
      return "Ukryty: tej umiejętności nie ma już w Twoim profilu.";
    case "no_location":
      return "Ukryty: Twój profil nie ma lokalizacji.";
    case "recent_move":
      return eligibleOn
        ? `Ukryty do ${formatPauseUntil(eligibleOn)}: lokalizacja zmieniona w ostatnich 7 dniach.`
        : "Ukryty: lokalizacja zmieniona w ostatnich 7 dniach.";
    case "square_hidden":
      return "Ukryty: w Twojej okolicy mieszka jeszcze za mało osób, żeby pokazać kurs bez wskazywania Ciebie. Może się to zmieniać z dnia na dzień.";
  }
}

const eligibilitySchema = z.enum(["ok", "no_location", "recent_move", "too_new", "unconfirmed", "no_consent"]);
const hiddenReasonSchema = z.enum([
  "closed",
  "expired",
  "paused",
  "skill_removed",
  "no_location",
  "recent_move",
  "square_hidden",
]);
const polygonSchema = z.object({
  type: z.literal("Polygon"),
  coordinates: z.array(z.array(z.array(z.number()))),
});

const courseAreaSchema = z.object({
  eligibility: eligibilitySchema,
  eligible_on: z.string().nullable(),
  block: polygonSchema.nullable(),
});

export async function getCourseArea(supabase: SupabaseClient): Promise<CourseAreaDTO> {
  const { data, error } = await supabase.rpc("get_course_area");
  if (error) throw new Error(`getCourseArea: ${error.code}`);
  const row = courseAreaSchema.parse(data[0]);
  return {
    eligibility: row.eligibility satisfies CourseEligibility,
    eligibleOn: row.eligible_on,
    block: row.block,
  };
}

const myCourseSchema = z.object({
  id: z.string(),
  skill_slug: z.string(),
  title: z.string(),
  description: z.string(),
  duration_minutes: z.number().int(),
  capacity: z.number().int().nullable(),
  meeting_details: z.string().nullable(),
  is_open: z.boolean(),
  expires_on: z.string(),
  signup_count: z.number().int(),
  hidden_reason: hiddenReasonSchema.nullable(),
});

/** The caller's courses, newest first. */
export async function getMyCourses(supabase: SupabaseClient): Promise<MyCourseDTO[]> {
  const { data, error } = await supabase.rpc("get_my_courses");
  if (error) throw new Error(`getMyCourses: ${error.code}`);
  return z
    .array(myCourseSchema)
    .parse(data)
    .map((c) => ({
      id: c.id,
      skillSlug: c.skill_slug,
      title: c.title,
      description: c.description,
      durationMinutes: c.duration_minutes,
      capacity: c.capacity,
      meetingDetails: c.meeting_details,
      isOpen: c.is_open,
      expiresOn: c.expires_on,
      signupCount: c.signup_count,
      hiddenReason: c.hidden_reason,
    }));
}

// The generated types mark every RPC argument non-null, but SQL accepts null capacity and details.
const courseArgs = (input: CourseInput) => ({
  p_title: input.title,
  p_description: input.description,
  p_duration_minutes: input.durationMinutes,
  p_capacity: input.capacity,
  p_meeting_details: input.meetingDetails,
});

export async function createCourse(
  supabase: SupabaseClient,
  input: CourseInput & { skillSlug: string },
): Promise<Result<{ id: string }>> {
  const args = { p_skill_slug: input.skillSlug, ...courseArgs(input) } as CreateCourseArgs;
  const { data, error } = await supabase.rpc("create_course", args);
  return error ? { ok: false, message: courseErrorMessage(error) } : { ok: true, id: data };
}

export async function updateCourse(supabase: SupabaseClient, input: CourseInput & { id: string }): Promise<Result> {
  const args = { p_id: input.id, ...courseArgs(input) } as UpdateCourseArgs;
  const { error } = await supabase.rpc("update_course", args);
  return error ? { ok: false, message: courseErrorMessage(error) } : { ok: true };
}

/** Closes (false) or reopens (true) a course. */
export async function setCourseOpen(supabase: SupabaseClient, id: string, open: boolean): Promise<Result> {
  const { error } = await supabase.rpc("set_course_open", { p_id: id, p_open: open });
  return error ? { ok: false, message: courseErrorMessage(error) } : { ok: true };
}

/** Restarts the course's 90 days. */
export async function renewCourse(supabase: SupabaseClient, id: string): Promise<Result> {
  const { error } = await supabase.rpc("renew_course", { p_id: id });
  return error ? { ok: false, message: courseErrorMessage(error) } : { ok: true };
}

/** Deletes a course and every sign-up to it. */
export async function deleteCourse(supabase: SupabaseClient, id: string): Promise<Result> {
  const { error } = await supabase.rpc("delete_course", { p_id: id });
  return error ? { ok: false, message: courseErrorMessage(error) } : { ok: true };
}

const nearbyCourseSchema = z.object({
  id: z.string(),
  skill_name: z.string(),
  category_name: z.string(),
  title: z.string(),
  description: z.string(),
  duration_minutes: z.number().int(),
  places_left: z.number().int().nullable(),
  is_full: z.boolean(),
  signed_up: z.boolean(),
  cell: polygonSchema,
});

/** Open courses in the caller's 3×3 block, ordered by square, then title, then id. */
export async function getNearbyCourses(supabase: SupabaseClient): Promise<NearbyCourseDTO[]> {
  const { data, error } = await supabase.rpc("get_nearby_courses");
  if (error) throw new Error(`getNearbyCourses: ${error.code}`);
  return z
    .array(nearbyCourseSchema)
    .parse(data)
    .map((c) => ({
      id: c.id,
      skillName: c.skill_name,
      categoryName: c.category_name,
      title: c.title,
      description: c.description,
      durationMinutes: c.duration_minutes,
      placesLeft: c.places_left,
      isFull: c.is_full,
      signedUp: c.signed_up,
      cell: c.cell,
    }));
}

const myCourseSignupSchema = z.object({
  id: z.string(),
  skill_name: z.string(),
  category_name: z.string(),
  title: z.string(),
  description: z.string(),
  duration_minutes: z.number().int(),
  meeting_details: z.string().nullable(),
  available: z.boolean(),
  cell: polygonSchema.nullable(),
});

/** The caller's active sign-ups, newest first, with the meeting details. */
export async function getMyCourseSignups(supabase: SupabaseClient): Promise<MyCourseSignupDTO[]> {
  const { data, error } = await supabase.rpc("get_my_course_signups");
  if (error) throw new Error(`getMyCourseSignups: ${error.code}`);
  return z
    .array(myCourseSignupSchema)
    .parse(data)
    .map((c) => ({
      id: c.id,
      skillName: c.skill_name,
      categoryName: c.category_name,
      title: c.title,
      description: c.description,
      durationMinutes: c.duration_minutes,
      meetingDetails: c.meeting_details,
      available: c.available,
      cell: c.cell,
    }));
}

export async function signUpForCourse(supabase: SupabaseClient, id: string): Promise<Result> {
  const { error } = await supabase.rpc("sign_up_for_course", { p_id: id });
  return error ? { ok: false, message: courseErrorMessage(error) } : { ok: true };
}

export async function withdrawFromCourse(supabase: SupabaseClient, id: string): Promise<Result> {
  const { error } = await supabase.rpc("withdraw_from_course", { p_id: id });
  return error ? { ok: false, message: courseErrorMessage(error) } : { ok: true };
}
