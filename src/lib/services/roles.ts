import type { SupabaseClient } from "@/lib/supabase";

/** Whether the signed-in caller holds the coordinator role. Throws on any RPC error. */
export async function isCoordinator(supabase: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_coordinator");
  if (error) throw new Error(`isCoordinator: ${error.code}`);
  return data;
}
