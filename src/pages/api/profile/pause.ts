import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { pauseMyAvailability } from "@/lib/services/profile";
import { redirectWithError } from "@/lib/flash";
import { auth } from "@/lib/i18n/messages/auth";
import { profile } from "@/lib/i18n/messages/profile";

// The range (Warsaw today to today + 365) is enforced by the database; only the shape is checked here.
const pauseFormSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("indefinite") }),
  z.object({ mode: z.literal("date"), until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
]);

export const POST: APIRoute = async (context) => {
  const { locale } = context.locals;
  if (!context.locals.user) {
    return context.redirect("/auth/signin");
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return redirectWithError(context, "/profil", auth[locale].notConfigured);
  }

  const form = await context.request.formData();
  const parsed = pauseFormSchema.safeParse({ mode: form.get("mode"), until: form.get("until") });
  if (!parsed.success) {
    return redirectWithError(context, "/profil", profile[locale].pause.invalidDate);
  }

  const until = parsed.data.mode === "date" ? parsed.data.until : null;
  const result = await pauseMyAvailability(supabase, until, locale);
  if (!result.ok) {
    return redirectWithError(context, "/profil", result.message);
  }

  return context.redirect("/profil?wstrzymano=1");
};
