import type { APIRoute } from "astro";
import { redirectWithError } from "@/lib/flash";
import { confirmPhoneCode } from "@/lib/services/phone-verification";

const BACK = "/profil#potwierdz-numer";

// Checks the code the resident got by SMS (S-07). Wrong codes are counted in the database (five per
// code), and the route is throttled per visitor (auth-throttle.ts).
export const POST: APIRoute = async (context) => {
  // `/api/profile` is not in PROTECTED_ROUTES, so the route checks the session itself.
  if (!context.locals.user) {
    return context.redirect("/auth/signin");
  }

  const code = (await context.request.formData()).get("code");
  const result = await confirmPhoneCode(context.locals.user.id, typeof code === "string" ? code : "");
  if (!result.ok) {
    return redirectWithError(context, BACK, result.message);
  }
  return context.redirect("/profil?numer-potwierdzony=1");
};
