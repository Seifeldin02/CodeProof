import { NextResponse } from "next/server";
import { getCurrentUser } from "./session";
import type { AuthUser } from "./store";

/**
 * Guards the upload/analysis endpoints. Returns a 401 response to hand straight
 * back from the route when no recruiter is signed in, or null to continue.
 */
export async function denyUnlessSignedIn(): Promise<Response | null> {
  if (await getCurrentUser()) return null;
  return NextResponse.json(
    { error: { code: "AUTH_REQUIRED", message: "Sign in to upload or analyze." } },
    { status: 401 },
  );
}

/**
 * Guards read endpoints, which stay open unless the deployment opts in with
 * `CODEPROOF_PROTECT_ALL=true` (recommended when storing real candidates).
 */
export async function denyUnlessReadable(): Promise<Response | null> {
  return denyUnlessSignedIn();
}

export async function authenticateRequest(): Promise<AuthUser | Response> {
  const user = await getCurrentUser();
  return user ?? NextResponse.json(
    { error: { code: "AUTH_REQUIRED", message: "Sign in to continue." } },
    { status: 401 },
  );
}

/** Reject cross-site mutations even if a browser attaches an existing cookie. */
export function denyCrossOrigin(request: Request): Response | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  try {
    const originUrl = new URL(origin);
    const requestUrl = new URL(request.url);
    const expectedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim()
      || request.headers.get("host")?.trim()
      || requestUrl.host;
    if (originUrl.origin === requestUrl.origin || originUrl.host === expectedHost) return null;
  } catch {
    // Invalid origins are rejected below.
  }
  return NextResponse.json(
    { error: { code: "INVALID_ORIGIN", message: "This request did not originate from CodeProof." } },
    { status: 403 },
  );
}
