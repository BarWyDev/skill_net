import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { startScenario } from "@/lib/services/crisis";
import { redirectWithError } from "@/lib/flash";

// Starts a ready exercise from `crisis_scenarios` with one click. The middleware gates this prefix:
// anonymous users go to sign-in, residents get 403. RLS shows scenarios to coordinators only, and
// activate_crisis checks the role again in the database.

const SLUG_RE = /^[a-z0-9-]{1,40}$/;

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return context.redirect("/auth/signin");
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return redirectWithError(context, "/koordynator", "Supabase nie jest skonfigurowany.");
  }

  const slug = (await context.request.formData()).get("scenario");
  if (typeof slug !== "string" || !SLUG_RE.test(slug)) {
    return redirectWithError(context, "/koordynator", "Wybierz ćwiczenie z listy.");
  }

  const result = await startScenario(supabase, slug);
  if (!result.ok) {
    return redirectWithError(context, "/koordynator", result.message);
  }

  return context.redirect(`/koordynator/kryzys/${result.id}`);
};
