import { z } from "zod";
import { authenticateRequest, denyCrossOrigin } from "@/features/auth/guard";
import { getRoleStore } from "@/features/shortlists/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateRoleSchema = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(20).max(8_000),
}).strict();

export async function GET(): Promise<Response> {
  const user = await authenticateRequest();
  if (user instanceof Response) return user;
  return Response.json({ roles: await getRoleStore().list(user.id) }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request): Promise<Response> {
  const denied = denyCrossOrigin(request);
  if (denied) return denied;
  const user = await authenticateRequest();
  if (user instanceof Response) return user;
  if (user.lifecycleState !== "active") return Response.json({ error: { code: "ACCOUNT_UNAVAILABLE" } }, { status: 403 });
  const parsed = CreateRoleSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: { code: "INVALID_INPUT" } }, { status: 400 });
  const role = await getRoleStore().create(user.id, parsed.data.title, parsed.data.description);
  return Response.json({ role }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
}
