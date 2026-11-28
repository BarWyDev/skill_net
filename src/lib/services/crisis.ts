import { z } from "zod";
import type { Database } from "@/db/database.types";
import type { Locale } from "@/lib/i18n/locale";
import {
  crisis as crisisMessages,
  crisisTypeName,
  scenarioName,
  teamRoleName,
  teamTemplateName,
} from "@/lib/i18n/messages/crisis";
import { skillName } from "@/lib/i18n/messages/taxonomy";
import type { SupabaseClient } from "@/lib/supabase";
import { reasonMessages } from "@/lib/reason";
import { assembleTeams } from "@/lib/team-assembly";
import { invalidTeamCountMessage } from "@/lib/validation/crisis";
import type {
  ActivateCrisisInput,
  CrisisContactDTO,
  CrisisCoverageDTO,
  CrisisDTO,
  CrisisMatchDTO,
  CrisisScenarioDTO,
  CrisisTeamDTO,
  CrisisTypeDTO,
  TeamMemberDTO,
  TeamTemplateDTO,
} from "@/types";

// Never log input values here: the epicentre can reveal an address in context, and a break-glass
// reason or a revealed number is personal data.

type ActivateCrisisArgs = Database["public"]["Functions"]["activate_crisis"]["Args"];

export const MATCHES_PAGE_SIZE = 200;

// Codes raised by activate_crisis in the crisis matching and activation audit migrations; their
// messages are in the `crisis` catalogue under `activate`.
const ACTIVATE_DB_ERRORS = [
  "not_coordinator",
  "unknown_crisis_type",
  "invalid_radius",
  "unknown_postcode",
  "outside_poland",
  "location_required",
  "activation_rate_limited",
] as const;

export function activateErrorMessage(error: { message?: string }, locale: Locale): string {
  const t = crisisMessages[locale].activate;
  const code = error.message;
  if (code === "reason_required") return reasonMessages(locale).required;
  if (code === "reason_too_long") return reasonMessages(locale).tooLong;
  const known = ACTIVATE_DB_ERRORS.find((c) => c === code);
  return known ? t[known] : t.failed;
}

/** Every crisis type, in its seeded order, named in `locale`. */
export async function getCrisisTypes(supabase: SupabaseClient, locale: Locale): Promise<CrisisTypeDTO[]> {
  const { data, error } = await supabase.from("crisis_types").select("slug, name_pl").order("sort");
  if (error) throw new Error(`getCrisisTypes: ${error.code}`);
  return data.map((t) => ({ slug: t.slug, name: crisisTypeName(locale, t.slug, t.name_pl) }));
}

/** Every ready exercise, in its seeded order, named in `locale`. RLS shows them to coordinators only. */
export async function getCrisisScenarios(supabase: SupabaseClient, locale: Locale): Promise<CrisisScenarioDTO[]> {
  const { data, error } = await supabase
    .from("crisis_scenarios")
    .select("slug, name_pl, postcode, radius_km, crisis_types(slug, name_pl)")
    .order("sort");
  if (error) throw new Error(`getCrisisScenarios: ${error.code}`);
  return data.map((s) => ({
    slug: s.slug,
    name: scenarioName(locale, s.slug, s.name_pl),
    typeName: crisisTypeName(locale, s.crisis_types.slug, s.crisis_types.name_pl),
    postcode: s.postcode,
    radiusKm: s.radius_km,
  }));
}

/**
 * Starts a ready exercise: activates its crisis type at its postcode and radius, with its reason, as
 * an exercise. The stored reason stays as seeded, whatever the language. Returns a message in
 * `locale` on failure.
 */
export async function startScenario(
  supabase: SupabaseClient,
  slug: string,
  locale: Locale,
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const { data, error } = await supabase
    .from("crisis_scenarios")
    .select("crisis_type_slug, postcode, radius_km, reason")
    .eq("slug", slug)
    .maybeSingle();
  const t = crisisMessages[locale].activate;
  if (error) return { ok: false, message: t.failed };
  if (!data) return { ok: false, message: t.exerciseNotFound };

  return activateCrisis(
    supabase,
    {
      crisisType: data.crisis_type_slug,
      locationSource: "postcode",
      postcode: data.postcode,
      lat: null,
      lng: null,
      // The table's check constraint keeps the radius to the presets.
      radiusKm: data.radius_km as ActivateCrisisInput["radiusKm"],
      reason: data.reason,
      exercise: true,
    },
    locale,
  );
}

/** Activates a crisis and writes its ranking snapshot. Returns a message in `locale` on failure. */
export async function activateCrisis(
  supabase: SupabaseClient,
  input: ActivateCrisisInput,
  locale: Locale,
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  // The generated types mark every RPC argument non-null, but SQL accepts nulls for these.
  const args = {
    p_crisis_type: input.crisisType,
    p_location_source: input.locationSource,
    p_postcode: input.postcode,
    p_lat: input.lat,
    p_lng: input.lng,
    p_radius_km: input.radiusKm,
    p_reason: input.reason,
    p_exercise: input.exercise,
  } as ActivateCrisisArgs;
  const { data, error } = await supabase.rpc("activate_crisis", args);
  return error ? { ok: false, message: activateErrorMessage(error, locale) } : { ok: true, id: data };
}

// Codes raised by end_crisis in the crisis deactivation migration; their messages are in the
// `crisis` catalogue under `end`.
const END_DB_ERRORS = ["not_coordinator", "unknown_crisis"] as const;

function endErrorMessage(error: { message?: string }, locale: Locale): string {
  const t = crisisMessages[locale].end;
  const known = END_DB_ERRORS.find((c) => c === error.message);
  return known ? t[known] : t.failed;
}

/**
 * Ends a crisis and deletes its ranking snapshot. `ended: false` means it was already ended.
 * Returns a message in `locale` on failure.
 */
export async function endCrisis(
  supabase: SupabaseClient,
  id: string,
  locale: Locale,
): Promise<{ ok: true; ended: boolean } | { ok: false; message: string }> {
  const { data, error } = await supabase.rpc("end_crisis", { p_crisis_id: id });
  return error ? { ok: false, message: endErrorMessage(error, locale) } : { ok: true, ended: data };
}

// `visible_match_count` and `reveal_declined_count` are PostgREST computed columns (SQL functions
// over the crises row type).
const CRISIS_COLUMNS =
  "id, radius_m, activated_at, ended_at, visible_match_count, reveal_declined_count, status, is_exercise, epicentre_postcode, crisis_types(slug, name_pl)";

interface CrisisRow {
  id: string;
  radius_m: number;
  activated_at: string;
  ended_at: string | null;
  visible_match_count: number | null;
  reveal_declined_count: number | null;
  status: string;
  is_exercise: boolean;
  epicentre_postcode: string | null;
  crisis_types: { slug: string; name_pl: string } | null;
}

function toCrisisDTO(row: CrisisRow, locale: Locale): CrisisDTO {
  const type = row.crisis_types;
  return {
    id: row.id,
    typeName: type ? crisisTypeName(locale, type.slug, type.name_pl) : "",
    radiusKm: row.radius_m / 1000,
    epicentrePostcode: row.epicentre_postcode,
    activatedAt: row.activated_at,
    endedAt: row.ended_at,
    matchCount: row.visible_match_count ?? 0,
    revealDeclinedCount: row.reveal_declined_count ?? 0,
    status: row.status === "ended" ? "ended" : "active",
    isExercise: row.is_exercise,
  };
}

/** Every active crisis, newest first, its type named in `locale`. RLS shows them to coordinators only. */
export async function listActiveCrises(supabase: SupabaseClient, locale: Locale): Promise<CrisisDTO[]> {
  const { data, error } = await supabase
    .from("crises")
    .select(CRISIS_COLUMNS)
    .eq("status", "active")
    .order("activated_at", { ascending: false });
  if (error) throw new Error(`listActiveCrises: ${error.code}`);
  return data.map((row) => toCrisisDTO(row, locale));
}

/** The most recently ended crises, newest end first. */
export async function listRecentEndedCrises(
  supabase: SupabaseClient,
  locale: Locale,
  limit = 10,
): Promise<CrisisDTO[]> {
  const { data, error } = await supabase
    .from("crises")
    .select(CRISIS_COLUMNS)
    .eq("status", "ended")
    .order("ended_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listRecentEndedCrises: ${error.code}`);
  return data.map((row) => toCrisisDTO(row, locale));
}

/** One crisis, or null when it does not exist or is not visible to the caller. */
export async function getCrisis(supabase: SupabaseClient, id: string, locale: Locale): Promise<CrisisDTO | null> {
  const { data, error } = await supabase.from("crises").select(CRISIS_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(`getCrisis: ${error.code}`);
  return data ? toCrisisDTO(data, locale) : null;
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

/**
 * A skill's name in `locale`: the catalogue, then the Polish name from the database, and the slug
 * only when both are missing (a skill added later, with the names lookup failed).
 */
function displaySkillName(locale: Locale, slug: string, names: Map<string, string>): string {
  return skillName(locale, slug, names.get(slug) ?? slug);
}

function toSkills(raw: unknown, names: Map<string, string>, locale: Locale): MatchedSkills {
  return matchedSkillsSchema.parse(raw).map((s) => ({ ...s, name: displaySkillName(locale, s.slug, names) }));
}

/** The first page of the ranked list, in position order, with skill names in `locale`. */
export async function getCrisisMatches(
  supabase: SupabaseClient,
  id: string,
  locale: Locale,
): Promise<CrisisMatchDTO[]> {
  const [matches, names] = await Promise.all([
    supabase.rpc("get_crisis_matches", { p_crisis_id: id, p_limit: MATCHES_PAGE_SIZE }),
    getSkillNames(supabase),
  ]);
  if (matches.error) throw new Error(`getCrisisMatches: ${matches.error.code}`);

  return matches.data.map((row) => ({
    rank: row.rank,
    position: row.position,
    distanceKm: row.distance_km_rounded,
    skills: toSkills(row.matched_skills, names, locale),
    hasPhone: row.has_phone,
    availabilitySlots: availabilitySlotsSchema.parse(row.availability_slots),
    availableNow: availableNowSchema.parse(row.available_now),
  }));
}

const coverageTierSchema = z.enum(["priority", "supporting"]);

/**
 * Every skill of the crisis type's matrix with how many people on the visible list have it, priority
 * skills first. Counts only, no person: reading them is not logged.
 */
export async function getCrisisCoverage(
  supabase: SupabaseClient,
  id: string,
  locale: Locale,
): Promise<CrisisCoverageDTO[]> {
  const [coverage, names] = await Promise.all([
    supabase.rpc("get_crisis_coverage", { p_crisis_id: id }),
    getSkillNames(supabase),
  ]);
  if (coverage.error) throw new Error(`getCrisisCoverage: ${coverage.error.code}`);

  return coverage.data.map((row) => ({
    slug: row.skill_slug,
    name: displaySkillName(locale, row.skill_slug, names),
    tier: coverageTierSchema.parse(row.tier),
    people: row.people,
    availableNow: row.available_now,
  }));
}

// Codes raised by reveal_crisis_contacts in the break-glass migration (and `reveal_rate_limited`
// from the crisis RPC limits migration); their messages are in the `crisis` catalogue under
// `contacts`. `field` marks the ones the coordinator fixes in the reason box; `status` is the page's
// HTTP status, so failed reveals show up in Workers error logs without logging anything personal.
const REVEAL_DB_ERRORS = {
  not_coordinator: { status: 403 },
  unknown_crisis: { status: 404 },
  crisis_not_active: { status: 200, ended: true },
  reason_required: { status: 422, field: "reason" },
  reason_too_long: { status: 422, field: "reason" },
  exercise_no_reveal: { status: 409 },
  reveal_rate_limited: { status: 429 },
} as const satisfies Record<string, { status: number; field?: "reason"; ended?: true }>;

type RevealErrorCode = keyof typeof REVEAL_DB_ERRORS;
const REVEAL_ERROR_CODES = Object.keys(REVEAL_DB_ERRORS) as RevealErrorCode[];

function revealError(error: { message?: string }, locale: Locale): Extract<RevealResult, { ok: false }> {
  const t = crisisMessages[locale].contacts;
  const code = REVEAL_ERROR_CODES.find((c) => c === error.message);
  if (!code) return { ok: false, message: t.failed, status: 500 };
  const message =
    code === "reason_required"
      ? reasonMessages(locale).required
      : code === "reason_too_long"
        ? reasonMessages(locale).tooLong
        : t[code];
  return { ok: false, message, ...REVEAL_DB_ERRORS[code] };
}

export type RevealResult =
  | { ok: true; contacts: CrisisContactDTO[] }
  | { ok: false; message: string; status: number; field?: "reason"; ended?: true };

/**
 * Break-glass: logs the reveal and returns the current number of every matched resident who has
 * one, in position order, with skill names in `locale`. The numbers exist only in this result:
 * never store or log them. Returns a message in `locale` on failure.
 */
export async function revealCrisisContacts(
  supabase: SupabaseClient,
  id: string,
  reason: string,
  locale: Locale,
): Promise<RevealResult> {
  const { data, error } = await supabase.rpc("reveal_crisis_contacts", { p_crisis_id: id, p_reason: reason });
  if (error) return revealError(error, locale);

  // The reveal is already logged, so nothing after this point may hide the numbers: a failed
  // name lookup or an unexpected column shape falls back instead of throwing. Naming a skill is a
  // lookup in a static catalogue, with the Polish name and then the slug behind it, so it cannot fail.
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
        skills: skills.success ? skills.data.map((s) => ({ ...s, name: displaySkillName(locale, s.slug, names) })) : [],
        phone: row.phone,
        phoneVerified: row.phone_verified,
        availabilitySlots: slots.success ? slots.data : null,
        availableNow: now.success ? now.data : null,
      };
    }),
  };
}

/** Every team template with its roles, both in their seeded order and named in `locale`. */
export async function getTeamTemplates(supabase: SupabaseClient, locale: Locale): Promise<TeamTemplateDTO[]> {
  const { data, error } = await supabase
    .from("team_templates")
    .select("slug, name_pl, team_template_roles(role_slug, name_pl, slots, sort)")
    .order("sort");
  if (error) throw new Error(`getTeamTemplates: ${error.code}`);
  return data.map((t) => ({
    slug: t.slug,
    name: teamTemplateName(locale, t.slug, t.name_pl),
    roles: [...t.team_template_roles]
      .sort((a, b) => a.sort - b.sort)
      .map((r) => ({ slug: r.role_slug, name: teamRoleName(locale, t.slug, r.role_slug, r.name_pl), slots: r.slots })),
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

// Codes raised by get_team_candidates in the crisis team templates migration; their messages are in
// the `crisis` catalogue under `teams`.
const TEAMS_DB_ERRORS = {
  not_coordinator: { status: 403 },
  unknown_crisis: { status: 404 },
  crisis_not_active: { status: 200, ended: true },
  unknown_template: { status: 422 },
  invalid_team_count: { status: 422 },
} as const satisfies Record<string, { status: number; ended?: true }>;

type TeamsErrorCode = keyof typeof TEAMS_DB_ERRORS;
const TEAMS_ERROR_CODES = Object.keys(TEAMS_DB_ERRORS) as TeamsErrorCode[];

function teamsError(error: { message?: string }, locale: Locale): Extract<AssembleTeamsResult, { ok: false }> {
  const t = crisisMessages[locale].teams;
  const code = TEAMS_ERROR_CODES.find((c) => c === error.message);
  if (!code) return { ok: false, message: t.failed, status: 500 };
  const message =
    code === "unknown_template"
      ? t.chooseTemplate
      : code === "invalid_team_count"
        ? invalidTeamCountMessage(locale)
        : t[code];
  return { ok: false, message, ...TEAMS_DB_ERRORS[code] };
}

export type AssembleTeamsResult =
  | { ok: true; teams: CrisisTeamDTO[]; completeCount: number }
  | { ok: false; message: string; status: number; ended?: true };

/**
 * Assembles up to `count` teams of `template` from the crisis's ranked list: as many complete
 * teams as possible, then the best-ranked people, then at most one partial team. Computed per
 * request from the snapshot and the residents' current skills; nothing is stored. Skill names and
 * messages are in `locale`; role names come translated with `template`.
 */
export async function assembleCrisisTeams(
  supabase: SupabaseClient,
  crisisId: string,
  template: TeamTemplateDTO,
  count: number,
  locale: Locale,
): Promise<AssembleTeamsResult> {
  const [candidates, names] = await Promise.all([
    supabase.rpc("get_team_candidates", { p_crisis_id: crisisId, p_template: template.slug, p_teams: count }),
    getSkillNames(supabase),
  ]);
  if (candidates.error) return teamsError(candidates.error, locale);

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
        member: slot.candidate && toTeamMember(slot.candidate, slot.role, names, locale),
      })),
    })),
  };
}

function toTeamMember(
  candidate: { roleSkills: z.infer<typeof roleSkillsSchema>; base: Omit<TeamMemberDTO, "skills"> },
  role: string,
  names: Map<string, string>,
  locale: Locale,
): TeamMemberDTO {
  const skills = (candidate.roleSkills[role] ?? []).map((s) => ({
    ...s,
    name: displaySkillName(locale, s.slug, names),
  }));
  return { ...candidate.base, skills };
}
