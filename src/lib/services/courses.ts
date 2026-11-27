import { z } from "zod";
import type { Database } from "@/db/database.types";
import { format, formatDate } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/locale";
import { courses } from "@/lib/i18n/messages/courses";
import { courseMessage } from "@/lib/validation/courses";
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

/** The message in `locale` for a code raised by the RPCs in the neighbour courses migration. */
export function courseErrorMessage(error: { message?: string }, locale: Locale): string {
  return courseMessage(locale, error.message, "generic");
}

/**
 * Why a course is hidden, in `locale`. `eligibleOn` is the organiser's own date from getCourseArea,
 * which for a recent move is the day the course comes back.
 */
export function hiddenReasonLabel(reason: CourseHiddenReason, eligibleOn: string | null, locale: Locale): string {
  const labels = courses[locale].hidden;
  if (reason === "recent_move" && eligibleOn) {
    return format(labels.recent_move_until, { date: formatDate(locale, eligibleOn) });
  }
  return labels[reason];
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
  locale: Locale,
): Promise<Result<{ id: string }>> {
  const args = { p_skill_slug: input.skillSlug, ...courseArgs(input) } as CreateCourseArgs;
  const { data, error } = await supabase.rpc("create_course", args);
  return error ? { ok: false, message: courseErrorMessage(error, locale) } : { ok: true, id: data };
}

export async function updateCourse(
  supabase: SupabaseClient,
  input: CourseInput & { id: string },
  locale: Locale,
): Promise<Result> {
  const args = { p_id: input.id, ...courseArgs(input) } as UpdateCourseArgs;
  const { error } = await supabase.rpc("update_course", args);
  return error ? { ok: false, message: courseErrorMessage(error, locale) } : { ok: true };
}

/** Closes (false) or reopens (true) a course. */
export async function setCourseOpen(
  supabase: SupabaseClient,
  id: string,
  open: boolean,
  locale: Locale,
): Promise<Result> {
  const { error } = await supabase.rpc("set_course_open", { p_id: id, p_open: open });
  return error ? { ok: false, message: courseErrorMessage(error, locale) } : { ok: true };
}

/** Restarts the course's 90 days. */
export async function renewCourse(supabase: SupabaseClient, id: string, locale: Locale): Promise<Result> {
  const { error } = await supabase.rpc("renew_course", { p_id: id });
  return error ? { ok: false, message: courseErrorMessage(error, locale) } : { ok: true };
}

/** Deletes a course and every sign-up to it. */
export async function deleteCourse(supabase: SupabaseClient, id: string, locale: Locale): Promise<Result> {
  const { error } = await supabase.rpc("delete_course", { p_id: id });
  return error ? { ok: false, message: courseErrorMessage(error, locale) } : { ok: true };
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
    }));
}

export async function signUpForCourse(supabase: SupabaseClient, id: string, locale: Locale): Promise<Result> {
  const { error } = await supabase.rpc("sign_up_for_course", { p_id: id });
  return error ? { ok: false, message: courseErrorMessage(error, locale) } : { ok: true };
}

export async function withdrawFromCourse(supabase: SupabaseClient, id: string, locale: Locale): Promise<Result> {
  const { error } = await supabase.rpc("withdraw_from_course", { p_id: id });
  return error ? { ok: false, message: courseErrorMessage(error, locale) } : { ok: true };
}
