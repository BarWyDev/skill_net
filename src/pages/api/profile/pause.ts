import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { pauseMyAvailability } from "@/lib/services/profile";

const errorRedirect = (message: string) => `/profil?error=${encodeURIComponent(message)}`;

// The range (Warsaw today to today + 365) is enforced by the database; only the shape is checked here.
const pauseFormSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("indefinite") }),
  z.object({ mode: z.literal("date"), until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
]);

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return context.redirect("/auth/signin");
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(errorRedirect("Supabase nie jest skonfigurowany."));
  }

  const form = await context.request.formData();
  const parsed = pauseFormSchema.safeParse({ mode: form.get("mode"), until: form.get("until") });
  if (!parsed.success) {
    return context.redirect(errorRedirect("Wybierz datę od dziś do roku naprzód."));
  }

  const result = await pauseMyAvailability(supabase, parsed.data.mode === "date" ? parsed.data.until : null);
  if (!result.ok) {
    return context.redirect(errorRedirect(result.message));
  }

  return context.redirect("/profil?wstrzymano=1");
};
