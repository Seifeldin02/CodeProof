import { z } from "zod";
import { authenticateRequest, denyCrossOrigin } from "@/features/auth/guard";
import { getCandidateStore } from "@/features/candidates/store";
import { buildSharedReport, getShareStore } from "@/features/sharing/store";
import { ShareExpiryOptionSchema } from "@/types/remediation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };
const CreateBody = z.object({ analysisId: z.string().uuid(), expiry: ShareExpiryOptionSchema }).strict();
const headers = { "cache-control": "private, no-store" };

export async function GET(_request: Request, context: Context): Promise<Response> {
  const user = await authenticateRequest();
  if (user instanceof Response) return user;
  const { id } = await context.params;
  const candidate = await getCandidateStore().getCandidate(user.id, id);
  if (!candidate) return Response.json({ error: { code: "NOT_FOUND" } }, { status: 404, headers });
  return Response.json({ shares: await getShareStore().list(user.id, id) }, { headers });
}

export async function POST(request: Request, context: Context): Promise<Response> {
  const crossOrigin = denyCrossOrigin(request);
  if (crossOrigin) return crossOrigin;
  const user = await authenticateRequest();
  if (user instanceof Response) return user;
  const body = CreateBody.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: { code: "INVALID_INPUT" } }, { status: 400, headers });
  const { id } = await context.params;
  const candidate = await getCandidateStore().getCandidate(user.id, id);
  if (!candidate) return Response.json({ error: { code: "NOT_FOUND" } }, { status: 404, headers });
  const analysis = candidate.analyses.find((item) => item.result.metadata.analysisId === body.data.analysisId);
  if (!analysis) return Response.json({ error: { code: "ANALYSIS_NOT_FOUND" } }, { status: 404, headers });
  const report = buildSharedReport(candidate, analysis);
  if (!report) return Response.json({ error: { code: "SOURCE_FILES_REQUIRED" } }, { status: 409, headers });
  const created = await getShareStore().create(user.id, id, body.data.analysisId, report, body.data.expiry);
  if (!created) return Response.json({ error: { code: "ANALYSIS_NOT_AVAILABLE" } }, { status: 409, headers });
  return Response.json({ share: created.share, path: `/shared/${created.token}` }, { status: 201, headers });
}
