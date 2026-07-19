import { analyzeRepository } from "@/features/repository-analysis/engine";
import { GitHubServiceError } from "@/services/github";
import type { AnalysisStage } from "@/types/analysis";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 120;

const requestSchema = z.object({
  repositoryUrl: z.string().trim().min(1).max(500),
  resumeText: z.string().max(50_000).optional(),
  jobDescription: z.string().max(50_000).optional(),
}).strict();

const encoder = new TextEncoder();

function line(value: unknown): Uint8Array {
  return encoder.encode(`${JSON.stringify(value)}\n`);
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: { code: "INVALID_JSON", message: "Request body must be valid JSON." } }, { status: 400 });
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: { code: "INVALID_INPUT", message: "Analysis input is invalid.", details: z.flattenError(parsed.error) } },
      { status: 400 },
    );
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emitStage = (stage: AnalysisStage): void => controller.enqueue(line({ type: "stage", stage }));
      try {
        const result = await analyzeRepository(parsed.data, { onStage: emitStage });
        controller.enqueue(line({ type: "result", result }));
      } catch (error) {
        if (error instanceof GitHubServiceError) {
          controller.enqueue(line({
            type: "error",
            error: { code: error.code, message: error.message, status: error.status, retryAfter: error.retryAfter },
          }));
        } else {
          console.error("Repository analysis failed", error);
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
