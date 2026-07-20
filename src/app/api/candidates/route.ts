import { denyUnlessReadable } from "@/features/auth/guard";
import { getCandidateStore } from "@/features/candidates/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const denied = await denyUnlessReadable();
  if (denied) return denied;

  return Response.json(getCandidateStore().listCandidates());
}
