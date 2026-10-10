import { z } from "zod";
import { normalisePostcode, POSTCODE_ERROR } from "@/lib/postcode";
import type { ActivateCrisisInput, RadiusKm } from "@/types";

export const RADIUS_PRESETS: RadiusKm[] = [1, 2, 5, 10, 20];
export const DEFAULT_RADIUS: RadiusKm = 5;

const LOCATION_REQUIRED = "Wskaż epicentrum: wpisz kod pocztowy albo zaznacz punkt na mapie.";

const coordinate = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(1, LOCATION_REQUIRED)
    .transform(Number)
    .refine((n) => Number.isFinite(n) && n >= min && n <= max, "Nieprawidłowa lokalizacja epicentrum.");

export const REASON_MIN = 10;
export const REASON_MAX = 500;

// The same bounds and messages as activate_crisis and reveal_crisis_contacts, which check them again.
const reasonSchema = z
  .string()
  .trim()
  .min(REASON_MIN, `Podaj powód (co najmniej ${REASON_MIN} znaków).`)
  .max(REASON_MAX, `Powód może mieć najwyżej ${REASON_MAX} znaków.`);

const common = {
  // Whether the type exists is checked by the RPC, the single source of truth.
  crisis_type: z.string().regex(/^[a-z0-9-]+$/, "Wybierz rodzaj kryzysu."),
  radius_km: z
    .string()
    .transform(Number)
    .refine((n): n is RadiusKm => (RADIUS_PRESETS as number[]).includes(n), "Wybierz promień z listy."),
  reason: reasonSchema,
};

const crisisFormSchema = z.discriminatedUnion(
  "location_source",
  [
    z.object({
      ...common,
      location_source: z.literal("postcode"),
      postcode: z.string().transform((value, ctx) => {
        const postcode = normalisePostcode(value);
        if (postcode === null) {
          ctx.addIssue({ code: "custom", message: POSTCODE_ERROR });
          return z.NEVER;
        }
        return postcode;
      }),
    }),
    z.object({
      ...common,
      location_source: z.literal("pin"),
      lat: coordinate(-90, 90),
      lng: coordinate(-180, 180),
    }),
  ],
  { error: LOCATION_REQUIRED },
);

/** Parses the break-glass reason from the reveal form. Messages are Polish and safe to show. */
export function parseRevealReason(
  form: FormData,
): { success: true; data: string } | { success: false; message: string } {
  const value = form.get("reason");
  const result = reasonSchema.safeParse(typeof value === "string" ? value : "");
  return result.success
    ? { success: true, data: result.data }
    : { success: false, message: result.error.issues[0]?.message ?? "Podaj powód." };
}

export const TEAM_COUNT_MIN = 1;
export const TEAM_COUNT_MAX = 10;

// The same bounds as get_team_candidates, which checks them again; whether the template exists is
// checked against the seeded templates.
export const teamRequestSchema = z.object({
  szablon: z.string().regex(/^[a-z-]{1,40}$/, "Wybierz szablon zespołu z listy."),
  liczba: z.coerce
    .number({ error: `Podaj liczbę zespołów od ${TEAM_COUNT_MIN} do ${TEAM_COUNT_MAX}.` })
    .int(`Podaj liczbę zespołów od ${TEAM_COUNT_MIN} do ${TEAM_COUNT_MAX}.`)
    .min(TEAM_COUNT_MIN, `Podaj liczbę zespołów od ${TEAM_COUNT_MIN} do ${TEAM_COUNT_MAX}.`)
    .max(TEAM_COUNT_MAX, `Podaj liczbę zespołów od ${TEAM_COUNT_MIN} do ${TEAM_COUNT_MAX}.`),
});

/** Parses the team page's query string. Messages are Polish and safe to show. */
export function parseTeamRequest(
  params: URLSearchParams,
): { success: true; data: { template: string; count: number } } | { success: false; message: string } {
  const result = teamRequestSchema.safeParse({
    szablon: params.get("szablon") ?? "",
    liczba: (params.get("liczba") ?? "").trim() || undefined,
  });
  return result.success
    ? { success: true, data: { template: result.data.szablon, count: result.data.liczba } }
    : { success: false, message: result.error.issues[0]?.message ?? "Nieprawidłowe zapytanie." };
}

export type CrisisParseResult = { success: true; data: ActivateCrisisInput } | { success: false; message: string };

/** Parses the crisis activation form POST into the RPC input. Messages are Polish and safe to show. */
export function parseCrisisForm(form: FormData): CrisisParseResult {
  const text = (name: string) => {
    const value = form.get(name);
    return typeof value === "string" ? value : "";
  };

  const result = crisisFormSchema.safeParse({
    crisis_type: text("crisis_type"),
    radius_km: text("radius_km"),
    reason: text("reason"),
    location_source: text("location_source"),
    postcode: text("postcode"),
    lat: text("lat"),
    lng: text("lng"),
  });

  if (!result.success) {
    return { success: false, message: result.error.issues[0]?.message ?? "Nieprawidłowe dane formularza." };
  }

  const parsed = result.data;
  const base = { crisisType: parsed.crisis_type, radiusKm: parsed.radius_km, reason: parsed.reason };
  return parsed.location_source === "postcode"
    ? { success: true, data: { ...base, locationSource: "postcode", postcode: parsed.postcode, lat: null, lng: null } }
    : { success: true, data: { ...base, locationSource: "pin", postcode: null, lat: parsed.lat, lng: parsed.lng } };
}
