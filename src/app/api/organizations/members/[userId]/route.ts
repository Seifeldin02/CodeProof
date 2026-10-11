import { getAccountsDatabase } from "@/features/accounts/database";
import { ok, organizationFailure, readBody, signedInRequest, text } from "@/features/accounts/http";
import { getAuthStore } from "@/features/auth/store";
import { changeMemberRole, leaveOrganization, removeMember } from "@/features/organizations/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Changes a member's role. Only the organisation's admin can, and one admin always remains. */
export async function PATCH(request: Request, context: { params: Promise<{ userId: string }> }): Promise<Response> {
  const user = await signedInRequest(request);
  if (user instanceof Response) return user;
  const body = await readBody(request);
  const { userId } = await context.params;
  const changed = await changeMemberRole({ database: await getAccountsDatabase(), auth: getAuthStore() }, user.id, userId, text(body?.role, 20));
  return changed.ok ? ok({ changed: true }) : organizationFailure(changed.code);
}

/**
 * Removes a member, or lets a person leave when the member is themselves.
 * Their account and their candidates stay theirs.
 */
export async function DELETE(request: Request, context: { params: Promise<{ userId: string }> }): Promise<Response> {
  const user = await signedInRequest(request);
  if (user instanceof Response) return user;
  const { userId } = await context.params;
  const deps = { database: await getAccountsDatabase(), auth: getAuthStore() };
  const removed = userId === user.id ? await leaveOrganization(deps, user.id) : await removeMember(deps, user.id, userId);
  return removed.ok ? ok({ removed: true }) : organizationFailure(removed.code);
}
