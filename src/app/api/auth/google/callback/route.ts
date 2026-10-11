import { NextResponse } from "next/server";
import { getAccountsDatabase } from "@/features/accounts/database";
import { findIdentity, linkIdentity } from "@/features/accounts/identities";
import { getProfile, setDisplayName } from "@/features/accounts/profiles";
import { accountForVerifiedEmail } from "@/features/auth/code-sign-in";
import { finishSignIn, publicOrigin } from "@/features/auth/finish-sign-in";
import {
  exchangeGoogleCode,
  GOOGLE_FLOW_COOKIE,
  GOOGLE_FLOW_COOKIE_PATH,
  googleRedirectUri,
  openGoogleFlow,
  sameState,
  verifyGoogleIdToken,
} from "@/features/auth/google";
import { googleClient } from "@/features/auth/options";
import { clientAddressLimited } from "@/features/auth/request-limit";
import { SESSION_COOKIE, sessionCookieOptions, sessionSecret } from "@/features/auth/session";
import { getAuthStore, signupAllowed } from "@/features/auth/store";
import { logger } from "@/services/observability/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cookieValue(request: Request, name: string): string | undefined {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return undefined;
}

/** Google sends the browser back here with a one-time code. */
export async function GET(request: Request): Promise<Response> {
  const origin = publicOrigin(request);
  const leave = (path: string) => {
    const response = NextResponse.redirect(`${origin}${path}`, { status: 303 });
    response.headers.set("cache-control", "private, no-store");
    // The flow cookie is single use, whatever the outcome.
    response.cookies.set(GOOGLE_FLOW_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: GOOGLE_FLOW_COOKIE_PATH, maxAge: 0 });
    return response;
  };
  const failed = (reason: string) => {
    logger.warn("google_sign_in_failed", { reason });
    return leave(`/signin?error=${reason === "cancelled" ? "google_cancelled" : reason === "account_unavailable" ? "account_unavailable" : reason === "registration_closed" ? "registration_closed" : "google_failed"}`);
  };

  const client = googleClient();
  const secret = sessionSecret();
  if (!client || !secret) return leave("/signin?error=google_unavailable");
  if (clientAddressLimited(request, "google-callback", { max: 30, windowMs: 15 * 60_000 })) return leave("/signin?error=rate_limited");

  const url = new URL(request.url);
  if (url.searchParams.get("error")) return failed("cancelled");
  const flow = openGoogleFlow(cookieValue(request, GOOGLE_FLOW_COOKIE), secret);
  const code = url.searchParams.get("code");
  if (!flow || !code || code.length > 2_048 || !sameState(flow.state, url.searchParams.get("state"))) return failed("state_mismatch");

  const idToken = await exchangeGoogleCode({ code, verifier: flow.verifier, clientId: client.clientId, clientSecret: client.clientSecret, redirectUri: googleRedirectUri(origin) });
  if (!idToken) return failed("exchange_refused");
  const identity = await verifyGoogleIdToken(idToken, { clientId: client.clientId, nonce: flow.nonce });
  if (!identity) return failed("token_rejected");

  const database = await getAccountsDatabase();
  const auth = getAuthStore();
  // A Google account already linked is recognised by its stable identifier, even if its address has changed.
  const linked = await findIdentity(database.runner, "google", identity.subject);
  const linkedUser = linked ? await auth.findById(linked.userId) : null;
  let user = linkedUser;
  if (linkedUser) {
    if (linkedUser.lifecycleState !== "active") return failed("account_unavailable");
  } else {
    // Google vouches for the address, which is the same proof an emailed code gives.
    const account = await accountForVerifiedEmail(identity.email, { auth, signupAllowed: signupAllowed() });
    if (!account.ok) return failed(account.code === "ACCOUNT_UNAVAILABLE" ? "account_unavailable" : "registration_closed");
    user = account.user;
  }
  if (!user) return failed("account_unavailable");
  await linkIdentity(database.runner, { userId: user.id, provider: "google", subject: identity.subject, email: identity.email });
  if (identity.name && !(await getProfile(database.runner, user.id)).displayName) await setDisplayName(database.runner, user.id, identity.name);

  const finished = await finishSignIn({ user, method: "google", next: flow.next, invite: flow.invite });
  const response = leave(finished.destination);
  response.cookies.set(SESSION_COOKIE, finished.sessionToken, sessionCookieOptions());
  return response;
}
