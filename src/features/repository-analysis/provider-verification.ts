import { createHash } from "node:crypto";
import { z } from "zod";
import { parseGitHubRepositoryUrl } from "@/services/github";
import type { ProviderVerificationProof } from "./attribution-transitions";

const GitHubIdentitySchema = z.object({
  id: z.union([z.number().int().positive(), z.string().min(1)]),
  login: z.string().min(1),
}).passthrough();

const GitHubRepositorySchema = z.object({
  id: z.union([z.number().int().positive(), z.string().min(1)]),
  full_name: z.string().min(1),
  owner: z.object({ id: z.union([z.number().int().positive(), z.string().min(1)]) }).passthrough(),
}).passthrough();

const GitHubCommitSchema = z.object({ sha: z.string().min(7).max(200) }).passthrough();

type FetchLike = typeof fetch;

export interface ContributionVerificationRequest {
  readonly repositoryUrl: string;
  readonly credential: string | null;
  /** Account control established by this candidate's owner-scoped evidence response. */
  readonly confirmedCandidateLogins: readonly string[];
}

export interface ContributionVerificationResult {
  readonly provider: "github";
  readonly repositoryProviderId: string | null;
  readonly providerIdentityFingerprint: string | null;
  readonly verifiedAt: string;
  readonly proof: ProviderVerificationProof;
}

export interface ContributionVerificationProvider {
  verify(request: ContributionVerificationRequest): Promise<ContributionVerificationResult>;
}

function identityFingerprint(providerId: string): string {
  return createHash("sha256").update(`github:${providerId}`, "utf8").digest("hex");
}

/**
 * Request-local authenticated GitHub proof. The credential is sent only in
 * request headers and is never included in the result, an exception, or logs.
 */
export class GitHubContributionVerificationProvider implements ContributionVerificationProvider {
  constructor(private readonly fetcher: FetchLike = fetch) {}

  async verify(request: ContributionVerificationRequest): Promise<ContributionVerificationResult> {
    const verifiedAt = new Date().toISOString();
    const credential = request.credential?.trim() || null;
    if (!credential) return incompleteResult(verifiedAt, false);
    if (request.confirmedCandidateLogins.length === 0) return incompleteResult(verifiedAt, true);

    const repository = parseGitHubRepositoryUrl(request.repositoryUrl);
    const headers = {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${credential}`,
      "user-agent": "CodeProof/1.0",
      "x-github-api-version": "2022-11-28",
    };

    try {
      const identityResponse = await this.fetcher("https://api.github.com/user", {
        headers,
        signal: AbortSignal.timeout(10_000),
      });
      if (!identityResponse.ok) return incompleteResult(verifiedAt, true);
      const identity = GitHubIdentitySchema.parse(await identityResponse.json());
      // A workspace/operator credential is not a candidate identity. Its proof
      // can only be used when the candidate already demonstrated account control.
      if (!request.confirmedCandidateLogins.some((login) => login.toLowerCase() === identity.login.toLowerCase())) {
        return incompleteResult(verifiedAt, true);
      }

      const repositoryResponse = await this.fetcher(
        `https://api.github.com/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repository)}`,
        { headers, signal: AbortSignal.timeout(10_000) },
      );
      if (!repositoryResponse.ok) return incompleteResult(verifiedAt, true, identityFingerprint(String(identity.id)));
      const providerRepository = GitHubRepositorySchema.parse(await repositoryResponse.json());
      if (providerRepository.full_name.toLowerCase() !== `${repository.owner}/${repository.repository}`.toLowerCase()) {
        return incompleteResult(verifiedAt, true, identityFingerprint(String(identity.id)));
      }

      const commitsResponse = await this.fetcher(
        `https://api.github.com/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repository)}/commits?author=${encodeURIComponent(identity.login)}&per_page=1`,
        { headers, signal: AbortSignal.timeout(10_000) },
      );
      const commits = commitsResponse.ok
        ? z.array(GitHubCommitSchema).parse(await commitsResponse.json())
        : [];
      const immutableContributionRevision = commits[0]?.sha ?? null;
      return {
        provider: "github",
        repositoryProviderId: String(providerRepository.id),
        providerIdentityFingerprint: identityFingerprint(String(identity.id)),
        verifiedAt,
        proof: {
          providerConfigured: true,
          hasAuthenticatedProviderIdentity: true,
          hasRepositoryIdentity: true,
          hasRepositoryOwnershipProof: String(providerRepository.owner.id) === String(identity.id),
          immutableContributionRevision,
        },
      };
    } catch {
      return incompleteResult(verifiedAt, true);
    }
  }
}

function incompleteResult(
  verifiedAt: string,
  providerConfigured: boolean,
  providerIdentityFingerprint: string | null = null,
): ContributionVerificationResult {
  return {
    provider: "github",
    repositoryProviderId: null,
    providerIdentityFingerprint,
    verifiedAt,
    proof: {
      providerConfigured,
      hasAuthenticatedProviderIdentity: false,
      hasRepositoryIdentity: false,
      hasRepositoryOwnershipProof: false,
      immutableContributionRevision: null,
    },
  };
}
