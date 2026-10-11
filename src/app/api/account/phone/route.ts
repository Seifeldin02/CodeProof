import { getAccountsDatabase } from "@/features/accounts/database";
import { fail, ok, readBody, signedInRequest, text } from "@/features/accounts/http";
import { removePhone, setVerifiedPhone } from "@/features/accounts/profiles";
import { discardCode, issueCode, markCodeDelivered, verifyCode } from "@/features/auth-codes/codes";
import { signInCodeSms } from "@/features/auth-codes/messages";
import { signInOptions } from "@/features/auth/options";
import { clientAddressLimited } from "@/features/auth/request-limit";
import { sessionSecret } from "@/features/auth/session";
import { isLocale } from "@/i18n/translations";
import { configuredSmsProvider, normalizePhone } from "@/services/messaging/sms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A code for a number is bound to the account asking, so one person cannot confirm a number for another. */
const subject = (userId: string, phone: string): string => `${userId}\0${phone}`;

/**
 * Adds a mobile number to the account as a second place to receive sign-in
 * codes. POST without a code texts one to the number; POST with the code
 * confirms it. Available only when an SMS provider is configured.
 */
export async function POST(request: Request): Promise<Response> {
  const user = await signedInRequest(request);
  if (user instanceof Response) return user;
  const secret = sessionSecret();
  const sms = signInOptions().sms ? configuredSmsProvider() : null;
  if (!sms || !secret) return fail(503, "SMS_UNAVAILABLE");
  if (clientAddressLimited(request, "phone", { max: 20, windowMs: 15 * 60_000 })) return fail(429, "RATE_LIMITED");

  const body = await readBody(request);
  const phone = normalizePhone(text(body?.phone, 40));
  if (!phone) return fail(400, "INVALID_PHONE");
  const database = await getAccountsDatabase();
  const code = text(body?.code, 32);

  if (!code) {
    const issued = await issueCode(database.runner, { purpose: "phone_verification", channel: "sms", subject: subject(user.id, phone), secret });
    if (!issued.ok) return fail(429, issued.reason === "too_soon" ? "CODE_RECENTLY_SENT" : "TOO_MANY_CODES", { retryAfterSeconds: issued.retryAfterSeconds });
    try {
      await sms.send(phone, signInCodeSms(typeof body?.locale === "string" && isLocale(body.locale) ? body.locale : "en", issued.code));
    } catch {
      await discardCode(database.runner, issued.id);
      return fail(502, "DELIVERY_FAILED");
    }
    await markCodeDelivered(database.runner, issued.id);
    return ok({ sent: true });
  }

  const verified = await verifyCode(database, { purpose: "phone_verification", subject: subject(user.id, phone), code, secret });
  if (!verified.valid) return fail(401, "INVALID_CODE");
  if (!(await setVerifiedPhone(database.runner, user.id, phone))) return fail(409, "PHONE_IN_USE");
  return ok({ verified: true });
}

export async function DELETE(request: Request): Promise<Response> {
  const user = await signedInRequest(request);
  if (user instanceof Response) return user;
  await removePhone((await getAccountsDatabase()).runner, user.id);
  return ok({ removed: true });
}
