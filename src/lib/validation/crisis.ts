import { z } from "zod";
import { normalisePostcode } from "@/lib/validation/profile";
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

const common = {
  // Whether the type exists is checked by the RPC, the single source of truth.
  crisis_type: z.string().regex(/^[a-z0-9-]+$/, "Wybierz rodzaj kryzysu."),
  radius_km: z
    .string()
    .transform(Number)
    .refine((n): n is RadiusKm => (RADIUS_PRESETS as number[]).includes(n), "Wybierz promień z listy."),
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
          ctx.addIssue({ code: "custom", message: "Podaj kod pocztowy w formacie 00-000." });
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
    location_source: text("location_source"),
    postcode: text("postcode"),
    lat: text("lat"),
    lng: text("lng"),
  });

  if (!result.success) {
    return { success: false, message: result.error.issues[0]?.message ?? "Nieprawidłowe dane formularza." };
  }

  const parsed = result.data;
  const base = { crisisType: parsed.crisis_type, radiusKm: parsed.radius_km };
  return parsed.location_source === "postcode"
    ? { success: true, data: { ...base, locationSource: "postcode", postcode: parsed.postcode, lat: null, lng: null } }
    : { success: true, data: { ...base, locationSource: "pin", postcode: null, lat: parsed.lat, lng: parsed.lng } };
}
