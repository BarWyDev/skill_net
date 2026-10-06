import type { SupabaseClient } from "@/lib/supabase";
import { CURRENT_CONSENT_VERSION } from "@/lib/consent";

/** The caller's most recent consent version, or null if they never consented. Throws on any RPC error. */
export async function latestConsentVersion(supabase: SupabaseClient): Promise<string | null> {
  const { data, error } = await supabase.rpc("my_latest_consent_version");
  if (error) throw new Error(`latestConsentVersion: ${error.code}`);
  return data;
}

/** Records the caller's consent to the current version (`source = 'reaccept'`). Throws on any RPC error. */
export async function recordMyConsent(supabase: SupabaseClient): Promise<void> {
  const { error } = await supabase.rpc("record_my_consent", { p_version: CURRENT_CONSENT_VERSION });
  if (error) throw new Error(`recordMyConsent: ${error.code}`);
}
