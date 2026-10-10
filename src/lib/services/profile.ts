import { z } from "zod";
import type { Database } from "@/db/database.types";
import { PHONE_ERROR } from "@/lib/phone";
import type { SupabaseClient } from "@/lib/supabase";
import type { MyProfileDTO, NumberRevealDTO, SaveProfileInput, TaxonomyDTO } from "@/types";

// Never log input values here: postcodes, coordinates, skills, phones and availability are personal data.

type SaveMyProfileArgs = Database["public"]["Functions"]["save_my_profile"]["Args"];
type PauseMyAvailabilityArgs = Database["public"]["Functions"]["pause_my_availability"]["Args"];

const GENERIC_SAVE_ERROR = "Nie udało się zapisać profilu. Spróbuj ponownie.";

// Messages raised by the triggers and RPCs in the profile migrations.
const DB_ERROR_MESSAGES: Record<string, string> = {
  unknown_postcode: "Nie znamy tego kodu pocztowego — zaznacz lokalizację na mapie.",
  postcode_required: "Podaj kod pocztowy w formacie 00-000.",
  outside_poland: "Lokalizacja musi być w Polsce.",
  level_required: "Wybierz poziom dla każdej zaznaczonej umiejętności.",
  level_not_applicable: "Ta umiejętność nie ma poziomu.",
  invalid_phone: PHONE_ERROR,
};
const FOREIGN_KEY_VIOLATION = "23503";

export function saveErrorMessage(error: { code?: string; message?: string }): string {
  if (error.code === FOREIGN_KEY_VIOLATION) return "Nieznana umiejętność.";
  return (error.message && DB_ERROR_MESSAGES[error.message]) ?? GENERIC_SAVE_ERROR;
}

export async function getTaxonomy(supabase: SupabaseClient): Promise<TaxonomyDTO> {
  const [categories, skills] = await Promise.all([
    supabase.from("skill_categories").select("slug, name_pl").order("sort"),
    supabase.from("skills").select("slug, category_slug, name_pl, has_level").order("category_slug").order("sort"),
  ]);
  if (categories.error) throw new Error(`getTaxonomy: ${categories.error.code}`);
  if (skills.error) throw new Error(`getTaxonomy: ${skills.error.code}`);

  return {
    categories: categories.data.map((c) => ({ slug: c.slug, name: c.name_pl })),
    skills: skills.data.map((s) => ({
      slug: s.slug,
      categorySlug: s.category_slug,
      name: s.name_pl,
      hasLevel: s.has_level,
    })),
  };
}

const myProfileSchema = z.object({
  location_source: z.enum(["postcode", "pin"]).nullable(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  skills: z.array(
    z.object({ slug: z.string(), level: z.union([z.literal(1), z.literal(2), z.literal(3)]).nullable() }),
  ),
  matchable: z.boolean(),
  complete: z.boolean(),
  paused: z.boolean(),
  paused_until: z.string().nullable(),
  phone: z.string().nullable(),
  phone_verified: z.boolean(),
  availability_slots: z.number().int().nullable(),
});

export async function getMyProfile(supabase: SupabaseClient): Promise<MyProfileDTO> {
  const { data, error } = await supabase.rpc("get_my_profile");
  if (error) throw new Error(`getMyProfile: ${error.code}`);

  const profile = myProfileSchema.parse(data);
  return {
    locationSource: profile.location_source,
    lat: profile.lat,
    lng: profile.lng,
    skills: profile.skills,
    matchable: profile.matchable,
    complete: profile.complete,
    paused: profile.paused,
    pausedUntil: profile.paused_until,
    phone: profile.phone,
    phoneVerified: profile.phone_verified,
    availabilitySlots: profile.availability_slots,
  };
}

/** Every break-glass reveal of the caller's number, newest first (security audit F-11). */
export async function getMyNumberReveals(supabase: SupabaseClient): Promise<NumberRevealDTO[]> {
  const { data, error } = await supabase.rpc("get_my_number_reveals");
  if (error) throw new Error(`getMyNumberReveals: ${error.code}`);
  // The generated types mark the postcode non-null, but crises from before it was stored have none.
  return data.map((row) => ({
    revealedAt: row.revealed_at,
    crisisType: row.crisis_type,
    epicentrePostcode: (row.epicentre_postcode as string | null) ?? null,
  }));
}

/** Saves the caller's location, whole skill set, phone and availability atomically. Returns a Polish message on failure. */
export async function saveMyProfile(
  supabase: SupabaseClient,
  input: SaveProfileInput,
): Promise<{ ok: true } | { ok: false; message: string }> {
  // The generated types mark every RPC argument non-null, but SQL accepts nulls for these.
  const args = {
    p_location_source: input.locationSource,
    p_postcode: input.postcode,
    p_lat: input.lat,
    p_lng: input.lng,
    p_skills: input.skills.map((s) => ({ slug: s.slug, level: s.level })),
    p_phone: input.phone,
    p_availability_slots: input.availabilitySlots,
  } as SaveMyProfileArgs;
  const { error } = await supabase.rpc("save_my_profile", args);
  return error ? { ok: false, message: saveErrorMessage(error) } : { ok: true };
}

const GENERIC_PAUSE_ERROR = "Nie udało się wstrzymać dostępności. Spróbuj ponownie.";
const GENERIC_RESUME_ERROR = "Nie udało się wznowić dostępności. Spróbuj ponownie.";

// Messages raised by the pause RPCs and the `profiles_check_pause` trigger.
const PAUSE_DB_ERROR_MESSAGES: Record<string, string> = {
  invalid_pause_until: "Wybierz datę od dziś do roku naprzód.",
  profile_required: "Najpierw uzupełnij profil.",
};

/**
 * Pauses the caller's availability until `until` (`YYYY-MM-DD`, inclusive) or indefinitely when null.
 * Re-pausing replaces the previous pause. Returns a Polish message on failure.
 */
export async function pauseMyAvailability(
  supabase: SupabaseClient,
  until: string | null,
): Promise<{ ok: true } | { ok: false; message: string }> {
  // The generated types mark the argument non-null, but SQL accepts null for an indefinite pause.
  const { error } = await supabase.rpc("pause_my_availability", { p_until: until } as PauseMyAvailabilityArgs);
  return error ? { ok: false, message: PAUSE_DB_ERROR_MESSAGES[error.message] ?? GENERIC_PAUSE_ERROR } : { ok: true };
}

/** Ends the caller's pause. Idempotent. Returns a Polish message on failure. */
export async function resumeMyAvailability(
  supabase: SupabaseClient,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await supabase.rpc("resume_my_availability");
  return error ? { ok: false, message: GENERIC_RESUME_ERROR } : { ok: true };
}

/** Whether the user can be matched in a crisis; null when the check itself failed. */
export async function isProfileMatchable(supabase: SupabaseClient, userId: string): Promise<boolean | null> {
  const { data, error } = await supabase.rpc("profile_is_matchable", { p_user_id: userId });
  return error ? null : data;
}

/** The coarsened centroid a profile would store for this postcode, or null if unknown. */
export async function lookupPostcode(
  supabase: SupabaseClient,
  postcode: string,
): Promise<{ lat: number; lng: number } | null> {
  const { data, error } = await supabase.rpc("lookup_postcode", { p_postcode: postcode });
  if (error) throw new Error(`lookupPostcode: ${error.code}`);
  return data[0] ?? null;
}
