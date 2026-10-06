declare namespace App {
  interface Locals {
    user: import("@supabase/supabase-js").User | null;
    /** False for anonymous users and whenever the role lookup fails (fail closed). */
    isCoordinator: boolean;
    /** True when a signed-in user's latest consent is not the current version. False whenever the lookup fails (fail open). */
    needsConsent: boolean;
  }
}
