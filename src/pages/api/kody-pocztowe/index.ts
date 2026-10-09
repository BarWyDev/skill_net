import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { lookupPostcode } from "@/lib/services/profile";
import { normalisePostcode, POSTCODE_ERROR } from "@/lib/postcode";

// The postcode travels in the body, never the URL, so it stays out of Workers Logs.
const NO_STORE = { "Cache-Control": "no-store" };

const BAD_REQUEST = POSTCODE_ERROR;

/** The normalised postcode from a `{ "postcode": string }` JSON body, or null for anything else. */
async function readPostcode(request: Request): Promise<string | null> {
  const mediaType = request.headers.get("Content-Type")?.split(";")[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") return null;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    // The parse error quotes the body, so it is dropped: never rethrow, log or interpolate it.
    return null;
  }

  if (typeof body !== "object" || body === null || !("postcode" in body)) return null;
  const { postcode } = body;
  return typeof postcode === "string" ? normalisePostcode(postcode) : null;
}

export const POST: APIRoute = async (context) => {
  const postcode = await readPostcode(context.request);
  if (postcode === null) {
    return Response.json({ error: BAD_REQUEST }, { status: 400, headers: NO_STORE });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return Response.json({ error: "Supabase nie jest skonfigurowany." }, { status: 503, headers: NO_STORE });
  }

  const point = await lookupPostcode(supabase, postcode);
  if (point === null) {
    return Response.json(
      { error: "Nie znamy tego kodu pocztowego — zaznacz lokalizację na mapie." },
      { status: 404, headers: NO_STORE },
    );
  }

  return Response.json(point, { headers: NO_STORE });
};
