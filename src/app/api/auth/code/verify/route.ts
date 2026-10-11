import { NextResponse } from "next/server";
import { getAccountsDatabase } from "@/features/accounts/database";
import { verifySignInCode } from "@/features/auth/code-sign-in";
import { finishSignIn, safeNextPath } from "@/features/auth/finish-sign-in";
import { denyCrossOrigin } from "@/features/auth/guard";
import { signInOptions } from "@/features/auth/options";
import { authRateLimited, clearAuthAttempts } from "@/features/auth/rate-limit";
import { SESSION_COOKIE, sessionCookieOptions, sessionSecret } from "@/features/auth/session";
import { getAuthStore } from "@/features/auth/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "private, no-store" };
const fail = (status: number, code: string) => NextResponse.json({ error: { code } }, { status, headers: NO_STORE });

const STATUS = { INVALID_EMAIL: 400, INVALID_CODE: 401, ACCOUNT_UNAVAILABLE: 403, REGISTRATION_CLOSED: 403 } as const;

/** Checks a sign-in code. A correct one signs the person in, creating their account the first time. */
export async function POST(request: Request): Promise<Response> {
  const crossOrigin = denyCrossOrigin(request);
  if (crossOrigin) return crossOrigin;
  const secret = sessionSecret();
  if (!secret) return fail(503, "SESSION_NOT_CONFIGURED");
  const options = signInOptions();
  if (!options.emailCode) return fail(503, "CODE_SIGN_IN_UNAVAILABLE");

  let body: { email?: unknown; code?: unknown; next?: unknown; invite?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return fail(400, "INVALID_CODE");
  }
  const email = typeof body.email === "string" ? body.email : "";
  const code = typeof body.code === "string" ? body.code : "";
  if (!email || email.length > 254 || !code || code.length > 32) return fail(400, email ? "INVALID_CODE" : "INVALID_EMAIL");
  if (authRateLimited(request, email)) return fail(429, "RATE_LIMITED");

  const result = await verifySignInCode({ email, code }, {
    database: await getAccountsDatabase(),
    auth: getAuthStore(),
    mail: null,
    sms: null,
    development: false,
    secret,
    signupAllowed: options.signup,
  });
  if (!result.ok) return fail(STATUS[result.code], result.code);

  clearAuthAttempts(request, email);
  const finished = await finishSignIn({
    user: result.user,
    method: result.method,
    next: safeNextPath(typeof body.next === "string" ? body.next : null),
    invite: typeof body.invite === "string" ? body.invite : null,
  });
  const response = NextResponse.json(
    { user: { id: result.user.id, email: result.user.email }, created: result.created, destination: finished.destination, joinedOrganization: finished.joinedOrganization },
    { status: result.created ? 201 : 200, headers: NO_STORE },
  );
  response.cookies.set(SESSION_COOKIE, finished.sessionToken, sessionCookieOptions());
  return response;
}
