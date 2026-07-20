import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getAuthStore, type AuthUser } from "./store";

/**
 * Stateless sessions: the cookie carries `userId.expiry.signature`, signed with
 * HMAC-SHA256. Tampering invalidates the signature and an expired token is
 * rejected without a database lookup.
 */

export const SESSION_COOKIE = "codeproof_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createSessionToken(userId: string, now = Date.now()): string {
  const payload = `${userId}.${now + SESSION_MAX_AGE_SECONDS * 1000}`;
  return `${payload}.${sign(payload, getAuthStore().sessionSecret())}`;
}

/** Returns the user id when the token is authentic and unexpired. */
export function readSessionToken(token: string | undefined, now = Date.now()): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [userId, expiresAt, signature] = parts;
  const expected = sign(`${userId}.${expiresAt}`, getAuthStore().sessionSecret());
  const provided = Buffer.from(signature);
  const control = Buffer.from(expected);
  if (provided.length !== control.length || !timingSafeEqual(provided, control)) return null;

  const expiry = Number(expiresAt);
  if (!Number.isFinite(expiry) || expiry < now) return null;
  return userId;
}

export function sessionCookieOptions(maxAge: number = SESSION_MAX_AGE_SECONDS) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

/** The signed-in recruiter, or null. Safe to call from server components. */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const userId = readSessionToken(token);
  return userId ? getAuthStore().findById(userId) : null;
}

/**
 * Uploading creates candidate data, so it always requires an account.
 * Reading stays open unless the deployment sets `CODEPROOF_PROTECT_ALL=true`.
 */
export function readsRequireAuth(): boolean {
  return process.env.CODEPROOF_PROTECT_ALL?.trim().toLowerCase() === "true";
}
