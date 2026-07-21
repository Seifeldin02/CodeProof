import { NextResponse } from "next/server";
import { getAuthStore, signupAllowed } from "@/features/auth/store";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/features/auth/session";
import { denyCrossOrigin } from "@/features/auth/guard";
import { authRateLimited, clearAuthAttempts } from "@/features/auth/rate-limit";

export const runtime = "nodejs";

const MINIMUM_PASSWORD_LENGTH = 12;

export async function POST(request: Request): Promise<Response> {
  const crossOrigin = denyCrossOrigin(request);
  if (crossOrigin) return crossOrigin;
  const store = getAuthStore();
  if (!signupAllowed()) {
    return NextResponse.json(
      { error: { code: "REGISTRATION_CLOSED", message: "This workspace already has an owner. Ask them for an account." } },
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

  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: { code: "INVALID_EMAIL", message: "Enter a valid email address." } }, { status: 400 });
  }
  if (password.length < MINIMUM_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: { code: "WEAK_PASSWORD", message: `Use at least ${MINIMUM_PASSWORD_LENGTH} characters.` } },
      { status: 400 },
    );
  }
  if (authRateLimited(request, email)) {
    return NextResponse.json({ error: { code: "RATE_LIMITED", message: "Too many attempts. Try again later." } }, { status: 429 });
  }
  if (password.length > 256) {
    return NextResponse.json({ error: { code: "INVALID_INPUT", message: "Password is too long." } }, { status: 400 });
  }
  if (await store.findByEmail(email)) {
    return NextResponse.json({ error: { code: "EMAIL_TAKEN", message: "That email already has an account." } }, { status: 409 });
  }

  try {
    const user = await store.createUser(email, password);
    clearAuthAttempts(request, email);
    const response = NextResponse.json({ user: { id: user.id, email: user.email } }, { status: 201 });
    response.cookies.set(SESSION_COOKIE, createSessionToken(user.id), sessionCookieOptions());
    return response;
  } catch (error) {
    if (String(error).toLowerCase().includes("unique")) {
      return NextResponse.json({ error: { code: "EMAIL_TAKEN", message: "That email already has an account." } }, { status: 409 });
    }
    throw error;
  }
}
