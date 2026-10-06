// Sign-up consent (roadmap S-05). The single source of the current consent version and its wording.
// Imported by the sign-up form and endpoint, and later by the consent gate. Relative imports only,
// so `node:test` can load it.

// Must match a row in `public.consent_versions`. Publish a new version with a migration and push it
// to production before changing this constant, or every sign-up fails with `consent_required`.
export const CURRENT_CONSENT_VERSION = "2026-10-06";

export const CONSENT_LABEL =
  "Wyrażam zgodę na przetwarzanie moich danych (adres e-mail, przybliżona lokalizacja, umiejętności, dostępność i opcjonalnie numer telefonu) w celu koordynacji pomocy w sytuacjach kryzysowych i pomocy sąsiedzkiej.";

export const CONSENT_LINK_TEXT = "Informacja o przetwarzaniu danych";

export const CONSENT_REQUIRED_MESSAGE = "Zaznacz zgodę na przetwarzanie danych, aby założyć konto.";
