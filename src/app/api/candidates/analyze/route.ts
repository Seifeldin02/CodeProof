import { analyzeRepository } from "@/features/repository-analysis/engine";
import { discoverCandidateLinks } from "@/features/resume-matching/discovery";
import { extractPdfResumeText, PdfResumeError, PDF_RESUME_MAX_BYTES } from "@/features/resume-matching/pdf";
import { getCandidateStore } from "@/features/candidates/store";
import type { RepositoryFailure } from "@/features/candidates/types";
import { ROLES } from "@/features/hiring-analytics/types";
import { GitHubServiceError, parseGitHubRepositoryUrl } from "@/services/github";
import type { AnalysisResult } from "@/types/analysis";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_REPOSITORIES = 3;
const inputSchema = z.object({
  candidateName: z.string().trim().min(2).max(100),
  role: z.enum(ROLES),
  repositoryUrls: z.array(z.string().trim().min(1).max(500)).min(1).max(MAX_REPOSITORIES),
  resumeText: z.string().max(50_000),
  jobDescription: z.string().max(50_000).optional(),
  isDemo: z.boolean().optional(),
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

export async function POST(request: Request): Promise<Response> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > PDF_RESUME_MAX_BYTES + 512 * 1024) {
    return Response.json({ error: { code: "REQUEST_TOO_LARGE", message: "Candidate analysis requests must be smaller than 5.5 MB." } }, { status: 413 });
  }
  try {
    const form = await request.formData();
    const file = form.get("resumeFile");
    const pasted = text(form, "resumeText");
    const extracted = file instanceof File && file.size > 0 ? await extractPdfResumeText(file) : "";
    const resumeText = [pasted, extracted].filter(Boolean).join("\n\n").slice(0, 50_000);
    if (!resumeText) return Response.json({ error: { code: "CV_REQUIRED", message: "Upload a CV PDF or paste CV text." } }, { status: 400 });

    const discovered = discoverCandidateLinks(resumeText);
    const parsed = inputSchema.parse({
      candidateName: text(form, "candidateName") || discovered.candidateName || "Unnamed candidate",
      role: text(form, "role") || discovered.suggestedRole,
      repositoryUrls: repositories(form),
      resumeText,
      ...(text(form, "jobDescription") ? { jobDescription: text(form, "jobDescription") } : {}),
      isDemo: text(form, "isDemo") === "true",
    });

    const results: AnalysisResult[] = [];
    const failedRepositories: RepositoryFailure[] = [];
    for (const repositoryUrl of parsed.repositoryUrls) {
      try {
        results.push(await analyzeRepository({ repositoryUrl, resumeText: parsed.resumeText, jobDescription: parsed.jobDescription }));
      } catch (error) {
        failedRepositories.push({
          repositoryUrl,
          message: error instanceof GitHubServiceError ? error.message : "Repository analysis failed.",
        });
      }
    }
    if (results.length === 0) {
      return Response.json({ error: { code: "NO_REPOSITORIES_ANALYZED", message: "None of the selected repositories could be analyzed." }, failedRepositories }, { status: 422 });
    }
    const candidate = getCandidateStore().createCandidate({ name: parsed.candidateName, role: parsed.role, results, isDemo: parsed.isDemo });
    return Response.json({ candidate, failedRepositories }, { status: 201 });
  } catch (error) {
    if (error instanceof PdfResumeError || error instanceof GitHubServiceError) {
      return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    }
    if (error instanceof z.ZodError) return Response.json({ error: { code: "INVALID_INPUT", message: "Candidate details or repository selections are invalid." } }, { status: 400 });
    return Response.json({ error: { code: "ANALYSIS_FAILED", message: "Candidate analysis could not be completed." } }, { status: 500 });
  }
}
