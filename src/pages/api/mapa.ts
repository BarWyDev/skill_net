import type { APIRoute } from "astro";
import { createPublicClient } from "@/lib/supabase";
import { getSkillsDensity } from "@/lib/services/density-map";

// Public on purpose: the response holds only banded 2 km cells, from a snapshot recomputed once a
// day (security audit F-03). The category is not personal data, so it may travel in the URL.
// `public` is safe here only because the middleware skips the auth lookup for this path and the
// client below never touches cookies, so no session cookie can ride on a cached response.
const CACHED = { "Cache-Control": "public, max-age=3600" };
const NO_STORE = { "Cache-Control": "no-store" };

const CATEGORY_PATTERN = /^[a-z-]{1,40}$/;
const BAD_CATEGORY = "Nieznana kategoria umiejętności.";

export const GET: APIRoute = async (context) => {
  // A missing or empty `kategoria` means all skills.
  const raw = context.url.searchParams.get("kategoria");
  const category = raw === null || raw === "" ? null : raw;
  if (category !== null && !CATEGORY_PATTERN.test(category)) {
    return Response.json({ error: BAD_CATEGORY }, { status: 400, headers: NO_STORE });
  }

  const supabase = createPublicClient();
  if (!supabase) {
    return Response.json({ error: "Supabase nie jest skonfigurowany." }, { status: 503, headers: NO_STORE });
  }

  let cells;
  try {
    cells = await getSkillsDensity(supabase, category);
  } catch {
    return Response.json(
      { error: "Nie udało się wczytać mapy. Spróbuj ponownie." },
      { status: 500, headers: NO_STORE },
    );
  }
  if (cells === "unknown_category") {
    return Response.json({ error: BAD_CATEGORY }, { status: 400, headers: NO_STORE });
  }

  return Response.json(cells, { headers: CACHED });
};
