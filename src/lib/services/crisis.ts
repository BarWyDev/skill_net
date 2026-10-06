import { z } from "zod";
import type { Database } from "@/db/database.types";
import type { SupabaseClient } from "@/lib/supabase";
import { assembleTeams } from "@/lib/team-assembly";
import type {
  ActivateCrisisInput,
  CrisisContactDTO,
  CrisisDTO,
  CrisisMatchDTO,
  CrisisTeamDTO,
  CrisisTypeDTO,
  TeamMemberDTO,
  TeamTemplateDTO,
} from "@/types";

// Never log input values here: the epicentre can reveal an address in context, and a break-glass
// reason or a revealed number is personal data.

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

// `visible_match_count` is a PostgREST computed column (a SQL function over the crises row type).
// The generated types only recognise computed columns whose parameter is unnamed, so the queries
// below override the row type.
const CRISIS_COLUMNS = "id, radius_m, activated_at, ended_at, visible_match_count, status, crisis_types(name_pl)";

interface CrisisRow {
  id: string;
  radius_m: number;
  activated_at: string;
  ended_at: string | null;
  visible_match_count: number;
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
    matchCount: row.visible_match_count,
    status: row.status === "ended" ? "ended" : "active",
  };
}

/** Every active crisis, newest first. RLS shows them to coordinators only. */
export async function listActiveCrises(supabase: SupabaseClient): Promise<CrisisDTO[]> {
  const { data, error } = await supabase
    .from("crises")
    .select(CRISIS_COLUMNS)
    .eq("status", "active")
    .order("activated_at", { ascending: false })
    .overrideTypes<CrisisRow[], { merge: false }>();
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
    .limit(limit)
    .overrideTypes<CrisisRow[], { merge: false }>();
  if (error) throw new Error(`listRecentEndedCrises: ${error.code}`);
  return data.map(toCrisisDTO);
}

/** One crisis, or null when it does not exist or is not visible to the caller. */
export async function getCrisis(supabase: SupabaseClient, id: string): Promise<CrisisDTO | null> {
  const { data, error } = await supabase
    .from("crises")
    .select(CRISIS_COLUMNS)
    .eq("id", id)
    .maybeSingle()
    .overrideTypes<CrisisRow | null, { merge: false }>();
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

type MatchedSkills = CrisisMatchDTO["skills"];

async function getSkillNames(supabase: SupabaseClient): Promise<Map<string, string>> {
  const { data, error } = await supabase.from("skills").select("slug, name_pl");
  if (error) throw new Error(`getSkillNames: ${error.code}`);
  return new Map(data.map((s) => [s.slug, s.name_pl]));
}

function toSkills(raw: unknown, names: Map<string, string>): MatchedSkills {
  return matchedSkillsSchema.parse(raw).map((s) => ({ ...s, name: names.get(s.slug) ?? s.slug }));
}

/** The first page of the ranked list, in position order, with skill names for display. */
export async function getCrisisMatches(supabase: SupabaseClient, id: string): Promise<CrisisMatchDTO[]> {
  const [matches, names] = await Promise.all([
    supabase.rpc("get_crisis_matches", { p_crisis_id: id, p_limit: MATCHES_PAGE_SIZE }),
    getSkillNames(supabase),
  ]);
  if (matches.error) throw new Error(`getCrisisMatches: ${matches.error.code}`);

  return matches.data.map((row) => ({
    rank: row.rank,
    position: row.position,
    distanceKm: row.distance_km_rounded,
    skills: toSkills(row.matched_skills, names),
    hasPhone: row.has_phone,
    availabilitySlots: availabilitySlotsSchema.parse(row.availability_slots),
    availableNow: availableNowSchema.parse(row.available_now),
  }));
}

const GENERIC_REVEAL_ERROR = "Nie udało się ujawnić kontaktów. Spróbuj ponownie.";

// Messages raised by reveal_crisis_contacts in the break-glass migration. `field` marks the ones
// the coordinator fixes in the reason box; `status` is the page's HTTP status, so failed reveals
// show up in Workers error logs without logging anything personal.
const REVEAL_DB_ERRORS: Partial<Record<string, { message: string; status: number; field?: "reason"; ended?: true }>> = {
  not_coordinator: { message: "Tylko koordynator może ujawnić kontakty.", status: 403 },
  unknown_crisis: { message: "Nie znaleziono kryzysu.", status: 404 },
  crisis_not_active: {
    message: "Ten kryzys został już zakończony — kontaktów nie można ujawnić.",
    status: 200,
    ended: true,
  },
  reason_required: { message: "Podaj powód (co najmniej 10 znaków).", status: 422, field: "reason" },
  reason_too_long: { message: "Powód może mieć najwyżej 500 znaków.", status: 422, field: "reason" },
};

export type RevealResult =
  | { ok: true; contacts: CrisisContactDTO[] }
  | { ok: false; message: string; status: number; field?: "reason"; ended?: true };

/**
 * Break-glass: logs the reveal and returns the current number of every matched resident who has
 * one, in position order. The numbers exist only in this result: never store or log them.
 */
export async function revealCrisisContacts(
  supabase: SupabaseClient,
  id: string,
  reason: string,
): Promise<RevealResult> {
  const { data, error } = await supabase.rpc("reveal_crisis_contacts", { p_crisis_id: id, p_reason: reason });
  if (error) {
    return { ok: false, ...(REVEAL_DB_ERRORS[error.message] ?? { message: GENERIC_REVEAL_ERROR, status: 500 }) };
  }

  // The reveal is already logged, so nothing after this point may hide the numbers: a failed
  // name lookup or an unexpected column shape falls back instead of throwing.
  const names = await getSkillNames(supabase).catch(() => new Map<string, string>());
  return {
    ok: true,
    contacts: data.map((row) => {
      const skills = matchedSkillsSchema.safeParse(row.matched_skills);
      const slots = availabilitySlotsSchema.safeParse(row.availability_slots);
      const now = availableNowSchema.safeParse(row.available_now);
      return {
        rank: row.rank,
        position: row.position,
        distanceKm: row.distance_km_rounded,
        skills: skills.success ? skills.data.map((s) => ({ ...s, name: names.get(s.slug) ?? s.slug })) : [],
        phone: row.phone,
        phoneVerified: row.phone_verified,
        availabilitySlots: slots.success ? slots.data : null,
        availableNow: now.success ? now.data : null,
      };
    }),
  };
}

/** Every team template with its roles, both in their seeded order. */
export async function getTeamTemplates(supabase: SupabaseClient): Promise<TeamTemplateDTO[]> {
  const { data, error } = await supabase
    .from("team_templates")
    .select("slug, name_pl, team_template_roles(role_slug, name_pl, slots, sort)")
    .order("sort");
  if (error) throw new Error(`getTeamTemplates: ${error.code}`);
  return data.map((t) => ({
    slug: t.slug,
    name: t.name_pl,
    roles: [...t.team_template_roles]
      .sort((a, b) => a.sort - b.sort)
      .map((r) => ({ slug: r.role_slug, name: r.name_pl, slots: r.slots })),
  }));
}

const roleSkillsSchema = z.record(
  z.string(),
  z.array(
    z.object({
      slug: z.string(),
      level: z.union([z.literal(1), z.literal(2), z.literal(3)]).nullable(),
    }),
  ),
);

const GENERIC_TEAMS_ERROR = "Nie udało się złożyć zespołów. Spróbuj ponownie.";

// Messages raised by get_team_candidates in the crisis team templates migration.
const TEAMS_DB_ERRORS: Partial<Record<string, { message: string; status: number; ended?: true }>> = {
  not_coordinator: { message: "Tylko koordynator może składać zespoły.", status: 403 },
  unknown_crisis: { message: "Nie znaleziono kryzysu.", status: 404 },
  crisis_not_active: {
    message: "Ten kryzys został zakończony — lista osób została usunięta.",
    status: 200,
    ended: true,
  },
  unknown_template: { message: "Wybierz szablon zespołu z listy.", status: 422 },
  invalid_team_count: { message: "Podaj liczbę zespołów od 1 do 10.", status: 422 },
};

export type AssembleTeamsResult =
  | { ok: true; teams: CrisisTeamDTO[]; completeCount: number }
  | { ok: false; message: string; status: number; ended?: true };

/**
 * Assembles up to `count` teams of `template` from the crisis's ranked list: as many complete
 * teams as possible, then the best-ranked people, then at most one partial team. Computed per
 * request from the snapshot and the residents' current skills; nothing is stored.
 */
export async function assembleCrisisTeams(
  supabase: SupabaseClient,
  crisisId: string,
  template: TeamTemplateDTO,
  count: number,
): Promise<AssembleTeamsResult> {
  const [candidates, names] = await Promise.all([
    supabase.rpc("get_team_candidates", { p_crisis_id: crisisId, p_template: template.slug, p_teams: count }),
    getSkillNames(supabase),
  ]);
  if (candidates.error) {
    return {
      ok: false,
      ...(TEAMS_DB_ERRORS[candidates.error.message] ?? { message: GENERIC_TEAMS_ERROR, status: 500 }),
    };
  }

  const pool = candidates.data.map((row) => {
    const roleSkills = roleSkillsSchema.parse(row.role_skills);
    const base = {
      rank: row.rank,
      position: row.position,
      distanceKm: row.distance_km_rounded,
      hasPhone: row.has_phone,
      availabilitySlots: availabilitySlotsSchema.parse(row.availability_slots),
      availableNow: availableNowSchema.parse(row.available_now),
    };
    return { position: row.position, roles: Object.keys(roleSkills), roleSkills, base };
  });

  const { teams, completeCount } = assembleTeams(template.roles, pool, count);
  const roleNames = new Map(template.roles.map((r) => [r.slug, r.name]));

  return {
    ok: true,
    completeCount,
    teams: teams.map((team, i) => ({
      number: i + 1,
      complete: team.complete,
      slots: team.slots.map((slot) => ({
        roleSlug: slot.role,
        roleName: roleNames.get(slot.role) ?? slot.role,
        member: slot.candidate && toTeamMember(slot.candidate, slot.role, names),
      })),
    })),
  };
}

function toTeamMember(
  candidate: { roleSkills: z.infer<typeof roleSkillsSchema>; base: Omit<TeamMemberDTO, "skills"> },
  role: string,
  names: Map<string, string>,
): TeamMemberDTO {
  const skills = (candidate.roleSkills[role] ?? []).map((s) => ({ ...s, name: names.get(s.slug) ?? s.slug }));
  return { ...candidate.base, skills };
}
