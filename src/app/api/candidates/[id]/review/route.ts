import { authenticateRequest, denyCrossOrigin } from "@/features/auth/guard";
import { getCandidateStore } from "@/features/candidates/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Records the human-in-the-loop step: the recruiter confirms they opened the
 * cited evidence for this candidate. The flag is informational and never
 * changes any analysis result or pipeline stage.
 */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const crossOrigin = denyCrossOrigin(request);
  if (crossOrigin) return crossOrigin;
  const user = await authenticateRequest();
  if (user instanceof Response) return user;
  let body: { reviewed?: unknown };
  try {
    body = await request.json() as { reviewed?: unknown };
  } catch {
    return Response.json({ error: { code: "INVALID_INPUT", message: "Send whether the evidence was checked." } }, { status: 400 });
  }
  if (typeof body.reviewed !== "boolean") {
    return Response.json({ error: { code: "INVALID_INPUT", message: "Send whether the evidence was checked." } }, { status: 400 });
  }
  const { id } = await context.params;
  const candidate = await getCandidateStore().setEvidenceReviewed(user.id, id, body.reviewed);
  return candidate
    ? Response.json({ candidate })
    : Response.json({ error: { code: "NOT_FOUND", message: "Candidate not found." } }, { status: 404 });
}
