import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { deleteCourse } from "@/lib/services/courses";
import { parseDeleteCourseForm } from "@/lib/validation/courses";
import { redirectWithError } from "@/lib/flash";
import { auth } from "@/lib/i18n/messages/auth";

export const POST: APIRoute = async (context) => {
  const { locale } = context.locals;
  if (!context.locals.user) {
    return context.redirect("/auth/signin");
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return redirectWithError(context, "/kursy", auth[locale].notConfigured);
  }

  // The "Usuwam kurs i wszystkie zapisy" tick is required here, not only in the browser.
  const parsed = parseDeleteCourseForm(await context.request.formData(), locale);
  if (!parsed.success) {
    return redirectWithError(context, "/kursy", parsed.message);
  }

  const result = await deleteCourse(supabase, parsed.data, locale);
  if (!result.ok) {
    return redirectWithError(context, "/kursy", result.message);
  }

  return context.redirect("/kursy?usunieto=1");
};
