import { NextResponse } from "next/server";
import { getAuthStore, hashPassword, verifyPassword } from "@/features/auth/store";
import { SESSION_COOKIE, sessionCookieOptions, sessionSecretConfigured } from "@/features/auth/session";
import { denyCrossOrigin } from "@/features/auth/guard";
import { authRateLimited, clearAuthAttempts } from "@/features/auth/rate-limit";
import { finishSignIn } from "@/features/auth/finish-sign-in";
import { signInOptions } from "@/features/auth/options";

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
  // Passwords are the fallback for a deployment that cannot deliver sign-in codes.
  if (!signInOptions().password) {
    return NextResponse.json(
      { error: { code: "PASSWORD_SIGN_IN_DISABLED", message: "Sign in with a code sent to your email address." } },
      { status: 403 },
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

  // Checked after the password, so a wrong guess learns nothing about the account's state.
  if (user.lifecycleState !== "active") {
    return NextResponse.json(
      { error: { code: "ACCOUNT_UNAVAILABLE", message: "This account is not available. Contact support." } },
      { status: 403 },
    );
  }

  clearAuthAttempts(request, email);
  const finished = await finishSignIn({ user, method: "password", next: "/" });
  const response = NextResponse.json({ user: { id: user.id, email: user.email }, destination: finished.destination });
  response.cookies.set(SESSION_COOKIE, finished.sessionToken, sessionCookieOptions());
  return response;
}
