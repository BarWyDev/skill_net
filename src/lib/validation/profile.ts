import { z } from "zod";
import { SLOT_COUNT, slotsToMask } from "@/lib/availability";
import { normalisePhone, PHONE_ERROR } from "@/lib/phone";
import type { SaveProfileInput } from "@/types";

export const MAX_SKILLS = 40;

const POSTCODE_RE = /^(\d{2})-?(\d{3})$/;
// `<slug>` for skills without a level, `<slug>:<1|2|3>` otherwise. Whether a level is
// required for a given skill is decided by the database trigger, the single source of truth.
const SKILL_RE = /^([a-z0-9-]+)(?::([123]))?$/;

/** Normalises `NNNNN` or `NN-NNN` to `NN-NNN`; returns null for anything else. */
export function normalisePostcode(raw: string): string | null {
  const match = POSTCODE_RE.exec(raw.trim());
  return match ? `${match[1]}-${match[2]}` : null;
}

const coordinate = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(1, "Zaznacz lokalizację na mapie.")
    .transform(Number)
    .refine((n) => Number.isFinite(n) && n >= min && n <= max, "Nieprawidłowa lokalizacja.");

const skillSchema = z
  .string()
  .regex(SKILL_RE, "Nieprawidłowa umiejętność lub poziom.")
  .transform((value) => {
    const [slug, level] = value.split(":");
    return { slug, level: level ? (Number(level) as 1 | 2 | 3) : null };
  });

const skillsSchema = z
  .array(skillSchema)
  .max(MAX_SKILLS, `Możesz wybrać najwyżej ${MAX_SKILLS} umiejętności.`)
  .refine((skills) => new Set(skills.map((s) => s.slug)).size === skills.length, "Umiejętności się powtarzają.");

// Empty means "no phone" (the stored one is deleted). The message never contains the input.
const phoneSchema = z.string().transform((value, ctx) => {
  if (value.trim() === "") return null;
  const phone = normalisePhone(value);
  if (phone === null) {
    ctx.addIssue({ code: "custom", message: PHONE_ERROR });
    return z.NEVER;
  }
  return phone;
});

// Repeated bit indexes 0–27, folded into a mask. None means "not declared".
const availabilitySchema = z
  .array(
    z
      .string()
      .regex(/^\d{1,2}$/, "Nieprawidłowa dostępność.")
      .transform(Number)
      .refine((bit) => bit < SLOT_COUNT, "Nieprawidłowa dostępność."),
  )
  .max(SLOT_COUNT, "Nieprawidłowa dostępność.")
  .transform((bits) => slotsToMask(bits) || null);

const contactFields = { phone: phoneSchema, availability: availabilitySchema, skill: skillsSchema };

const profileFormSchema = z.discriminatedUnion("location_source", [
  z.object({
    location_source: z.literal("postcode"),
    // Empty: keep the stored postcode location (the field starts empty, the code is never stored).
    postcode: z.string().transform((value, ctx) => {
      if (value.trim() === "") return null;
      const postcode = normalisePostcode(value);
      if (postcode === null) {
        ctx.addIssue({ code: "custom", message: "Podaj kod pocztowy w formacie 00-000." });
        return z.NEVER;
      }
      return postcode;
    }),
    ...contactFields,
  }),
  z.object({
    location_source: z.literal("pin"),
    lat: coordinate(-90, 90),
    lng: coordinate(-180, 180),
    ...contactFields,
  }),
  z.object({
    location_source: z.literal(""),
    ...contactFields,
  }),
]);

export type ParseResult = { success: true; data: SaveProfileInput } | { success: false; message: string };

/** Parses the profile form POST into the RPC input. Messages are Polish and safe to show. */
export function parseProfileForm(form: FormData): ParseResult {
  const text = (name: string) => {
    const value = form.get(name);
    return typeof value === "string" ? value : "";
  };

  const result = profileFormSchema.safeParse({
    location_source: text("location_source"),
    postcode: text("postcode"),
    lat: text("lat"),
    lng: text("lng"),
    skill: form.getAll("skill").filter((value) => typeof value === "string"),
    phone: text("phone"),
    availability: form.getAll("availability").filter((value) => typeof value === "string"),
  });

  if (!result.success) {
    return { success: false, message: result.error.issues[0]?.message ?? "Nieprawidłowe dane formularza." };
  }

  const parsed = result.data;
  const extras = { skills: parsed.skill, phone: parsed.phone, availabilitySlots: parsed.availability };
  switch (parsed.location_source) {
    case "postcode":
      return {
        success: true,
        data: { locationSource: "postcode", postcode: parsed.postcode, lat: null, lng: null, ...extras },
      };
    case "pin":
      return {
        success: true,
        data: { locationSource: "pin", postcode: null, lat: parsed.lat, lng: parsed.lng, ...extras },
      };
    default:
      return {
        success: true,
        data: { locationSource: null, postcode: null, lat: null, lng: null, ...extras },
      };
  }
}
