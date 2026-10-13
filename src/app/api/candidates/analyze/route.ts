import { authenticateRequest, denyCrossOrigin } from "@/features/auth/guard";
import { analyzeRepository } from "@/features/repository-analysis/engine";
import { extractResumeClaims } from "@/features/resume-matching/claims";
import { discoverCandidateLinks } from "@/features/resume-matching/discovery";
import { extractExperienceTimeline } from "@/features/resume-matching/experience";
import { extractPdfResumeText, PdfResumeError, PDF_RESUME_MAX_BYTES } from "@/features/resume-matching/pdf";
import { getCandidateStore } from "@/features/candidates/store";
import { SOURCE_CHANNELS } from "@/features/hiring-analytics/types";
import { getCandidateResumeStore } from "@/features/shortlists/resume-store";
import type { RepositoryFailure } from "@/features/candidates/types";
import { GitHubServiceError, parseGitHubRepositoryUrl } from "@/services/github";
import type { AnalysisResult } from "@/types/analysis";
import { DiscoveryOriginSchema, type DiscoveryOrigin } from "@/types/remediation";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_REPOSITORIES = 3;
const inputSchema = z.object({
  candidateName: z.string().trim().min(2).max(100),
  role: z.string().trim().min(2).max(120),
  source: z.enum(SOURCE_CHANNELS).optional(),
  repositoryUrls: z.array(z.string().trim().min(1).max(500)).min(1).max(MAX_REPOSITORIES),
  resumeText: z.string().max(50_000),
  jobDescription: z.string().max(50_000).optional(),
  repositorySelections: z.array(z.object({
    repositoryUrl: z.string().url().max(500),
    discoveryOrigin: DiscoveryOriginSchema,
    candidateSourceClaim: z.boolean(),
  }).strict()).max(MAX_REPOSITORIES),
}).strict();

function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function repositories(form: FormData): string[] {
  const raw = text(form, "repositoryUrls");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = raw.split(/[\n,]/).map((value) => value.trim()).filter(Boolean);
  }
  if (!Array.isArray(parsed)) return [];
  return [...new Set(parsed.filter((value): value is string => typeof value === "string").map((value) => parseGitHubRepositoryUrl(value).canonicalUrl))];
}

function requestedOrigins(form: FormData): Map<string, DiscoveryOrigin> {
  const raw = text(form, "repositorySelections");
  if (!raw) return new Map();
  try {
    const parsed = z.array(z.object({
      repositoryUrl: z.string().trim().min(1).max(500),
      discoveryOrigin: DiscoveryOriginSchema,
    }).strict()).max(MAX_REPOSITORIES).parse(JSON.parse(raw));
    return new Map(parsed.map((selection) => [
      parseGitHubRepositoryUrl(selection.repositoryUrl).canonicalUrl,
      selection.discoveryOrigin,
    ]));
  } catch {
    return new Map();
  }
}

export async function POST(request: Request): Promise<Response> {
  const crossOrigin = denyCrossOrigin(request);
  if (crossOrigin) return crossOrigin;
  const user = await authenticateRequest();
  if (user instanceof Response) return user;

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > PDF_RESUME_MAX_BYTES + 512 * 1024) {
    return Response.json({ error: { code: "REQUEST_TOO_LARGE", message: "Candidate analysis requests must be smaller than 5.5 MB." } }, { status: 413 });
  }
  try {
    const form = await request.formData();
    if (text(form, "isDemo") === "true") {
      return Response.json({ error: { code: "DEMO_CREATION_DISABLED" } }, { status: 400 });
    }
    const file = form.get("resumeFile");
    const pasted = text(form, "resumeText");
    const extracted = file instanceof File && file.size > 0 ? await extractPdfResumeText(file) : "";
    const resumeText = [pasted, extracted].filter(Boolean).join("\n\n").slice(0, 50_000);
    if (!resumeText) return Response.json({ error: { code: "CV_REQUIRED", message: "Upload a CV PDF or paste CV text." } }, { status: 400 });

    const discovered = discoverCandidateLinks(resumeText);
    const selectedRepositories = repositories(form);
    const requestedRepositoryOrigins = requestedOrigins(form);
    const cvRepositories = new Set(discovered.repositories.map((repository) => repository.url));
    const repositorySelections = selectedRepositories.map((repositoryUrl) => {
      const requestedOrigin = requestedRepositoryOrigins.get(repositoryUrl);
      const discoveryOrigin: DiscoveryOrigin = cvRepositories.has(repositoryUrl)
        ? "CV"
        : requestedOrigin === "portfolio" || requestedOrigin === "GitHub profile"
          ? requestedOrigin
          : "manual entry";
      return {
        repositoryUrl,
        discoveryOrigin,
        candidateSourceClaim: discoveryOrigin === "CV" || discoveryOrigin === "portfolio",
      };
    });
    // Only the explicitly chosen saved role (or typed brief) sets the hiring bar.
    const jobDescription = text(form, "jobDescription");
    const parsed = inputSchema.parse({
      candidateName: text(form, "candidateName") || discovered.candidateName || "Unnamed candidate",
      role: text(form, "role") || discovered.suggestedRole,
      source: text(form, "source") || undefined,
      repositoryUrls: selectedRepositories,
      resumeText,
      ...(jobDescription ? { jobDescription } : {}),
      repositorySelections,
    });

    const results: AnalysisResult[] = [];
    const failedRepositories: RepositoryFailure[] = [];
    for (const repositoryUrl of parsed.repositoryUrls) {
      try {
        results.push(await analyzeRepository({ repositoryUrl, resumeText: parsed.resumeText, jobDescription: parsed.jobDescription }));
      } catch (error) {
        failedRepositories.push({
          repositoryUrl,
          code: error instanceof GitHubServiceError ? error.code : "ANALYSIS_FAILED",
          message: error instanceof GitHubServiceError ? error.message : "Repository analysis failed.",
        });
      }
    }
    if (results.length === 0) {
      return Response.json({ error: { code: "NO_REPOSITORIES_ANALYZED", message: "None of the selected repositories could be analyzed." }, failedRepositories }, { status: 422 });
    }
    const candidate = await getCandidateStore().createCandidate(user.id, {
      name: parsed.candidateName,
      role: parsed.role,
      source: parsed.source,
      results,
      failures: failedRepositories,
      isDemo: false,
      repositorySelections: parsed.repositorySelections,
      // Portfolios and non-GitHub hosts are recorded so the queue can report
      // them as unknown rather than silently dropping them.
      unanalyzedSources: discovered.otherSources.map((source) => source.url),
    });
    // The CV's own claims and dated entries are kept beside the analysis, so this applicant can be found by skill and
    // compared with a role like one added from a CV alone. Failing to keep them must not lose the analysis just made.
    await getCandidateResumeStore()
      .save(user.id, candidate.id, [...extractResumeClaims(parsed.resumeText), ...extractExperienceTimeline(parsed.resumeText)])
      .catch(() => false);
    return Response.json({ candidate, failedRepositories }, { status: 201 });
  } catch (error) {
    if (error instanceof PdfResumeError || error instanceof GitHubServiceError) {
      return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    }
    if (error instanceof z.ZodError) return Response.json({ error: { code: "INVALID_INPUT", message: "Candidate details or repository selections are invalid." } }, { status: 400 });
    return Response.json({ error: { code: "ANALYSIS_FAILED", message: "Candidate analysis could not be completed." } }, { status: 500 });
  }
}
