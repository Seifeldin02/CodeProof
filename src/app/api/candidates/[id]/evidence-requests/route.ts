import { authenticateRequest, denyCrossOrigin } from "@/features/auth/guard";
import { getCandidateStore } from "@/features/candidates/store";
import { openEvidenceRequest } from "@/features/evidence-requests/service";
import { getEvidenceRequestStore } from "@/features/evidence-requests/store";
import { isLocale } from "@/i18n/translations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const user = await authenticateRequest();
  if (user instanceof Response) return user;
  const { id } = await context.params;
  if (!(await getCandidateStore().getCandidate(user.id, id))) {
    return Response.json({ error: { code: "NOT_FOUND", message: "Candidate not found." } }, { status: 404 });
  }
  return Response.json({ requests: await getEvidenceRequestStore().listForCandidate(user.id, id) }, { headers: NO_STORE });
}

/**
 * Opens a request and returns its link once. Only a digest of the token is
 * stored, so the link cannot be shown again; a new request replaces it.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const crossOrigin = denyCrossOrigin(request);
  if (crossOrigin) return crossOrigin;
  const user = await authenticateRequest();
  if (user instanceof Response) return user;

  let locale: unknown;
  try {
    locale = ((await request.json()) as { locale?: unknown }).locale;
  } catch {
    locale = undefined;
  }
  if (typeof locale !== "string" || !isLocale(locale)) {
    return Response.json({ error: { code: "INVALID_INPUT", message: "Choose the language for the candidate's page." } }, { status: 400 });
  }

  const { id } = await context.params;
  if (!(await getCandidateStore().getCandidate(user.id, id))) {
    return Response.json({ error: { code: "NOT_FOUND", message: "Candidate not found." } }, { status: 404 });
  }
  const opened = await openEvidenceRequest(user.id, id, locale);
  return Response.json(
    { request: opened.request, path: `/evidence/${opened.token}?lang=${locale}` },
    { status: 201, headers: NO_STORE },
  );
}
