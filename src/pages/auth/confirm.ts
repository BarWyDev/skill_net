import type { APIRoute } from "astro";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase";

// The confirmation email links here (roadmap S-05). A token_hash link works in any browser, so a
// resident can sign up on a laptop and confirm on a phone; verifyOtp also signs them in.
const ACCEPTED_TYPES: EmailOtpType[] = ["email", "signup"];
const NO_STORE = { "Cache-Control": "private, no-store" };

function redirect(location: string) {
  return new Response(null, { status: 302, headers: { Location: location, ...NO_STORE } });
}

export const GET: APIRoute = async (context) => {
  const tokenHash = context.url.searchParams.get("token_hash");
  const type = context.url.searchParams.get("type");
  if (!tokenHash || !type || !ACCEPTED_TYPES.includes(type)) {
    return redirect("/auth/link-wygasl");
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return redirect("/auth/link-wygasl");
  }

  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  return redirect(error ? "/auth/link-wygasl" : "/profil");
};
