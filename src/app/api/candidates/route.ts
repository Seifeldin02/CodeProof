import { getCandidateStore } from "@/features/candidates/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return Response.json(getCandidateStore().listCandidates());
}
