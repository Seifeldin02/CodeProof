import { getAccountsDatabase } from "@/features/accounts/database";
import { fail, ok, organizationFailure, readBody, signedInRequest, text } from "@/features/accounts/http";
import { getProfile, markOnboarded } from "@/features/accounts/profiles";
import { getAuthStore } from "@/features/auth/store";
import { acceptInvitationForVerifiedEmail, declineInvitation, revokeInvitation } from "@/features/organizations/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Answers an invitation addressed to the signed-in person, from their own list.
 * Without the secret link, the address alone admits them, so it must have been
 * proved: an account that has only ever used a password has to use the link.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const user = await signedInRequest(request);
  if (user instanceof Response) return user;
  const body = await readBody(request);
  const answer = text(body?.answer, 20);
  if (answer !== "accept" && answer !== "decline") return fail(400, "INVALID_INPUT");
  const { id } = await context.params;
  const database = await getAccountsDatabase();
  const deps = { database, auth: getAuthStore() };

  if (!(await getProfile(database.runner, user.id)).emailVerifiedAt) return fail(403, "EMAIL_NOT_VERIFIED");
  if (answer === "decline") {
    const declined = await declineInvitation(deps, user, id);
    return declined.ok ? ok({ declined: true }) : organizationFailure(declined.code);
  }
  const joined = await acceptInvitationForVerifiedEmail(deps, user, id);
  if (!joined.ok) return organizationFailure(joined.code);
  await markOnboarded(database.runner, user.id);
  return ok({ joined: true, organization: { id: joined.organization.id, name: joined.organization.name } });
}

/** Closes an invitation. Only the organisation's admin can. */
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const user = await signedInRequest(request);
  if (user instanceof Response) return user;
  const { id } = await context.params;
  const revoked = await revokeInvitation({ database: await getAccountsDatabase(), auth: getAuthStore() }, user.id, id);
  return revoked.ok ? ok({ revoked: true }) : organizationFailure(revoked.code);
}
