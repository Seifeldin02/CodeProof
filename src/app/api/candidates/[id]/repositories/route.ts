import { authenticateRequest, denyCrossOrigin } from "@/features/auth/guard";
import { getCandidateStore } from "@/features/candidates/store";
import { analyzeRepository } from "@/features/repository-analysis/engine";
import { GitHubServiceError, parseGitHubRepositoryUrl } from "@/services/github";

export const runtime = "nodejs";
export const maxDuration = 120;

async function repositoryUrl(request: Request): Promise<string> {
  const body = await request.json() as { repositoryUrl?: unknown };
  if (typeof body.repositoryUrl !== "string") throw new Error("INVALID_REPOSITORY_URL");
  return parseGitHubRepositoryUrl(body.repositoryUrl).canonicalUrl;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const crossOrigin = denyCrossOrigin(request);
  if (crossOrigin) return crossOrigin;
  const user = await authenticateRequest();
  if (user instanceof Response) return user;
  const { id } = await context.params;
  const store = getCandidateStore();
  const candidate = await store.getCandidate(user.id, id);
  if (!candidate) return Response.json({ error: { code: "NOT_FOUND", message: "Candidate not found." } }, { status: 404 });
  try {
    const url = await repositoryUrl(request);
    const outcome = candidate.repositoryOutcomes.find((item) => item.repositoryUrl === url && item.status === "failed");
    if (!outcome) return Response.json({ error: { code: "NOT_RETRYABLE", message: "Only a failed repository can be retried." } }, { status: 409 });
    const result = await analyzeRepository({ repositoryUrl: url });
    const updated = await store.recordRepositorySuccess(user.id, id, result);
    return Response.json({ candidate: updated }, { status: 200 });
  } catch (error) {
    if (error instanceof GitHubServiceError) {
      return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    }
    return Response.json({ error: { code: "RETRY_FAILED", message: "Repository retry could not be completed." } }, { status: 400 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const crossOrigin = denyCrossOrigin(request);
  if (crossOrigin) return crossOrigin;
  const user = await authenticateRequest();
  if (user instanceof Response) return user;
  const { id } = await context.params;
  const store = getCandidateStore();
  if (!(await store.getCandidate(user.id, id))) return Response.json({ error: { code: "NOT_FOUND", message: "Candidate not found." } }, { status: 404 });
  try {
    const url = await repositoryUrl(request);
    if (!(await store.removeFailedRepository(user.id, id, url))) {
      return Response.json({ error: { code: "NOT_REMOVABLE", message: "Only a failed repository can be removed." } }, { status: 409 });
    }
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof GitHubServiceError) {
      return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    }
    return Response.json({ error: { code: "REMOVE_FAILED", message: "Repository could not be removed." } }, { status: 400 });
  }
}
