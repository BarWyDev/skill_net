import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { createCourse } from "@/lib/services/courses";
import { parseCreateCourseForm } from "@/lib/validation/courses";
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

  const parsed = parseCreateCourseForm(await context.request.formData(), locale);
  if (!parsed.success) {
    return redirectWithError(context, "/kursy", parsed.message);
  }

  const result = await createCourse(supabase, parsed.data, locale);
  if (!result.ok) {
    return redirectWithError(context, "/kursy", result.message);
  }

  return context.redirect("/kursy?utworzono=1");
};
