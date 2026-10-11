import { z } from "zod";
import { authenticateRequest, denyCrossOrigin } from "@/features/auth/guard";
import { getCandidateStore } from "@/features/candidates/store";
import { cvNotesFromResume } from "@/features/evidence-requests/service";
import { getEvidenceRequestStore } from "@/features/evidence-requests/store";
import { ROLES } from "@/features/hiring-analytics/types";
import { discoverCandidateLinks } from "@/features/resume-matching/discovery";
import { extractPdfResumeText, PdfResumeError, PDF_RESUME_MAX_BYTES } from "@/features/resume-matching/pdf";

export const runtime = "nodejs";

const inputSchema = z.object({
  candidateName: z.string().trim().min(2).max(100),
  role: z.enum(ROLES),
  isDemo: z.boolean(),
}).strict();

function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Saves a candidate whose CV names no repository CodeProof can read.
 *
 * Without this, such a candidate could not be recorded at all, so they never
 * reached the review queue and could not be asked for their own evidence. They
 * are stored with no code read, which every screen reports as unknown. The CV
 * text is not kept: only the claims it makes, so later code can be checked
 * against them.
 */
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
    const file = form.get("resumeFile");
    const extracted = file instanceof File && file.size > 0 ? await extractPdfResumeText(file) : "";
    const resumeText = [text(form, "resumeText"), extracted].filter(Boolean).join("\n\n").slice(0, 50_000);
    if (!resumeText) return Response.json({ error: { code: "CV_REQUIRED", message: "Upload a CV PDF or paste CV text." } }, { status: 400 });

    const discovered = discoverCandidateLinks(resumeText);
    const parsed = inputSchema.parse({
      candidateName: text(form, "candidateName") || discovered.candidateName || "Unnamed candidate",
      role: text(form, "role") || discovered.suggestedRole,
      isDemo: text(form, "isDemo") === "true",
    });

    const store = getCandidateStore();
    const candidate = await store.createCandidate(user.id, {
      name: parsed.candidateName,
      role: parsed.role,
      results: [],
      failures: [],
      isDemo: parsed.isDemo,
      initialStage: "screening",
      unanalyzedSources: discovered.otherSources.map((source) => source.url),
    });
    await getEvidenceRequestStore().saveCvNotes(user.id, candidate.id, cvNotesFromResume(resumeText));
    return Response.json({ candidate }, { status: 201 });
  } catch (error) {
    if (error instanceof PdfResumeError) return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    if (error instanceof z.ZodError) return Response.json({ error: { code: "INVALID_INPUT", message: "Candidate details are invalid." } }, { status: 400 });
    return Response.json({ error: { code: "INTAKE_FAILED", message: "The candidate could not be saved." } }, { status: 500 });
  }
}
