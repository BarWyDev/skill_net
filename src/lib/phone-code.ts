// The phone verification code (S-07): six digits sent by SMS, and the hash the database stores in
// its place. Never log a code or a hash input.
// Relative imports only, so `node:test` can load it.

export const CODE_LENGTH = 6;

const CODE_RE = /^\d{6}$/;

/** Reads what the resident typed: spaces and dashes are ignored; null unless it is six digits. */
export function normaliseCode(raw: string): string | null {
  const code = raw.replace(/[\s-]/g, "");
  return CODE_RE.test(code) ? code : null;
}

/**
 * A uniformly random six-digit code, leading zeros included. Rejection sampling: a 32-bit value is
 * redrawn when it falls in the tail that would make some codes likelier than others.
 */
export function generateCode(randomUint32: () => number = defaultRandomUint32): string {
  const range = 10 ** CODE_LENGTH;
  const limit = Math.floor(0x1_0000_0000 / range) * range;
  for (;;) {
    const value = randomUint32();
    if (value < limit) return String(value % range).padStart(CODE_LENGTH, "0");
  }
}

function defaultRandomUint32(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

/**
 * What the database stores and compares: hex SHA-256 of the worker token, the user id and the code.
 * The user id ties a hash to one account. The token works as a pepper: six digits are trivial to
 * brute-force from a bare hash, so a leaked table alone gives no codes away.
 */
export async function hashCode(workerToken: string, userId: string, code: string): Promise<string> {
  const data = new TextEncoder().encode(`${workerToken}:${userId}:${code}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
