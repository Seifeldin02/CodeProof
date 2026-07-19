import { discoverCandidateLinks } from "@/features/resume-matching/discovery";
import { extractPdfResumeText, PdfResumeError, PDF_RESUME_MAX_BYTES } from "@/features/resume-matching/pdf";
import { z } from "zod";

export const runtime = "nodejs";

const jsonSchema = z.object({ resumeText: z.string().trim().min(1).max(50_000) }).strict();

export async function POST(request: Request): Promise<Response> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > PDF_RESUME_MAX_BYTES + 256 * 1024) {
    return Response.json({ error: { code: "REQUEST_TOO_LARGE", message: "CV requests must be smaller than 5.25 MB." } }, { status: 413 });
  }
  try {
    const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
    let resumeText: string;
    if (contentType.startsWith("multipart/form-data")) {
      const form = await request.formData();
      const pasted = typeof form.get("resumeText") === "string" ? String(form.get("resumeText")).trim() : "";
      const file = form.get("resumeFile");
      const extracted = file instanceof File && file.size > 0 ? await extractPdfResumeText(file) : "";
      resumeText = [pasted, extracted].filter(Boolean).join("\n\n");
    } else {
      resumeText = jsonSchema.parse(await request.json()).resumeText;
    }
    if (!resumeText.trim()) return Response.json({ error: { code: "CV_REQUIRED", message: "Upload a text-based PDF or paste CV text." } }, { status: 400 });
    return Response.json({ discovery: discoverCandidateLinks(resumeText) });
  } catch (error) {
    if (error instanceof PdfResumeError) return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    return Response.json({ error: { code: "CV_INVALID", message: "The CV could not be processed." } }, { status: 400 });
  }
}
