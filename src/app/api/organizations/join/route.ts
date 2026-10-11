import { getAccountsDatabase } from "@/features/accounts/database";
import { ok, organizationFailure, readBody, signedInRequest, text } from "@/features/accounts/http";
import { markOnboarded } from "@/features/accounts/profiles";
import { getAuthStore } from "@/features/auth/store";
import { acceptInvitation } from "@/features/organizations/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Joins an organisation with the link its admin sent. The link works only for the address it was sent to. */
export async function POST(request: Request): Promise<Response> {
  const user = await signedInRequest(request);
  if (user instanceof Response) return user;
  const body = await readBody(request);
  const database = await getAccountsDatabase();
  const joined = await acceptInvitation({ database, auth: getAuthStore() }, user, text(body?.token, 64));
  if (!joined.ok) return organizationFailure(joined.code);
  await markOnboarded(database.runner, user.id);
  return ok({ joined: true, organization: { id: joined.organization.id, name: joined.organization.name } });
}
