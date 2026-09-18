import { NextResponse } from "next/server";
import { getAuthStore, hashPassword, verifyPassword } from "@/features/auth/store";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions, sessionSecretConfigured } from "@/features/auth/session";
import { denyCrossOrigin } from "@/features/auth/guard";
import { authRateLimited, clearAuthAttempts } from "@/features/auth/rate-limit";

export const runtime = "nodejs";

/**
 * Verified against when the email is unknown, so a missing account costs the
 * same scrypt work as a wrong password. Without this the response time alone
 * would reveal which emails are registered.
 */
const UNKNOWN_ACCOUNT_HASH = hashPassword("codeproof-unknown-account-placeholder");

export async function POST(request: Request): Promise<Response> {
  const crossOrigin = denyCrossOrigin(request);
  if (crossOrigin) return crossOrigin;
  if (!sessionSecretConfigured()) {
    return NextResponse.json(
      { error: { code: "SESSION_NOT_CONFIGURED", message: "Sign-in is unavailable until the server sets CODEPROOF_SESSION_SECRET." } },
      { status: 503 },
    );
  }
  let email = "";
  let password = "";
  try {
    const body = (await request.json()) as { email?: string; password?: string };
    email = (body.email ?? "").trim();
    password = body.password ?? "";
  } catch {
    return NextResponse.json({ error: { code: "INVALID_INPUT", message: "Provide an email and password." } }, { status: 400 });
  }

  if (!email || !password || email.length > 254 || password.length > 256) {
    return NextResponse.json({ error: { code: "INVALID_INPUT", message: "Provide an email and password." } }, { status: 400 });
  }

  if (authRateLimited(request, email)) {
    return NextResponse.json({ error: { code: "RATE_LIMITED", message: "Too many attempts. Try again later." } }, { status: 429 });
  }
  const user = await getAuthStore().findByEmail(email);
  // Identical response whether the account is missing or the password is wrong,
  // so this endpoint cannot be used to discover which emails are registered.
  const valid = verifyPassword(password, user?.passwordHash ?? UNKNOWN_ACCOUNT_HASH);
  if (!user || !valid) {
    return NextResponse.json(
      { error: { code: "INVALID_CREDENTIALS", message: "Incorrect email or password." } },
      { status: 401 },
    );
  }

  clearAuthAttempts(request, email);
  const response = NextResponse.json({ user: { id: user.id, email: user.email } });
  response.cookies.set(SESSION_COOKIE, createSessionToken(user.id), sessionCookieOptions());
  return response;
}
