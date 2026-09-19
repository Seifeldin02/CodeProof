import { z } from "zod";
import { authenticateRequest, denyCrossOrigin } from "@/features/auth/guard";
import { classifyDiscoveredSource } from "@/features/resume-matching/discovery";
import { fetchPortfolioPage, PortfolioFetchError } from "@/services/portfolio/fetch";
import { readPortfolio } from "@/services/portfolio/extract";
import { logger } from "@/services/observability/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const inputSchema = z.object({ url: z.string().trim().min(4).max(500) }).strict();

/**
 * Reads one candidate portfolio page and reports the repositories and claims on
 * it. Recruiter-initiated by design: the server only fetches a candidate-supplied
 * URL when a signed-in recruiter asks it to, which keeps the request surface
 * consistent with the rest of the confirm-then-analyze flow.
 */
export async function POST(request: Request): Promise<Response> {
  const crossOrigin = denyCrossOrigin(request);
  if (crossOrigin) return crossOrigin;
  const user = await authenticateRequest();
  if (user instanceof Response) return user;

  try {
    const { url } = inputSchema.parse(await request.json());
    // Reuse the CV classifier so the same hosts are refused here: GitHub has a
    // real ingestion path, and social links are not work samples.
    const source = classifyDiscoveredSource(url);
    if (!source) {
      return Response.json(
        { error: { code: "NOT_A_PORTFOLIO", message: "Only portfolio or non-GitHub project links can be scanned." } },
        { status: 400 },
      );
    }

    const { finalUrl, html } = await fetchPortfolioPage(source.url);
    const scan = readPortfolio(finalUrl, html);
    logger.info("portfolio_scanned", {
      host: source.host,
      repositoryCount: scan.repositories.length,
      claimCount: scan.claims.length,
    });
    return Response.json({ scan }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof PortfolioFetchError) {
      return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    }
    if (error instanceof z.ZodError) {
      return Response.json({ error: { code: "INVALID_INPUT", message: "Send a portfolio URL to scan." } }, { status: 400 });
    }
    return Response.json({ error: { code: "SCAN_FAILED", message: "The portfolio could not be scanned." } }, { status: 500 });
  }
}
