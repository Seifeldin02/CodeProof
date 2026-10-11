import { denyCrossOrigin } from "@/features/auth/guard";
import { evidenceAnswerRateLimited } from "@/features/evidence-requests/rate-limit";
import { answerEvidenceRequest, type EvidenceAnswerFailure } from "@/features/evidence-requests/service";
import { logger } from "@/services/observability/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS: Record<EvidenceAnswerFailure, number> = {
  UNAVAILABLE: 404,
  INVALID_INPUT: 400,
  CONSENT_REQUIRED: 400,
  NOTHING_SHARED: 400,
  INVALID_REPOSITORY: 400,
  INVALID_LINK: 400,
  INVALID_GIST_URL: 400,
  GIST_UNAVAILABLE: 422,
  CODE_NOT_FOUND: 422,
};

const MESSAGE: Record<EvidenceAnswerFailure, string> = {
  UNAVAILABLE: "This link is no longer available.",
  INVALID_INPUT: "The answer could not be read. Check the form and try again.",
  CONSENT_REQUIRED: "Tick the box to agree before sending.",
  NOTHING_SHARED: "Add at least one link, or tell the hiring team that your work is confidential.",
  INVALID_REPOSITORY: "One repository link is not a GitHub repository. Use a link such as https://github.com/owner/repository.",
  INVALID_LINK: "One of the other links is not a valid web address.",
  INVALID_GIST_URL: "The gist link should look like https://gist.github.com/your-name/abc123.",
  GIST_UNAVAILABLE: "The gist could not be read. Make sure it is public, then try again.",
  CODE_NOT_FOUND: "The gist does not contain your code yet. Paste the code into the gist, save it, then try again.",
};

/**
 * The candidate's answer. There is no session here: the link's token is the
 * only credential, and every unusable link gets the same response, so the
 * endpoint does not reveal whether a token ever existed.
 */
export async function POST(request: Request, context: { params: Promise<{ token: string }> }): Promise<Response> {
  const crossOrigin = denyCrossOrigin(request);
  if (crossOrigin) return crossOrigin;
  const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" };
  if (evidenceAnswerRateLimited(request)) {
    return Response.json({ error: { code: "RATE_LIMITED", message: "Too many attempts. Try again later." } }, { status: 429, headers });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: { code: "INVALID_INPUT", message: MESSAGE.INVALID_INPUT } }, { status: 400, headers });
  }

  const { token } = await context.params;
  const result = await answerEvidenceRequest(token, payload);
  if (result.ok) {
    logger.info("evidence_request_answered", {});
    return Response.json({ received: true }, { status: 201, headers });
  }
  return Response.json({ error: { code: result.code, message: MESSAGE[result.code] } }, { status: STATUS[result.code], headers });
}
