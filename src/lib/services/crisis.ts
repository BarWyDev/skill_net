import { z } from "zod";
import type { Database } from "@/db/database.types";
import type { SupabaseClient } from "@/lib/supabase";
import type { ActivateCrisisInput, CrisisDTO, CrisisMatchDTO, CrisisTypeDTO } from "@/types";

// Never log input values here: the epicentre can reveal an address in context.

type ActivateCrisisArgs = Database["public"]["Functions"]["activate_crisis"]["Args"];

export const MATCHES_PAGE_SIZE = 200;

const GENERIC_ACTIVATE_ERROR = "Nie udało się aktywować trybu kryzysowego. Spróbuj ponownie.";

// Messages raised by activate_crisis in the crisis matching migration.
const DB_ERROR_MESSAGES: Record<string, string> = {
  not_coordinator: "Tylko koordynator może aktywować tryb kryzysowy.",
  unknown_crisis_type: "Wybierz rodzaj kryzysu z listy.",
  invalid_radius: "Wybierz promień z listy.",
  unknown_postcode: "Nie znamy tego kodu pocztowego — zaznacz epicentrum na mapie.",
  outside_poland: "Epicentrum musi być w Polsce.",
  location_required: "Wskaż epicentrum: wpisz kod pocztowy albo zaznacz punkt na mapie.",
};

export function activateErrorMessage(error: { message?: string }): string {
  return (error.message && DB_ERROR_MESSAGES[error.message]) ?? GENERIC_ACTIVATE_ERROR;
}

export async function getCrisisTypes(supabase: SupabaseClient): Promise<CrisisTypeDTO[]> {
  const { data, error } = await supabase.from("crisis_types").select("slug, name_pl").order("sort");
  if (error) throw new Error(`getCrisisTypes: ${error.code}`);
  return data.map((t) => ({ slug: t.slug, name: t.name_pl }));
}

/** Activates a crisis and writes its ranking snapshot. Returns a Polish message on failure. */
export async function activateCrisis(
  supabase: SupabaseClient,
  input: ActivateCrisisInput,
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  // The generated types mark every RPC argument non-null, but SQL accepts nulls for these.
  const args = {
    p_crisis_type: input.crisisType,
    p_location_source: input.locationSource,
    p_postcode: input.postcode,
    p_lat: input.lat,
    p_lng: input.lng,
    p_radius_km: input.radiusKm,
  } as ActivateCrisisArgs;
  const { data, error } = await supabase.rpc("activate_crisis", args);
  return error ? { ok: false, message: activateErrorMessage(error) } : { ok: true, id: data };
}

const GENERIC_END_ERROR = "Nie udało się zakończyć kryzysu. Spróbuj ponownie.";

// Messages raised by end_crisis in the crisis deactivation migration.
const END_DB_ERROR_MESSAGES: Record<string, string> = {
  not_coordinator: "Tylko koordynator może zakończyć tryb kryzysowy.",
  unknown_crisis: "Nie znaleziono kryzysu.",
};

function endErrorMessage(error: { message?: string }): string {
  return (error.message && END_DB_ERROR_MESSAGES[error.message]) ?? GENERIC_END_ERROR;
}

/**
 * Ends a crisis and deletes its ranking snapshot. `ended: false` means it was already ended.
 * Returns a Polish message on failure.
 */
export async function endCrisis(
  supabase: SupabaseClient,
  id: string,
): Promise<{ ok: true; ended: boolean } | { ok: false; message: string }> {
  const { data, error } = await supabase.rpc("end_crisis", { p_crisis_id: id });
  return error ? { ok: false, message: endErrorMessage(error) } : { ok: true, ended: data };
}

const CRISIS_COLUMNS = "id, radius_m, activated_at, ended_at, match_count, status, crisis_types(name_pl)";

interface CrisisRow {
  id: string;
  radius_m: number;
  activated_at: string;
  ended_at: string | null;
  match_count: number;
  status: string;
  crisis_types: { name_pl: string } | null;
}

function toCrisisDTO(row: CrisisRow): CrisisDTO {
  return {
    id: row.id,
    typeName: row.crisis_types?.name_pl ?? "",
    radiusKm: row.radius_m / 1000,
    activatedAt: row.activated_at,
    endedAt: row.ended_at,
    matchCount: row.match_count,
    status: row.status === "ended" ? "ended" : "active",
  };
}

/** Every active crisis, newest first. RLS shows them to coordinators only. */
export async function listActiveCrises(supabase: SupabaseClient): Promise<CrisisDTO[]> {
  const { data, error } = await supabase
    .from("crises")
    .select(CRISIS_COLUMNS)
    .eq("status", "active")
    .order("activated_at", { ascending: false });
  if (error) throw new Error(`listActiveCrises: ${error.code}`);
  return data.map(toCrisisDTO);
}

/** The most recently ended crises, newest end first. */
export async function listRecentEndedCrises(supabase: SupabaseClient, limit = 10): Promise<CrisisDTO[]> {
  const { data, error } = await supabase
    .from("crises")
    .select(CRISIS_COLUMNS)
    .eq("status", "ended")
    .order("ended_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listRecentEndedCrises: ${error.code}`);
  return data.map(toCrisisDTO);
}

/** One crisis, or null when it does not exist or is not visible to the caller. */
export async function getCrisis(supabase: SupabaseClient, id: string): Promise<CrisisDTO | null> {
  const { data, error } = await supabase.from("crises").select(CRISIS_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(`getCrisis: ${error.code}`);
  return data ? toCrisisDTO(data) : null;
}

const matchedSkillsSchema = z.array(
  z.object({
    slug: z.string(),
    tier: z.enum(["priority", "supporting"]),
    level: z.union([z.literal(1), z.literal(2), z.literal(3)]).nullable(),
  }),
);

// The generated types mark these non-null, but the RPC returns null when availability is not declared.
const availabilitySlotsSchema = z.number().int().nullable();
const availableNowSchema = z.boolean().nullable();

/** The first page of the ranked list, in position order, with skill names for display. */
export async function getCrisisMatches(supabase: SupabaseClient, id: string): Promise<CrisisMatchDTO[]> {
  const [matches, skills] = await Promise.all([
    supabase.rpc("get_crisis_matches", { p_crisis_id: id, p_limit: MATCHES_PAGE_SIZE }),
    supabase.from("skills").select("slug, name_pl"),
  ]);
  if (matches.error) throw new Error(`getCrisisMatches: ${matches.error.code}`);
  if (skills.error) throw new Error(`getCrisisMatches: ${skills.error.code}`);

  const names = new Map(skills.data.map((s) => [s.slug, s.name_pl]));
  return matches.data.map((row) => ({
    rank: row.rank,
    position: row.position,
    distanceKm: row.distance_km_rounded,
    skills: matchedSkillsSchema.parse(row.matched_skills).map((s) => ({ ...s, name: names.get(s.slug) ?? s.slug })),
    hasPhone: row.has_phone,
    availabilitySlots: availabilitySlotsSchema.parse(row.availability_slots),
    availableNow: availableNowSchema.parse(row.available_now),
  }));
}
