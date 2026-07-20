import { NextResponse } from "next/server";
import { getCurrentUser } from "./session";
import { readsRequireAuth } from "./session";

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
  if (!readsRequireAuth()) return null;
  return denyUnlessSignedIn();
}
