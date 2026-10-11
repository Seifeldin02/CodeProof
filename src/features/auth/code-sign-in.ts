import { randomBytes } from "node:crypto";
import { getProfile, type SignInMethod } from "@/features/accounts/profiles";
import { CODE_RULES, discardCode, issueCode, markCodeDelivered, verifyCode, type CodeChannel } from "@/features/auth-codes/codes";
import { signInCodeEmail, signInCodeSms } from "@/features/auth-codes/messages";
import type { SqlDatabase } from "@/features/persistence/sql";
import type { Locale } from "@/i18n/translations";
import type { MailProvider } from "@/services/messaging/mail";
import type { SmsProvider } from "@/services/messaging/sms";
import type { AuthPersistence, AuthUser } from "./store";

/**
 * Signing in with a code instead of a password.
 *
 * The person types their email address, receives a six-digit code, and enters
 * it. The same two steps create the account the first time. The answer to a
 * code request is the same whether or not the address has an account, so the
 * form cannot be used to find out who is registered.
 */

export interface CodeSignInDependencies {
  database: SqlDatabase;
  auth: Pick<AuthPersistence, "findByEmail" | "createUser">;
  mail: MailProvider | null;
  sms: SmsProvider | null;
  /** Hands the code back to the caller instead of sending it. Never set in production. */
  development: boolean;
  /** Keys the stored code digests. */
  secret: string;
  signupAllowed: boolean;
  now?: number;
}

export function normalizeEmail(input: string): string | null {
  const email = input.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export type RequestCodeResult =
  | { ok: true; channel: CodeChannel; expiresInSeconds: number; resendAfterSeconds: number; developmentCode?: string }
  | { ok: false; code: "INVALID_EMAIL" | "CODE_SIGN_IN_UNAVAILABLE" | "DELIVERY_FAILED" }
  | { ok: false; code: "CODE_RECENTLY_SENT" | "TOO_MANY_CODES"; retryAfterSeconds: number };

export async function requestSignInCode(
  input: { email: string; channel?: CodeChannel; locale: Locale },
  deps: CodeSignInDependencies,
): Promise<RequestCodeResult> {
  const email = normalizeEmail(input.email);
  if (!email) return { ok: false, code: "INVALID_EMAIL" };
  const channel: CodeChannel = input.channel === "sms" ? "sms" : "email";
  if (channel === "sms" ? !deps.sms : !deps.mail && !deps.development) return { ok: false, code: "CODE_SIGN_IN_UNAVAILABLE" };

  const account = await deps.auth.findByEmail(email);
  const accountUsable = account ? account.lifecycleState === "active" : deps.signupAllowed;
  // A text message can only go to a number the account has already verified.
  const phone = channel === "sms" && account && accountUsable ? (await getProfile(deps.database.runner, account.id)).phone : null;
  const deliverable = channel === "sms" ? phone !== null : accountUsable;

  const issued = await issueCode(deps.database.runner, { purpose: "sign_in", channel, subject: email, secret: deps.secret, now: deps.now });
  if (!issued.ok) {
    return { ok: false, code: issued.reason === "too_soon" ? "CODE_RECENTLY_SENT" : "TOO_MANY_CODES", retryAfterSeconds: issued.retryAfterSeconds };
  }

  const sent = { ok: true as const, channel, expiresInSeconds: CODE_RULES.lifetimeMs / 1000, resendAfterSeconds: CODE_RULES.resendAfterMs / 1000 };
  // Nothing is sent to an address that cannot sign in, and the caller is told the same thing either way.
  if (!deliverable) return sent;

  try {
    if (channel === "sms" && phone) await deps.sms?.send(phone, signInCodeSms(input.locale, issued.code));
    else if (deps.mail) await deps.mail.send(signInCodeEmail(input.locale, email, issued.code));
  } catch {
    await discardCode(deps.database.runner, issued.id);
    return { ok: false, code: "DELIVERY_FAILED" };
  }
  await markCodeDelivered(deps.database.runner, issued.id);
  return !deps.mail && deps.development && channel === "email" ? { ...sent, developmentCode: issued.code } : sent;
}

export type VerifiedSignIn =
  | { ok: true; user: AuthUser; created: boolean; method: SignInMethod }
  | { ok: false; code: "INVALID_EMAIL" | "INVALID_CODE" | "ACCOUNT_UNAVAILABLE" | "REGISTRATION_CLOSED" };

/**
 * Finds the account for an address whose ownership was just proved, or creates
 * it. A new account gets a random password nobody knows, so it can only be
 * entered with a code or a linked provider.
 */
export async function accountForVerifiedEmail(
  email: string,
  deps: Pick<CodeSignInDependencies, "auth" | "signupAllowed">,
): Promise<{ ok: true; user: AuthUser; created: boolean } | { ok: false; code: "ACCOUNT_UNAVAILABLE" | "REGISTRATION_CLOSED" }> {
  const existing = await deps.auth.findByEmail(email);
  if (existing) return existing.lifecycleState === "active" ? { ok: true, user: existing, created: false } : { ok: false, code: "ACCOUNT_UNAVAILABLE" };
  if (!deps.signupAllowed) return { ok: false, code: "REGISTRATION_CLOSED" };
  try {
    return { ok: true, user: await deps.auth.createUser(email, randomBytes(32).toString("base64url")), created: true };
  } catch (error) {
    // Two requests can verify the same new address at once. The second finds the account the first made.
    const raced = await deps.auth.findByEmail(email);
    if (raced && raced.lifecycleState === "active") return { ok: true, user: raced, created: false };
    throw error;
  }
}

export async function verifySignInCode(input: { email: string; code: string }, deps: CodeSignInDependencies): Promise<VerifiedSignIn> {
  const email = normalizeEmail(input.email);
  if (!email) return { ok: false, code: "INVALID_EMAIL" };
  const verified = await verifyCode(deps.database, { purpose: "sign_in", subject: email, code: input.code, secret: deps.secret, now: deps.now });
  if (!verified.valid) return { ok: false, code: "INVALID_CODE" };
  const account = await accountForVerifiedEmail(email, deps);
  if (!account.ok) return account;
  return { ...account, method: verified.channel === "sms" ? "sms_code" : "email_code" };
}
