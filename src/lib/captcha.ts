// Cloudflare Turnstile on the auth forms (security audit S-02). Supabase Auth verifies the token
// against the secret set in its dashboard, so the Worker only forwards it. Relative imports only,
// so `node:test` can load it.

/** The hidden field the Turnstile widget adds to the form it sits in. */
export const CAPTCHA_FIELD = "cf-turnstile-response";

/** The token to pass as `captchaToken`, or undefined when the form has none (no widget, no JS). */
export function captchaToken(form: FormData): string | undefined {
  const token = form.get(CAPTCHA_FIELD);
  return typeof token === "string" && token !== "" ? token : undefined;
}
