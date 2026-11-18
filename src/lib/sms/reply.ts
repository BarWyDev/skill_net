// Parsing a resident's SMS answer to a crisis alert (S-07). Never log or store the reply text.
// Relative imports only, so `node:test` can load it.

import { foldDiacritics } from "./text.ts";

export type ReplyAnswer = "yes" | "no";

const YES = new Set(["tak", "t", "yes"]);
const NO = new Set(["nie", "n", "no"]);

/**
 * Reads TAK or NIE from a reply. Case, diacritics, whitespace and punctuation are ignored, and the
 * first word decides ("tak, będę" is a yes). A reply that carries both a yes word and a no word,
 * or neither, is unclear: the caller asks again instead of guessing.
 */
export function parseReply(text: string): ReplyAnswer | null {
  const words = foldDiacritics(text)
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);
  const first = words.at(0);
  if (first === undefined) return null;

  const saysYes = words.some((word) => YES.has(word));
  const saysNo = words.some((word) => NO.has(word));
  if (saysYes && saysNo) return null;

  if (YES.has(first)) return "yes";
  if (NO.has(first)) return "no";
  return null;
}
