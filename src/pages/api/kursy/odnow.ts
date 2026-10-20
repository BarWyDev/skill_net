import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { renewCourse } from "@/lib/services/courses";
import { parseCourseIdForm } from "@/lib/validation/courses";
import { redirectWithError } from "@/lib/flash";

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return context.redirect("/auth/signin");
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return redirectWithError(context, "/kursy", "Supabase nie jest skonfigurowany.");
  }

  const parsed = parseCourseIdForm(await context.request.formData());
  if (!parsed.success) {
    return redirectWithError(context, "/kursy", parsed.message);
  }

  const result = await renewCourse(supabase, parsed.data);
  if (!result.ok) {
    return redirectWithError(context, "/kursy", result.message);
  }

  return context.redirect("/kursy?odnowiono=1");
};
