import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { createCourse } from "@/lib/services/courses";
import { parseCreateCourseForm } from "@/lib/validation/courses";
import { redirectWithError } from "@/lib/flash";

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return context.redirect("/auth/signin");
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return redirectWithError(context, "/kursy", "Supabase nie jest skonfigurowany.");
  }

  const parsed = parseCreateCourseForm(await context.request.formData());
  if (!parsed.success) {
    return redirectWithError(context, "/kursy", parsed.message);
  }

  const result = await createCourse(supabase, parsed.data);
  if (!result.ok) {
    return redirectWithError(context, "/kursy", result.message);
  }

  return context.redirect("/kursy?utworzono=1");
};
