import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { unregisterMe } from "@/lib/services/account";

// Errors go back to the page the form came from, so a resident refusing consent on /zgoda sees them
// there instead of being bounced through the gate. Only these pages are accepted.
const RETURN_PAGES = ["/profil", "/zgoda"];

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const returnTo = form.get("return_to");
  const errorPage = typeof returnTo === "string" && RETURN_PAGES.includes(returnTo) ? returnTo : "/profil";
  const errorRedirect = (message: string) => `${errorPage}?error=${encodeURIComponent(message)}`;

  const user = context.locals.user;
  if (!user) {
    return context.redirect("/auth/signin");
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(errorRedirect("Supabase nie jest skonfigurowany."));
  }

  const password = form.get("password");
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
