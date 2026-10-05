import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { getSkillsDensity } from "@/lib/services/density-map";

// Public on purpose: the response holds only banded 2 km cells. The category is not personal data,
// so it may travel in the URL. `private`, never `public`: the auth middleware may set session cookies.
const CACHED = { "Cache-Control": "private, max-age=300" };
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

  const supabase = createClient(context.request.headers, context.cookies);
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
