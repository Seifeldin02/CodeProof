import { authenticateRequest } from "@/features/auth/guard";
import { getCandidateStore } from "@/features/candidates/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const user = await authenticateRequest();
  if (user instanceof Response) return user;
  return Response.json(await getCandidateStore().listCandidates(user.id));
}
