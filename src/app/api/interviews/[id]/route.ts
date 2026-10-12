import { authenticateRequest, denyCrossOrigin } from "@/features/auth/guard";
import { UpdateInterviewSchema } from "@/features/interviews/contracts";
import { getInterviewStore } from "@/features/interviews/store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  const user = await authenticateRequest(); if (user instanceof Response) return user;
  if (user.lifecycleState !== "active") return Response.json({ error: { code: "ACCOUNT_UNAVAILABLE" } }, { status: 403 });
  const session = await getInterviewStore().get(user.id, (await context.params).id);
  return session ? Response.json({ session }) : Response.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
}
export async function PATCH(request: Request, context: Context) {
  const denied = denyCrossOrigin(request); if (denied) return denied;
  const user = await authenticateRequest(); if (user instanceof Response) return user;
  if (user.lifecycleState !== "active") return Response.json({ error: { code: "ACCOUNT_UNAVAILABLE" } }, { status: 403 });
  const input = UpdateInterviewSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: { code: "INVALID_INPUT" } }, { status: 400 });
  try {
    const session = await getInterviewStore().update(user.id, (await context.params).id, input.data);
    return session ? Response.json({ session }) : Response.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  } catch (error) {
    // Dev bundling can instantiate the store and route from different module copies.
    // Match only the narrow domain-error code set; never echo arbitrary thrown errors.
    const code = error instanceof Error && "code" in error ? error.code : null;
    if (code === "STALE_REVISION" || code === "COMPLETED_LOCKED" || code === "INCOMPLETE_ASSESSMENT" || code === "INVALID_CRITERIA") {
      return Response.json({ error: { code } }, { status: 409 });
    }
    throw error;
  }
}
