import { getCandidateStore } from "@/features/candidates/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  const candidate = getCandidateStore().getCandidate(id);
  return candidate
    ? Response.json(candidate)
    : Response.json({ error: { code: "NOT_FOUND", message: "Candidate not found." } }, { status: 404 });
}
