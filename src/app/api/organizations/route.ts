import { getAccountsDatabase } from "@/features/accounts/database";
import { fail, ok, organizationFailure, readBody, signedInRequest, text } from "@/features/accounts/http";
import { markOnboarded, setCompanyName } from "@/features/accounts/profiles";
import { getAuthStore } from "@/features/auth/store";
import { createOrganization } from "@/features/organizations/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Creates a company or an agency. Whoever creates it becomes its admin. */
export async function POST(request: Request): Promise<Response> {
  const user = await signedInRequest(request);
  if (user instanceof Response) return user;
  const body = await readBody(request);
  if (!body) return fail(400, "INVALID_INPUT");
  const database = await getAccountsDatabase();
  const created = await createOrganization({ database, auth: getAuthStore() }, user.id, { name: text(body.name, 200), kind: text(body.kind, 20) });
  if (!created.ok) return organizationFailure(created.code);
  await setCompanyName(database.runner, user.id, created.organization.name);
  await markOnboarded(database.runner, user.id);
  return ok({ organization: { id: created.organization.id, name: created.organization.name, kind: created.organization.kind } }, 201);
}
