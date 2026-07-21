import { authenticateRequest, denyCrossOrigin } from "@/features/auth/guard";
import { getCandidateStore } from "@/features/candidates/store";
import { PIPELINE_STAGES, type CandidateOutcome } from "@/features/hiring-analytics/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const user = await authenticateRequest();
  if (user instanceof Response) return user;
  const { id } = await context.params;
  const candidate = await getCandidateStore().getCandidate(user.id, id);
  return candidate
    ? Response.json(candidate)
    : Response.json({ error: { code: "NOT_FOUND", message: "Candidate not found." } }, { status: 404 });
}

const OUTCOMES: CandidateOutcome[] = ["in_progress", "hired", "rejected", "withdrawn"];

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const crossOrigin = denyCrossOrigin(request);
  if (crossOrigin) return crossOrigin;
  const user = await authenticateRequest();
  if (user instanceof Response) return user;
  let body: { stage?: unknown; outcome?: unknown };
  try {
    body = await request.json() as { stage?: unknown; outcome?: unknown };
  } catch {
    return Response.json({ error: { code: "INVALID_INPUT", message: "Choose a valid stage and outcome." } }, { status: 400 });
  }
  if (typeof body.stage !== "string" || !PIPELINE_STAGES.includes(body.stage as typeof PIPELINE_STAGES[number]) ||
      typeof body.outcome !== "string" || !OUTCOMES.includes(body.outcome as CandidateOutcome)) {
    return Response.json({ error: { code: "INVALID_INPUT", message: "Choose a valid stage and outcome." } }, { status: 400 });
  }
  const { id } = await context.params;
  const candidate = await getCandidateStore().updatePipeline(
    user.id,
    id,
    body.stage as typeof PIPELINE_STAGES[number],
    body.outcome as CandidateOutcome,
  );
  return candidate
    ? Response.json({ candidate })
    : Response.json({ error: { code: "NOT_FOUND", message: "Candidate not found." } }, { status: 404 });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const crossOrigin = denyCrossOrigin(request);
  if (crossOrigin) return crossOrigin;
  const user = await authenticateRequest();
  if (user instanceof Response) return user;
  const { id } = await context.params;
  const deleted = await getCandidateStore().deleteCandidate(user.id, id);
  return deleted
    ? new Response(null, { status: 204 })
    : Response.json({ error: { code: "NOT_FOUND", message: "Candidate not found." } }, { status: 404 });
}
