import { z } from "zod";
import { authenticateRequest, denyCrossOrigin } from "@/features/auth/guard";
import { getCandidateStore } from "@/features/candidates/store";
import { GitHubContributionVerificationProvider } from "@/features/repository-analysis/provider-verification";
import { parseGitHubRepositoryUrl } from "@/services/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const InputSchema = z.object({ repositoryUrl: z.string().trim().min(1).max(500) }).strict();

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const crossOrigin = denyCrossOrigin(request);
  if (crossOrigin) return crossOrigin;
  const user = await authenticateRequest();
  if (user instanceof Response) return user;

  try {
    const { id } = await context.params;
    const { repositoryUrl: rawRepositoryUrl } = InputSchema.parse(await request.json());
    const repositoryUrl = parseGitHubRepositoryUrl(rawRepositoryUrl).canonicalUrl;
    const store = getCandidateStore();
    const candidate = await store.getCandidate(user.id, id);
    if (!candidate?.repositories.some((repository) => repository.repositoryUrl === repositoryUrl)) {
      return Response.json({ error: { code: "RESOURCE_UNAVAILABLE" } }, { status: 404 });
    }

    const verification = await new GitHubContributionVerificationProvider().verify({
      repositoryUrl,
      credential: process.env.GITHUB_TOKEN?.trim() || null,
    });
    const updated = await store.verifyRepositoryAttribution(user.id, id, repositoryUrl, verification);
    if (!updated) return Response.json({ error: { code: "RESOURCE_UNAVAILABLE" } }, { status: 404 });
    const relationship = updated.repositories.find((repository) => repository.repositoryUrl === repositoryUrl);
    return Response.json({
      repository: relationship,
      verification: {
        providerConfigured: verification.proof.providerConfigured,
        outcome: verification.proof.immutableContributionRevision
          ? "verified_contributor"
          : verification.proof.hasRepositoryOwnershipProof
            ? "verified_owner"
            : "incomplete",
      },
    }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: { code: "INVALID_INPUT", message: "Send one public repository URL." } }, { status: 400 });
    }
    return Response.json({ error: { code: "VERIFICATION_UNAVAILABLE", message: "Contribution verification is unavailable." } }, { status: 503 });
  }
}
