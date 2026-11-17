// The Worker bindings this app reads through `cloudflare:workers` (see wrangler.jsonc). Only the ones
// in use are declared; secrets come from `astro:env/server` instead.
declare module "cloudflare:workers" {
  export const env: {
    AUTH_IP_LIMITER?: import("@/lib/auth-throttle").RateLimiter;
    AUTH_ACCOUNT_LIMITER?: import("@/lib/auth-throttle").RateLimiter;
    /** Producer for the SMS alert queue (S-07). Missing on previews. */
    SMS_ALERTS?: import("@/lib/sms/queue").AlertQueue;
  };
}
