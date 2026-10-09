import type { APIRoute } from "astro";

// The starter's English dashboard is gone (QA-014): the profile is the signed-in home. Kept as a
// redirect so old links still work; the middleware sends signed-out visitors to sign-in first.
export const GET: APIRoute = (context) => context.redirect("/profil");
