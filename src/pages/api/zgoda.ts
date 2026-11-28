import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { recordMyConsent } from "@/lib/services/consent";
import { redirectWithError } from "@/lib/flash";
import { auth } from "@/lib/i18n/messages/auth";
import { legal } from "@/lib/i18n/messages/legal";

// Records consent to the current version from the gate (roadmap S-05). `record_my_consent` checks
// the user and the version again.
export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return context.redirect("/auth/signin");
  }
  // Nothing to accept: no duplicate `reaccept` row.
  if (!context.locals.needsConsent) {
    return context.redirect("/");
  }

  const { locale } = context.locals;
  const t = legal[locale].consent;
  const form = await context.request.formData();
  if (form.get("consent") !== "on") {
    return redirectWithError(context, "/zgoda", t.required);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return redirectWithError(context, "/zgoda", auth[locale].notConfigured);
  }

  try {
    await recordMyConsent(supabase);
  } catch {
    return redirectWithError(context, "/zgoda", t.failed);
  }

  return context.redirect("/");
};
