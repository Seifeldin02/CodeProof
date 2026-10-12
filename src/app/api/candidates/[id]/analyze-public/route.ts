import { z } from "zod";
import { authenticateRequest, denyCrossOrigin } from "@/features/auth/guard";
import { getCandidateStore } from "@/features/candidates/store";
import { analyzeRepository } from "@/features/repository-analysis/engine";
import { GitHubServiceError, parseGitHubRepositoryUrl } from "@/services/github";

export const runtime = "nodejs";
export const maxDuration = 120;

const InputSchema = z.object({ repositoryUrl: z.string().trim().min(1).max(500) }).strict();

/** Adds optional public-code evidence to an existing CV-first candidate, without creating a duplicate applicant. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const denied = denyCrossOrigin(request);
  if (denied) return denied;
  const user = await authenticateRequest();
  if (user instanceof Response) return user;
  if (user.lifecycleState !== "active") return Response.json({ error: { code: "ACCOUNT_UNAVAILABLE" } }, { status: 403 });
  const input = InputSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: { code: "INVALID_INPUT" } }, { status: 400 });
  const { id } = await context.params;
  const store = getCandidateStore();
  const candidate = await store.getCandidate(user.id, id);
  if (!candidate) return Response.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  try {
    const url = parseGitHubRepositoryUrl(input.data.repositoryUrl).canonicalUrl;
    if (candidate.repositoryOutcomes.some((outcome) => outcome.repositoryUrl === url)) {
      return Response.json({ error: { code: "ALREADY_SELECTED" } }, { status: 409 });
    }
    if (candidate.repositoryOutcomes.length >= 3) {
      return Response.json({ error: { code: "REPOSITORY_LIMIT" } }, { status: 409 });
    }
    const result = await analyzeRepository({ repositoryUrl: url });
    const updated = await store.recordRepositorySuccess(user.id, id, result);
    return updated
      ? Response.json({ candidate: updated }, { headers: { "Cache-Control": "private, no-store" } })
      : Response.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  } catch (error) {
    if (error instanceof GitHubServiceError) return Response.json({ error: { code: error.code } }, { status: error.status });
    return Response.json({ error: { code: "ANALYSIS_FAILED" } }, { status: 502 });
  }
}
