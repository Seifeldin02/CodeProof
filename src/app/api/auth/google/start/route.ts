import { NextResponse } from "next/server";
import { publicOrigin, safeNextPath } from "@/features/auth/finish-sign-in";
import {
  beginGoogleFlow,
  GOOGLE_FLOW_COOKIE,
  GOOGLE_FLOW_COOKIE_PATH,
  GOOGLE_FLOW_MAX_AGE_SECONDS,
  googleRedirectUri,
  sealGoogleFlow,
} from "@/features/auth/google";
import { googleClient } from "@/features/auth/options";
import { clientAddressLimited } from "@/features/auth/request-limit";
import { sessionSecret } from "@/features/auth/session";
import { isWellFormedInvitationToken } from "@/features/organizations/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Sends the browser to Google. Nothing is changed here, so a plain link can start it. */
export async function GET(request: Request): Promise<Response> {
  const origin = publicOrigin(request);
  const back = (error: string) => NextResponse.redirect(`${origin}/signin?error=${error}`, { status: 303 });
  const client = googleClient();
  const secret = sessionSecret();
  if (!client || !secret) return back("google_unavailable");
  if (clientAddressLimited(request, "google-start", { max: 30, windowMs: 15 * 60_000 })) return back("rate_limited");

  const url = new URL(request.url);
  const invite = url.searchParams.get("invite");
  const { url: target, flow } = beginGoogleFlow({
    clientId: client.clientId,
    redirectUri: googleRedirectUri(origin),
    next: safeNextPath(url.searchParams.get("next")),
    invite: invite && isWellFormedInvitationToken(invite) ? invite : null,
  });

  const response = NextResponse.redirect(target, { status: 303 });
  response.headers.set("cache-control", "private, no-store");
  response.cookies.set(GOOGLE_FLOW_COOKIE, sealGoogleFlow(flow, secret), {
    httpOnly: true,
    // The browser comes back from Google by a top-level navigation, which `lax` allows.
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: GOOGLE_FLOW_COOKIE_PATH,
    maxAge: GOOGLE_FLOW_MAX_AGE_SECONDS,
  });
  return response;
}
