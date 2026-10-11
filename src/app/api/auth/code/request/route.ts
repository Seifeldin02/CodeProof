import { NextResponse } from "next/server";
import { getAccountsDatabase } from "@/features/accounts/database";
import { requestSignInCode } from "@/features/auth/code-sign-in";
import { denyCrossOrigin } from "@/features/auth/guard";
import { signInOptions } from "@/features/auth/options";
import { authRateLimited } from "@/features/auth/rate-limit";
import { clientAddressLimited } from "@/features/auth/request-limit";
import { sessionSecret } from "@/features/auth/session";
import { getAuthStore } from "@/features/auth/store";
import { isLocale } from "@/i18n/translations";
import { configuredMailProvider } from "@/services/messaging/mail";
import { configuredSmsProvider } from "@/services/messaging/sms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "private, no-store" };
const fail = (status: number, code: string, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}) =>
  NextResponse.json({ error: { code, ...extra } }, { status, headers: { ...NO_STORE, ...headers } });

/**
 * Sends a sign-in code. The answer is the same whether or not the address has
 * an account, so this cannot be used to find out who is registered.
 */
export async function POST(request: Request): Promise<Response> {
  const crossOrigin = denyCrossOrigin(request);
  if (crossOrigin) return crossOrigin;
  const secret = sessionSecret();
  if (!secret) return fail(503, "SESSION_NOT_CONFIGURED");
  const options = signInOptions();
  if (!options.emailCode) return fail(503, "CODE_SIGN_IN_UNAVAILABLE");

  let body: { email?: unknown; channel?: unknown; locale?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return fail(400, "INVALID_EMAIL");
  }
  const email = typeof body.email === "string" ? body.email : "";
  if (!email || email.length > 254) return fail(400, "INVALID_EMAIL");
  if (clientAddressLimited(request, "code-request", { max: 30, windowMs: 15 * 60_000 }) || authRateLimited(request, email)) {
    return fail(429, "RATE_LIMITED");
  }

  const result = await requestSignInCode(
    { email, channel: body.channel === "sms" ? "sms" : "email", locale: typeof body.locale === "string" && isLocale(body.locale) ? body.locale : "en" },
    {
      database: await getAccountsDatabase(),
      auth: getAuthStore(),
      mail: configuredMailProvider(),
      sms: options.sms ? configuredSmsProvider() : null,
      development: options.emailCodeMode === "development",
      secret,
      signupAllowed: options.signup,
    },
  );

  if (result.ok) return NextResponse.json({ sent: true, ...result, ok: undefined }, { headers: NO_STORE });
  if (result.code === "CODE_RECENTLY_SENT" || result.code === "TOO_MANY_CODES") {
    return fail(429, result.code, { retryAfterSeconds: result.retryAfterSeconds }, { "retry-after": String(result.retryAfterSeconds) });
  }
  return fail(result.code === "INVALID_EMAIL" ? 400 : result.code === "DELIVERY_FAILED" ? 502 : 503, result.code);
}
