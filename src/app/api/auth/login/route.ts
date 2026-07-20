import { NextResponse } from "next/server";
import { getAuthStore, verifyPassword } from "@/features/auth/store";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/features/auth/session";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  let email = "";
  let password = "";
  try {
    const body = (await request.json()) as { email?: string; password?: string };
    email = (body.email ?? "").trim();
    password = body.password ?? "";
  } catch {
    return NextResponse.json({ error: { code: "INVALID_INPUT", message: "Provide an email and password." } }, { status: 400 });
  }

  if (!email || !password) {
    return NextResponse.json({ error: { code: "INVALID_INPUT", message: "Provide an email and password." } }, { status: 400 });
  }

  const user = getAuthStore().findByEmail(email);
  // Identical response whether the account is missing or the password is wrong,
  // so this endpoint cannot be used to discover which emails are registered.
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return NextResponse.json(
      { error: { code: "INVALID_CREDENTIALS", message: "Incorrect email or password." } },
      { status: 401 },
    );
  }

  const response = NextResponse.json({ user: { id: user.id, email: user.email } });
  response.cookies.set(SESSION_COOKIE, createSessionToken(user.id), sessionCookieOptions());
  return response;
}
