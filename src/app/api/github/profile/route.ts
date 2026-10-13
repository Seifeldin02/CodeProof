import { z } from "zod";
import { authenticateRequest, denyCrossOrigin } from "@/features/auth/guard";
import { listProfileRepositories, ProfileListingError } from "@/services/github/profile";
import { logger } from "@/services/observability/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const inputSchema = z.object({ url: z.string().trim().min(4).max(200) }).strict();
const headers = { "Cache-Control": "private, no-store" };

/**
 * Lists the public projects on one GitHub profile for the recruiter to choose from. Recruiter-initiated, like the
 * portfolio scan: the server asks GitHub only when a signed-in recruiter presses the button, and only ever about a
 * profile address. The recruiter still confirms which projects are inspected.
 */
export async function POST(request: Request): Promise<Response> {
  const crossOrigin = denyCrossOrigin(request);
  if (crossOrigin) return crossOrigin;
  const user = await authenticateRequest();
  if (user instanceof Response) return user;

  const input = inputSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    return Response.json({ error: { code: "INVALID_PROFILE", message: "Send a GitHub profile link such as https://github.com/owner." } }, { status: 400, headers });
  }
  try {
    const listing = await listProfileRepositories(input.data.url, { token: process.env.GITHUB_TOKEN ?? null });
    logger.info("profile_projects_listed", { source: listing.source, repositoryCount: listing.repositories.length, more: listing.more });
    return Response.json({ listing: { owner: listing.owner, url: listing.url, repositories: listing.repositories, more: listing.more } }, { headers });
  } catch (error) {
    if (error instanceof ProfileListingError) {
      logger.info("profile_projects_not_listed", { code: error.code });
      return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status, headers });
    }
    return Response.json({ error: { code: "LISTING_UNAVAILABLE", message: "GitHub did not provide the project list right now. Paste the repository links you want to inspect." } }, { status: 503, headers });
  }
}
