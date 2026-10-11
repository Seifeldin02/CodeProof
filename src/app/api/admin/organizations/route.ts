import { fail, ok, readBody, text } from "@/features/accounts/http";
import { createOrganizationAsOwner } from "@/features/admin/console-commands";
import { adminCommandDependencies, adminCommandFailure } from "@/features/admin/http";
import { AdminAccessDenied, adminApiDenial, requireAdmin } from "@/features/auth/admin-guard";
import { denyCrossOrigin } from "@/features/auth/guard";
import type { AdminActor } from "@/types/remediation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Sets up a company or an agency for a customer. Its admin is assigned afterwards. */
export async function POST(request: Request): Promise<Response> {
  let actor: AdminActor;
  try {
    actor = await requireAdmin(request);
  } catch (error) {
    if (error instanceof AdminAccessDenied) return adminApiDenial();
    throw error;
  }
  const crossOrigin = denyCrossOrigin(request);
  if (crossOrigin) return crossOrigin;
  const body = await readBody(request);
  if (!body) return fail(400, "INVALID_INPUT");

  const created = await createOrganizationAsOwner(await adminCommandDependencies(request, actor), {
    name: text(body.name, 200),
    kind: text(body.kind, 20),
    planTierId: text(body.planTierId, 80),
  });
  return created.ok ? ok({ organization: { id: created.organization.id } }, 201) : adminCommandFailure(created.code);
}
