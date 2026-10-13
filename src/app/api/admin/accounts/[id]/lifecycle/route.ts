import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { changeAccountLifecycle, AccountLifecycleError } from "@/features/admin/account-lifecycle";
import { getAdminAuditStore } from "@/features/admin/store";
import { AdminAccessDenied, adminApiDenial, requireAdmin } from "@/features/auth/admin-guard";
import { denyCrossOrigin } from "@/features/auth/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ state: z.enum(["active", "suspended"]) }).strict();

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const crossOrigin = denyCrossOrigin(request);
  if (crossOrigin) return crossOrigin;
  let actor;
  try {
    actor = await requireAdmin(request);
  } catch (error) {
    if (error instanceof AdminAccessDenied) return adminApiDenial();
    throw error;
  }
  const { id } = await context.params;
  if (!id || id.length > 120) return Response.json({ error: { code: "INVALID_INPUT" } }, { status: 400 });
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: { code: "INVALID_INPUT" } }, { status: 400 });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? request.headers.get("x-real-ip")?.trim() ?? "unknown";
  try {
    const account = await getAdminAuditStore().withAdminAudit(actor, {
      action: body.data.state === "suspended" ? "account_suspend" : "account_reactivate",
      actionCategory: "account_lifecycle_change",
      targetKind: "account",
      targetId: id,
      parameters: { state: body.data.state },
    }, {
      requestCorrelationId: request.headers.get("x-request-id")?.slice(0, 200) || randomUUID(),
      requestMethod: "PATCH",
      route: "/api/admin/accounts/[id]/lifecycle",
      ipFingerprint: createHash("sha256").update(ip).digest("hex"),
      userAgentFamily: request.headers.get("user-agent")?.split(/[\s/]/u)[0]?.slice(0, 200) || null,
    }, (transaction) => changeAccountLifecycle(transaction, actor.userId, id, body.data.state));
    return Response.json({ account }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    if (error instanceof AccountLifecycleError) return Response.json({ error: { code: error.code } }, {
      status: error.code === "ACCOUNT_NOT_FOUND" ? 404 : 409,
      headers: { "cache-control": "private, no-store" },
    });
    throw error;
  }
}
