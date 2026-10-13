import { authenticateRequest, denyCrossOrigin } from "@/features/auth/guard";
import { getShareStore } from "@/features/sharing/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(request: Request, context: { params: Promise<{ id: string; shareId: string }> }): Promise<Response> {
  const crossOrigin = denyCrossOrigin(request);
  if (crossOrigin) return crossOrigin;
  const user = await authenticateRequest();
  if (user instanceof Response) return user;
  const { id, shareId } = await context.params;
  if (!/^[0-9a-f-]{36}$/iu.test(id) || !/^[0-9a-f-]{36}$/iu.test(shareId)) {
    return Response.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  }
  const revoked = await getShareStore().revoke(user.id, id, shareId);
  if (!revoked) return Response.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  return new Response(null, { status: 204, headers: { "cache-control": "private, no-store" } });
}
