import { describe, expect, it, vi } from "vitest";
import { GitHubContributionVerificationProvider } from "./provider-verification";

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status });
}

describe("authenticated provider verification containment", () => {
  it("keeps a unique credential request-local while producing contributor proof", async () => {
    const canary = "ghp_PROVIDER_SECRET_CANARY_never_persist_or_return";
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ id: 42, login: "candidate" }))
      .mockResolvedValueOnce(json({ id: 99, full_name: "candidate/project", owner: { id: 42 } }))
      .mockResolvedValueOnce(json([{ sha: "0123456789abcdef" }]));
    const result = await new GitHubContributionVerificationProvider(fetcher).verify({
      repositoryUrl: "https://github.com/candidate/project",
      credential: canary,
    });

    expect(result.proof).toMatchObject({
      hasAuthenticatedProviderIdentity: true,
      hasRepositoryIdentity: true,
      hasRepositoryOwnershipProof: true,
      immutableContributionRevision: "0123456789abcdef",
    });
    expect(JSON.stringify(result)).not.toContain(canary);
    expect(JSON.stringify(fetcher.mock.calls.map(([url]) => url))).not.toContain(canary);
    for (const call of fetcher.mock.calls) {
      expect((call[1]?.headers as Record<string, string>).authorization).toBe(`Bearer ${canary}`);
    }
  });

  it("does not call the provider or fail the deterministic path without credentials", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const result = await new GitHubContributionVerificationProvider(fetcher).verify({
      repositoryUrl: "https://github.com/candidate/project",
      credential: null,
    });
    expect(fetcher).not.toHaveBeenCalled();
    expect(result.proof.providerConfigured).toBe(false);
    expect(result.proof.immutableContributionRevision).toBeNull();
  });

  it("returns redacted incomplete proof for provider and schema failures", async () => {
    const canary = "ghp_PROVIDER_SECRET_CANARY_failure_path";
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error(`network rejected ${canary}`));
    const result = await new GitHubContributionVerificationProvider(fetcher).verify({
      repositoryUrl: "https://github.com/candidate/project",
      credential: canary,
    });
    expect(result.proof.hasAuthenticatedProviderIdentity).toBe(false);
    expect(JSON.stringify(result)).not.toContain(canary);
  });
});
