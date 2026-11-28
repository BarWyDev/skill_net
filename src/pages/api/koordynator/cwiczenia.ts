import type { APIRoute } from "astro";
import { auth } from "@/lib/i18n/messages/auth";
import { crisis } from "@/lib/i18n/messages/crisis";
import { createClient } from "@/lib/supabase";
import { startScenario } from "@/lib/services/crisis";
import { redirectWithError } from "@/lib/flash";

// Starts a ready exercise from `crisis_scenarios` with one click. The middleware gates this prefix:
// anonymous users go to sign-in, residents get 403. RLS shows scenarios to coordinators only, and
// activate_crisis checks the role again in the database.

const SLUG_RE = /^[a-z0-9-]{1,40}$/;

export const POST: APIRoute = async (context) => {
  const { locale } = context.locals;
  if (!context.locals.user) {
    return context.redirect("/auth/signin");
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return redirectWithError(context, "/koordynator", auth[locale].notConfigured);
  }

  const slug = (await context.request.formData()).get("scenario");
  if (typeof slug !== "string" || !SLUG_RE.test(slug)) {
    return redirectWithError(context, "/koordynator", crisis[locale].activate.chooseExercise);
  }

  const result = await startScenario(supabase, slug, locale);
  if (!result.ok) {
    return redirectWithError(context, "/koordynator", result.message);
  }

  return context.redirect(`/koordynator/kryzys/${result.id}`);
};
