// The parameters of an email link (roadmap S-16). The link's GET and the confirm button's POST both
// go through this one check, so the page never renders a form the POST would refuse. Relative
// imports only, so `node:test` can load it.

export type ConfirmLinkType = "email" | "signup" | "magiclink";

export interface ConfirmParams {
  tokenHash: string;
  type: ConfirmLinkType;
}

// `email` and `signup` confirm an account; `magiclink` signs in. Recovery and invite links have no
// page in SkillNet yet, so they are refused like a broken link.
const ACCEPTED_TYPES: readonly string[] = ["email", "signup", "magiclink"] satisfies ConfirmLinkType[];

// A Supabase token hash is 56 hex characters; anything far longer is not one.
const MAX_TOKEN_LENGTH = 200;

/** The token and type from the link's query string or the posted form, or null when either is unusable. */
export function parseConfirmParams(source: URLSearchParams | FormData): ConfirmParams | null {
  const tokenHash = source.get("token_hash");
  const type = source.get("type");
  if (typeof tokenHash !== "string" || typeof type !== "string") return null;
  if (tokenHash === "" || tokenHash.length > MAX_TOKEN_LENGTH) return null;
  if (!ACCEPTED_TYPES.includes(type)) return null;
  return { tokenHash, type: type as ConfirmLinkType };
}
