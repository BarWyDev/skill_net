import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { unregisterMe } from "@/lib/services/account";

const errorRedirect = (message: string) => `/profil?error=${encodeURIComponent(message)}`;

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return context.redirect("/auth/signin");
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(errorRedirect("Supabase nie jest skonfigurowany."));
  }

  const password = (await context.request.formData()).get("password");
  if (typeof password !== "string" || password === "") {
    return context.redirect(errorRedirect("Podaj hasło, aby usunąć konto."));
  }
  if (!user.email) {
    return context.redirect(errorRedirect("Tego konta nie można usunąć hasłem."));
  }

  const result = await unregisterMe(supabase, user.email, password);
  if (!result.ok) {
    return context.redirect(errorRedirect(result.message));
  }

  return context.redirect("/?konto-usuniete=1");
};
