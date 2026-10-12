import { z } from "zod";
import { authenticateRequest, denyCrossOrigin } from "@/features/auth/guard";
import { getCandidateStore } from "@/features/candidates/store";
import { ROLES } from "@/features/hiring-analytics/types";
import { discoverCandidateLinks } from "@/features/resume-matching/discovery";
import { extractPdfResumeText, PdfResumeError, PDF_RESUME_MAX_BYTES } from "@/features/resume-matching/pdf";
import { extractResumeClaims } from "@/features/resume-matching/claims";
import { extractExperienceTimeline } from "@/features/resume-matching/experience";
import { getCandidateResumeStore } from "@/features/shortlists/resume-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const InputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  role: z.enum(ROLES),
}).strict();

/** CV-only intake keeps candidate-reported claims, without pretending private code was inspected. */
export async function POST(request: Request): Promise<Response> {
  const denied = denyCrossOrigin(request);
  if (denied) return denied;
  const user = await authenticateRequest();
  if (user instanceof Response) return user;
  if (user.lifecycleState !== "active") return Response.json({ error: { code: "ACCOUNT_UNAVAILABLE" } }, { status: 403 });
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > PDF_RESUME_MAX_BYTES + 256 * 1024) {
    return Response.json({ error: { code: "REQUEST_TOO_LARGE" } }, { status: 413 });
  }
  try {
    const form = await request.formData();
    const input = InputSchema.safeParse({ name: form.get("name"), role: form.get("role") });
    if (!input.success) return Response.json({ error: { code: "INVALID_INPUT" } }, { status: 400 });
    const file = form.get("resumeFile");
    const pasted = typeof form.get("resumeText") === "string" ? String(form.get("resumeText")).trim() : "";
    const extracted = file instanceof File && file.size > 0 ? await extractPdfResumeText(file) : "";
    const resumeText = [pasted, extracted].filter(Boolean).join("\n\n");
    if (!resumeText) return Response.json({ error: { code: "CV_REQUIRED" } }, { status: 400 });
    if (resumeText.length > 50_000) return Response.json({ error: { code: "REQUEST_TOO_LARGE" } }, { status: 413 });

    const discovery = discoverCandidateLinks(resumeText);
    const claims = extractResumeClaims(resumeText);
    const candidate = await getCandidateStore().createCandidate(user.id, {
      name: input.data.name,
      role: input.data.role,
      results: [],
      intakeOnly: true,
      unanalyzedSources: [
        ...discovery.repositories.map((repository) => repository.url),
        ...discovery.profiles.map((profile) => profile.url),
        ...discovery.otherSources.map((source) => source.url),
      ].slice(0, 30),
    });
    try {
      // Dated entries are saved beside the claims. They are the CV's own words and dates, and are never counted as claims.
      if (!await getCandidateResumeStore().save(user.id, candidate.id, [...claims, ...extractExperienceTimeline(resumeText)])) {
        throw new Error("Candidate CV claim persistence failed.");
      }
    } catch (error) {
      await getCandidateStore().deleteCandidate(user.id, candidate.id);
      throw error;
    }
    return Response.json({ candidate, claimCount: claims.length }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof PdfResumeError) return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    return Response.json({ error: { code: "CV_INTAKE_FAILED" } }, { status: 500 });
  }
}
