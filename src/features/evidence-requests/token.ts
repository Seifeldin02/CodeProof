import { createHash, randomBytes, randomInt } from "node:crypto";

/**
 * The link a candidate receives is a bearer credential: whoever holds it can
 * answer once. Only its SHA-256 digest is stored, so a copy of the database
 * does not let anyone open a pending request.
 */

export function digestRequestToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** 256 bits of randomness, URL-safe. The plain token is shown to the recruiter once. */
export function createRequestToken(): { token: string; digest: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, digest: digestRequestToken(token) };
}

export function isWellFormedRequestToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

const CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

/** Short, readable and safe to print: no look-alike characters. */
export function createVerificationCode(): string {
  let suffix = "";
  for (let index = 0; index < 12; index += 1) suffix += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return `codeproof-${suffix}`;
}
