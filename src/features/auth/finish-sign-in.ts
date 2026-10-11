import { getAccountsDatabase } from "@/features/accounts/database";
import { getProfile, recordSignIn, touchLastActivity, type SignInMethod } from "@/features/accounts/profiles";
import { acceptInvitation, isWellFormedInvitationToken } from "@/features/organizations/service";
import { createSessionToken } from "./session";
import { getAuthStore, type AuthUser } from "./store";

/** Only same-site paths are accepted, so a `next` value cannot send someone to another site. */
export function safeNextPath(value: string | null | undefined, fallback = "/"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[\r\n]/.test(value)) return fallback;
  return value.length <= 500 ? value : fallback;
}

/**
 * The address this deployment is reached at. `CODEPROOF_PUBLIC_URL` wins when
 * it is set; otherwise it is read from the request as the host forwarded it.
 */
export function publicOrigin(request: Request): string {
  const configured = process.env.CODEPROOF_PUBLIC_URL?.trim().replace(/\/+$/, "");
  if (configured && /^https?:\/\/[^/\s]+$/.test(configured)) return configured;
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || request.headers.get("host")?.trim() || url.host;
  const protocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || url.protocol.replace(":", "");
  return `${protocol === "http" ? "http" : "https"}://${host}`;
}

export interface FinishedSignIn {
  /** The value for the session cookie. */
  sessionToken: string;
  /** Where to send the person next. */
  destination: string;
  /** The organisation they joined by answering an invitation while signing in, if any. */
  joinedOrganization: string | null;
}

/**
 * What happens once someone has proved who they are, however they did it:
 * the sign-in is recorded, an invitation they were answering is accepted, and
 * a first-time visitor is sent to the welcome step.
 */
export async function finishSignIn(input: {
  user: AuthUser;
  method: SignInMethod;
  next: string;
  invite?: string | null;
}): Promise<FinishedSignIn> {
  const database = await getAccountsDatabase();
  const now = new Date().toISOString();
  await recordSignIn(database.runner, input.user.id, input.method, now);
  await touchLastActivity(database.runner, input.user.id, now);

  let joinedOrganization: string | null = null;
  // An invitation link admits only the address it was sent to, and a password does not prove an address.
  if (input.invite && isWellFormedInvitationToken(input.invite) && input.method !== "password") {
    const joined = await acceptInvitation({ database, auth: getAuthStore() }, input.user, input.invite);
    if (joined.ok) joinedOrganization = joined.organization.name;
  }

  // Someone who has just joined goes to their team, not back to the invitation, which is now used.
  const next = joinedOrganization ? "/team" : safeNextPath(input.next);
  const profile = await getProfile(database.runner, input.user.id);
  const destination = profile.onboardedAt ? next : `/welcome?next=${encodeURIComponent(next)}`;
  return { sessionToken: createSessionToken(input.user.id), destination, joinedOrganization };
}
