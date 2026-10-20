import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { updateCourse } from "@/lib/services/courses";
import { parseUpdateCourseForm } from "@/lib/validation/courses";
import { redirectWithError } from "@/lib/flash";

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return context.redirect("/auth/signin");
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return redirectWithError(context, "/kursy", "Supabase nie jest skonfigurowany.");
  }

  const parsed = parseUpdateCourseForm(await context.request.formData());
  if (!parsed.success) {
    return redirectWithError(context, "/kursy", parsed.message);
  }

  const result = await updateCourse(supabase, parsed.data);
  if (!result.ok) {
    return redirectWithError(context, "/kursy", result.message);
  }

  return context.redirect("/kursy?zapisano=1");
};
