declare namespace App {
  interface Locals {
    user: import("@supabase/supabase-js").User | null;
    /** False for anonymous users and whenever the role lookup fails (fail closed). */
    isCoordinator: boolean;
  }
}
