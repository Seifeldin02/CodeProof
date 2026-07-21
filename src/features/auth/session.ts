import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getAuthStore, type AuthUser } from "./store";

/**
 * Stateless sessions: the cookie carries `userId.expiry.signature`, signed with
 * HMAC-SHA256. Tampering invalidates the signature and an expired token is
 * rejected without a database lookup.
 */

export const SESSION_COOKIE = process.env.NODE_ENV === "production" ? "__Host-codeproof_session" : "codeproof_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

const sessionState = globalThis as typeof globalThis & { codeproofDevelopmentSessionSecret?: string };

function sessionSecret(): string {
  const configured = process.env.CODEPROOF_SESSION_SECRET?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("CODEPROOF_SESSION_SECRET is required in production.");
  }
  sessionState.codeproofDevelopmentSessionSecret ??= randomBytes(32).toString("hex");
  return sessionState.codeproofDevelopmentSessionSecret;
}

export function createSessionToken(userId: string, now = Date.now()): string {
  const payload = `${userId}.${now + SESSION_MAX_AGE_SECONDS * 1000}`;
  return `${payload}.${sign(payload, sessionSecret())}`;
}

/** Returns the user id when the token is authentic and unexpired. */
export function readSessionToken(token: string | undefined, now = Date.now()): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [userId, expiresAt, signature] = parts;
  const expected = sign(`${userId}.${expiresAt}`, sessionSecret());
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
    priority: "high" as const,
  };
}

/** The signed-in recruiter, or null. Safe to call from server components. */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const userId = readSessionToken(token);
  return userId ? await getAuthStore().findById(userId) : null;
}
