import { analyzeRepository } from "@/features/repository-analysis/engine";
import { extractPdfResumeText, PdfResumeError, PDF_RESUME_MAX_BYTES } from "@/features/resume-matching/pdf";
import { GitHubServiceError } from "@/services/github";
import type { AnalysisInput, AnalysisStage } from "@/types/analysis";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_REQUEST_BYTES = PDF_RESUME_MAX_BYTES + 512 * 1024;
const requestSchema = z.object({
  repositoryUrl: z.string().trim().min(1).max(500),
  resumeText: z.string().max(50_000).optional(),
  jobDescription: z.string().max(50_000).optional(),
}).strict();

class RequestInputError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

const encoder = new TextEncoder();

function line(value: unknown): Uint8Array {
  return encoder.encode(`${JSON.stringify(value)}\n`);
}

function formText(form: FormData, name: string): string | undefined {
  const value = form.get(name);
  return typeof value === "string" && value.trim() ? value : undefined;
}

export async function parseAnalysisRequest(request: Request): Promise<AnalysisInput> {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    throw new RequestInputError("REQUEST_TOO_LARGE", "Analysis requests must be smaller than 5.5 MB.", 413);
  }

  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  let body: unknown;
  if (contentType.startsWith("multipart/form-data")) {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new RequestInputError("INVALID_MULTIPART", "The multipart request could not be read.", 400);
    }
    const pastedResume = formText(form, "resumeText");
    const resumeFile = form.get("resumeFile");
    let pdfText: string | undefined;
    if (resumeFile instanceof File && resumeFile.size > 0) pdfText = await extractPdfResumeText(resumeFile);
    const combinedResume = [pastedResume, pdfText].filter((value): value is string => Boolean(value)).join("\n\n");
    body = {
      repositoryUrl: formText(form, "repositoryUrl") ?? "",
      ...(combinedResume ? { resumeText: combinedResume } : {}),
      ...(formText(form, "jobDescription") ? { jobDescription: formText(form, "jobDescription") } : {}),
    };
  } else {
    try {
      body = await request.json();
    } catch {
      throw new RequestInputError("INVALID_JSON", "Request body must be valid JSON.", 400);
    }
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    throw new RequestInputError("INVALID_INPUT", "Analysis input is invalid.", 400, z.flattenError(parsed.error));
  }
  return parsed.data;
}

export async function POST(request: Request): Promise<Response> {
  let input: AnalysisInput;
  try {
    input = await parseAnalysisRequest(request);
  } catch (error) {
    if (error instanceof PdfResumeError || error instanceof RequestInputError) {
      return Response.json(
        { error: { code: error.code, message: error.message, ...(error instanceof RequestInputError && error.details ? { details: error.details } : {}) } },
        { status: error.status },
      );
    }
    return Response.json({ error: { code: "INVALID_INPUT", message: "Analysis input could not be processed." } }, { status: 400 });
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emitStage = (stage: AnalysisStage): void => controller.enqueue(line({ type: "stage", stage }));
      try {
        const result = await analyzeRepository(input, { onStage: emitStage });
        controller.enqueue(line({ type: "result", result }));
      } catch (error) {
        if (error instanceof GitHubServiceError) {
          controller.enqueue(line({
            type: "error",
            error: { code: error.code, message: error.message, status: error.status, retryAfter: error.retryAfter },
          }));
        } else {
          console.error(JSON.stringify({ event: "repository_analysis_failed", errorType: error instanceof Error ? error.name : "unknown" }));
          controller.enqueue(line({
            type: "error",
            error: { code: "ANALYSIS_FAILED", message: "The analysis could not be completed.", status: 500 },
          }));
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
