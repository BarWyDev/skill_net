import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { recordMyConsent } from "@/lib/services/consent";
import { redirectWithError } from "@/lib/flash";

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

  const form = await context.request.formData();
  if (form.get("consent") !== "on") {
    return redirectWithError(context, "/zgoda", "Zaznacz zgodę na przetwarzanie danych, aby przejść dalej.");
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return redirectWithError(context, "/zgoda", "Supabase nie jest skonfigurowany.");
  }

  try {
    await recordMyConsent(supabase);
  } catch {
    return redirectWithError(context, "/zgoda", "Nie udało się zapisać zgody. Spróbuj ponownie.");
  }

  return context.redirect("/");
};
