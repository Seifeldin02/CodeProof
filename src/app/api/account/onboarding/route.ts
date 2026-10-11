import { getAccountsDatabase } from "@/features/accounts/database";
import { fail, ok, organizationFailure, readBody, signedInRequest, text } from "@/features/accounts/http";
import { cleanDisplayName, markOnboarded, setCompanyName, setDisplayName } from "@/features/accounts/profiles";
import { getAuthStore } from "@/features/auth/store";
import { createOrganization } from "@/features/organizations/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The welcome step: a name, and whether the person is setting up a company,
 * an agency, or working alone for now. Everything in it can be changed later.
 */
export async function POST(request: Request): Promise<Response> {
  const user = await signedInRequest(request);
  if (user instanceof Response) return user;
  const body = await readBody(request);
  if (!body) return fail(400, "INVALID_INPUT");

  const database = await getAccountsDatabase();
  const rawName = text(body.displayName, 200);
  if (rawName.trim()) {
    const displayName = cleanDisplayName(rawName);
    if (!displayName) return fail(400, "INVALID_NAME");
    await setDisplayName(database.runner, user.id, displayName);
  }

  const workspace = body.workspace && typeof body.workspace === "object" ? body.workspace as Record<string, unknown> : null;
  let organization: { id: string; name: string } | null = null;
  if (workspace) {
    const created = await createOrganization({ database, auth: getAuthStore() }, user.id, { name: text(workspace.name, 200), kind: text(workspace.kind, 20) });
    // Someone who joined through an invitation already has an organisation: the step still completes.
    if (!created.ok && created.code !== "ALREADY_IN_ORGANIZATION") return organizationFailure(created.code);
    if (created.ok) {
      organization = { id: created.organization.id, name: created.organization.name };
      await setCompanyName(database.runner, user.id, created.organization.name);
    }
  }

  await markOnboarded(database.runner, user.id);
  return ok({ onboarded: true, organization });
}
