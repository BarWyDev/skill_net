import { z } from "zod";
import type { SupabaseClient } from "@/lib/supabase";
import type { DensityCellDTO } from "@/types";

// The RPC is the privacy boundary; this module only checks its shape. Never log the response.

const positionSchema = z.tuple([z.number(), z.number()]);

const densityRowSchema = z.object({
  cell: z.object({
    type: z.literal("Polygon"),
    coordinates: z.array(z.array(positionSchema)),
  }),
  band: z.union([z.literal(1), z.literal(2), z.literal(3)]),
});

/** Banded 2 km cells for every matchable resident, or for those with a skill in `category`. */
export async function getSkillsDensity(
  supabase: SupabaseClient,
  category: string | null,
): Promise<DensityCellDTO[] | "unknown_category"> {
  const { data, error } = await supabase.rpc("get_skills_density", category ? { p_category: category } : {});
  if (error) {
    if (error.message === "unknown_category") return "unknown_category";
    throw new Error(`getSkillsDensity: ${error.code}`);
  }

  return z.array(densityRowSchema).parse(data);
}
