declare namespace App {
  interface Locals {
    /** From the verified session JWT (middleware getClaims), not a GoTrue lookup. */
    user: { id: string; email: string | undefined } | null;
    /** False for anonymous users and whenever the role lookup fails (fail closed). */
    isCoordinator: boolean;
    /** True when a signed-in user's latest consent is not the current version. False whenever the lookup fails (fail open). */
    needsConsent: boolean;
  }
}
