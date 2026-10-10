import { authenticateRequest, denyCrossOrigin } from "@/features/auth/guard";
import { getCandidateStore } from "@/features/candidates/store";
import { claimsText } from "@/features/evidence-requests/service";
import { getEvidenceRequestStore } from "@/features/evidence-requests/store";
import { EVIDENCE_REQUEST_LIMITS } from "@/features/evidence-requests/types";
import { analyzeRepository } from "@/features/repository-analysis/engine";
import { getRequirementsStore, toJobDescriptionText } from "@/features/requirements/store";
import { GitHubServiceError } from "@/services/github";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Analyses one repository the candidate sent. The recruiter starts it, as with
 * every other repository, and it runs through the same pipeline against the
 * saved company requirements and the claims the candidate made on their CV.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string; requestId: string }> }): Promise<Response> {
  const crossOrigin = denyCrossOrigin(request);
  if (crossOrigin) return crossOrigin;
  const user = await authenticateRequest();
  if (user instanceof Response) return user;

  let repositoryUrl: unknown;
  try {
    repositoryUrl = ((await request.json()) as { repositoryUrl?: unknown }).repositoryUrl;
  } catch {
    repositoryUrl = undefined;
  }

  const { id, requestId } = await context.params;
  const candidates = getCandidateStore();
  const evidence = getEvidenceRequestStore();
  const [candidate, evidenceRequest] = await Promise.all([candidates.getCandidate(user.id, id), evidence.get(user.id, requestId)]);
  if (!candidate || !evidenceRequest || evidenceRequest.candidateId !== id) {
    return Response.json({ error: { code: "NOT_FOUND", message: "Evidence request not found." } }, { status: 404 });
  }
  if (typeof repositoryUrl !== "string" || !evidenceRequest.response?.repositories.includes(repositoryUrl)) {
    return Response.json({ error: { code: "NOT_SUBMITTED", message: "Only a repository the candidate sent can be analyzed here." } }, { status: 400 });
  }

  const analyzed = candidate.repositoryOutcomes.filter((outcome) => outcome.status === "analyzed");
  if (analyzed.some((outcome) => outcome.repositoryUrl === repositoryUrl)) {
    return Response.json({ error: { code: "ALREADY_ANALYZED", message: "This repository is already in the dossier." } }, { status: 409 });
  }
  if (analyzed.length >= EVIDENCE_REQUEST_LIMITS.repositoriesPerCandidate) {
    return Response.json({ error: { code: "REPOSITORY_LIMIT", message: "This candidate already has the maximum number of analyzed repositories." } }, { status: 409 });
  }

  try {
    const [requirements, notes] = await Promise.all([getRequirementsStore().list(user.id), evidence.getCvNotes(user.id, id)]);
    const resumeText = claimsText(notes, candidate);
    const jobDescription = toJobDescriptionText(requirements);
    const result = await analyzeRepository({
      repositoryUrl,
      ...(resumeText ? { resumeText } : {}),
      ...(jobDescription ? { jobDescription } : {}),
    });
    const updated = await candidates.recordRepositorySuccess(user.id, id, result);
    return Response.json({ candidate: updated }, { status: 200 });
  } catch (error) {
    if (error instanceof GitHubServiceError) {
      return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    }
    return Response.json({ error: { code: "ANALYSIS_FAILED", message: "Repository analysis failed." } }, { status: 500 });
  }
}
