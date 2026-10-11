// The sign-up password rule (security audit F-09). It mirrors the Supabase Auth settings: a minimum
// length of 10 and `lower_upper_letters_digits`, which counts ASCII letters and digits only. Set the
// same values in the dashboard for production (Authentication > Policies); `supabase/config.toml`
// holds them for local development. Relative imports only, so `node:test` can load it.

export const MIN_PASSWORD_LENGTH = 10;

export const PASSWORD_TOO_SHORT = `Hasło musi mieć co najmniej ${MIN_PASSWORD_LENGTH} znaków.`;
export const PASSWORD_NEEDS_CLASSES = "Hasło musi zawierać małą literę, wielką literę i cyfrę.";

/** A Polish message when the password breaks the rule, otherwise null. */
export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return PASSWORD_TOO_SHORT;
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    return PASSWORD_NEEDS_CLASSES;
  }
  return null;
}
