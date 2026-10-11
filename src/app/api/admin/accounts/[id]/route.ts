import { fail, ok, readBody, text } from "@/features/accounts/http";
import { ACCOUNT_ACTIONS, changeAccountPlan, changeAccountState, type AccountAction } from "@/features/admin/console-commands";
import { adminCommandDependencies, adminCommandFailure } from "@/features/admin/http";
import { AdminAccessDenied, adminApiDenial, requireAdmin } from "@/features/auth/admin-guard";
import { denyCrossOrigin } from "@/features/auth/guard";
import type { AdminActor } from "@/types/remediation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Suspends, reactivates, removes or restores an account, or places it on a plan. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
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
  const { id } = await params;
  const deps = await adminCommandDependencies(request, actor);

  const action = text(body.action, 20);
  if (action === "plan") {
    const changed = await changeAccountPlan(deps, id, text(body.planTierId, 80));
    return changed.ok ? ok() : adminCommandFailure(changed.code);
  }
  if (!ACCOUNT_ACTIONS.includes(action as AccountAction)) return fail(400, "INVALID_INPUT");
  const changed = await changeAccountState(deps, id, action as AccountAction);
  return changed.ok ? ok({ lifecycleState: changed.lifecycleState }) : adminCommandFailure(changed.code);
}
