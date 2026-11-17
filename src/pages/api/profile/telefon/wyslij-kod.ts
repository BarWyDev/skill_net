import type { APIRoute } from "astro";
import { redirectWithError } from "@/lib/flash";
import { sendPhoneCode } from "@/lib/services/phone-verification";

const BACK = "/profil#potwierdz-numer";

// Sends a verification code to the resident's saved number (S-07). A form POST with no fields: the
// number comes from the database, never from the request. Throttled per visitor (auth-throttle.ts).
export const POST: APIRoute = async (context) => {
  // `/api/profile` is not in PROTECTED_ROUTES, so the route checks the session itself.
  if (!context.locals.user) {
    return context.redirect("/auth/signin");
  }

  const result = await sendPhoneCode(context.locals.user.id);
  if (!result.ok) {
    return redirectWithError(context, BACK, result.message);
  }
  if (result.devCode) {
    // Local dev on the fake provider only (see sendPhoneCode).
    return redirectWithError(context, BACK, `Tryb testowy: SMS nie został wysłany. Kod: ${result.devCode}`);
  }
  if (!result.sent) {
    return redirectWithError(context, BACK, "SMS działa w trybie testowym, więc kod nie został wysłany.");
  }
  return context.redirect("/profil?kod-wyslany=1#potwierdz-numer");
};
