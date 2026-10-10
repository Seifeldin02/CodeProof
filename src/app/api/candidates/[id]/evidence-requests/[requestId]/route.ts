import { authenticateRequest, denyCrossOrigin } from "@/features/auth/guard";
import { getEvidenceRequestStore } from "@/features/evidence-requests/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Closes an unanswered request, so its link stops working. An answer already given is kept. */
export async function DELETE(request: Request, context: { params: Promise<{ id: string; requestId: string }> }): Promise<Response> {
  const crossOrigin = denyCrossOrigin(request);
  if (crossOrigin) return crossOrigin;
  const user = await authenticateRequest();
  if (user instanceof Response) return user;
  const { id, requestId } = await context.params;
  const store = getEvidenceRequestStore();
  const existing = await store.get(user.id, requestId);
  if (!existing || existing.candidateId !== id) {
    return Response.json({ error: { code: "NOT_FOUND", message: "Evidence request not found." } }, { status: 404 });
  }
  return (await store.revoke(user.id, requestId))
    ? new Response(null, { status: 204 })
    : Response.json({ error: { code: "NOT_OPEN", message: "Only a request that is still waiting for an answer can be closed." } }, { status: 409 });
}
