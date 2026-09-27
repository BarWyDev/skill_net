import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { lookupPostcode } from "@/lib/services/profile";
import { normalisePostcode } from "@/lib/validation/profile";

// Public: postcode centroids are reference data, not personal data.
const CACHE_HEADERS = { "Cache-Control": "public, max-age=86400" };

export const GET: APIRoute = async (context) => {
  const postcode = normalisePostcode(context.params.kod ?? "");
  if (postcode === null) {
    return Response.json({ error: "Podaj kod pocztowy w formacie 00-000." }, { status: 400 });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return Response.json({ error: "Supabase nie jest skonfigurowany." }, { status: 503 });
  }

  const point = await lookupPostcode(supabase, postcode);
  if (point === null) {
    return Response.json(
      { error: "Nie znamy tego kodu pocztowego — zaznacz lokalizację na mapie." },
      { status: 404, headers: CACHE_HEADERS },
    );
  }

  return Response.json(point, { headers: CACHE_HEADERS });
};
