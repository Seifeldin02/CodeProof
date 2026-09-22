import { describe, expect, it } from "vitest";
import type { AnalysisResult } from "@/types/analysis";
import { calculateEvidenceIndex, CandidateStore } from "./store";

function result(levels: AnalysisResult["skills"][number]["level"][], repositoryUrl = "https://github.com/example/app"): AnalysisResult {
  const [owner, name] = repositoryUrl.split("/").slice(-2);
  return {
    repository: { owner, name, url: repositoryUrl },
    languages: { TypeScript: 500 },
    projectType: "Backend API",
    skills: levels.map((level, index) => ({ skill: `Skill ${index}`, level })),
    strengths: [],
    resumeVerification: null,
    metadata: { analyzedAt: "2026-01-01T00:00:00.000Z" },
  } as unknown as AnalysisResult;
}

function seedOwners(store: CandidateStore): void {
  const insert = store.db.prepare("INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)");
  insert.run("owner-a", "owner-a@example.invalid", "test-hash-a", "2026-01-01T00:00:00.000Z");
  insert.run("owner-b", "owner-b@example.invalid", "test-hash-b", "2026-01-01T00:00:00.000Z");
}

describe("candidate evidence persistence", () => {
  it("computes a transparent weighted evidence index", () => {
    expect(calculateEvidenceIndex([result(["Strong Evidence", "Good Evidence", "Limited Evidence"])] )).toBe(67);
    expect(calculateEvidenceIndex([result([])])).toBe(0);
  });

  it("starts with an empty candidate database", async () => {
    const store = new CandidateStore(":memory:");
    expect(await store.listCandidates("owner-a")).toEqual([]);
    store.db.close();
  });

  it("persists account-scoped repository outcomes and supports pipeline updates", async () => {
    const store = new CandidateStore(":memory:");
    seedOwners(store);
    const created = await store.createCandidate("owner-a", {
      name: "Candidate",
      role: "Backend Engineer",
      results: [result(["Good Evidence"])],
      failures: [{ repositoryUrl: "https://github.com/example/broken", code: "MALFORMED_ARCHIVE", message: "The repository archive is malformed." }],
      repositorySelections: [
        { repositoryUrl: "https://github.com/example/app", discoveryOrigin: "CV", candidateSourceClaim: true },
        { repositoryUrl: "https://github.com/example/broken", discoveryOrigin: "manual entry", candidateSourceClaim: false },
      ],
    });
    expect(created.repositoryCount).toBe(2);
    expect(created.repositoryOutcomes.map((outcome) => outcome.status).sort()).toEqual(["analyzed", "failed"]);
    expect(created.repositoryOutcomes.find((outcome) => outcome.status === "failed")).toMatchObject({ code: "MALFORMED_ARCHIVE", message: "The repository archive is malformed." });
    expect(created.repositories).toEqual(expect.arrayContaining([
      expect.objectContaining({ repositoryUrl: "https://github.com/example/app", discoveryOrigin: "CV", attributionStatus: "candidate_claimed" }),
      expect.objectContaining({ repositoryUrl: "https://github.com/example/broken", discoveryOrigin: "manual entry", attributionStatus: "unverified" }),
    ]));
    expect(created.verifiedSkillScore).toBe(0);
    expect(created.verifiedClaimCount).toBe(0);
    expect(created.analyses[0]).toMatchObject({
      evidenceIndex: 75,
      result: expect.objectContaining({ projectType: "Backend API" }),
      remediation: expect.objectContaining({
        legacyMarker: "legacy",
        recomputeRequired: true,
        legacyAggregates: { evidenceIndex: 75, verifiedClaimCount: null },
      }),
    });
    expect(created.analyses[0]?.remediation?.quarantinedConclusions).toEqual([
      expect.objectContaining({
        claim: "Skill 0",
        evidenceLevel: "good",
        eligibility: "unsupported",
        quarantineReason: "missing_verified_contributor_grounding",
      }),
    ]);

    expect(await store.getCandidate("owner-b", created.id)).toBeNull();
    expect(await store.listCandidates("owner-b")).toEqual([]);

    const verified = await store.verifyRepositoryAttribution("owner-a", created.id, "https://github.com/example/app", {
      provider: "github",
      repositoryProviderId: "repository-42",
      providerIdentityFingerprint: "a".repeat(64),
      verifiedAt: "2026-01-02T00:00:00.000Z",
      proof: {
        providerConfigured: true,
        hasAuthenticatedProviderIdentity: true,
        hasRepositoryIdentity: true,
        hasRepositoryOwnershipProof: false,
        immutableContributionRevision: "0123456789abcdef",
      },
    });
    expect(verified?.repositories.find((repository) => repository.repositoryUrl.endsWith("/app"))).toMatchObject({
      attributionStatus: "verified_contributor",
      verificationRevision: "0123456789abcdef",
    });
    expect(verified?.verifiedSkillScore).toBe(75);
    expect(await store.verifyRepositoryAttribution("owner-b", created.id, "https://github.com/example/app", {
      provider: "github",
      repositoryProviderId: null,
      providerIdentityFingerprint: null,
      verifiedAt: "2026-01-02T00:00:00.000Z",
      proof: {
        providerConfigured: false,
        hasAuthenticatedProviderIdentity: false,
        hasRepositoryIdentity: false,
        hasRepositoryOwnershipProof: false,
        immutableContributionRevision: null,
      },
    })).toBeNull();

    const retried = await store.recordRepositorySuccess("owner-a", created.id, result(["Strong Evidence"], "https://github.com/example/broken"));
    expect(retried?.repositoryOutcomes.every((outcome) => outcome.status === "analyzed")).toBe(true);
    expect(retried?.analyses).toHaveLength(2);

    const another = await store.createCandidate("owner-b", {
      name: "Another Candidate",
      role: "Backend Engineer",
      results: [result(["Limited Evidence"])],
      failures: [{ repositoryUrl: "https://github.com/example/remove-me", code: "EMPTY_REPOSITORY", message: "The repository is empty." }],
    });
    expect(await store.removeFailedRepository("owner-a", another.id, "https://github.com/example/remove-me")).toBe(false);
    expect(await store.removeFailedRepository("owner-b", another.id, "https://github.com/example/remove-me")).toBe(true);
    expect((await store.getCandidate("owner-b", another.id))?.repositoryOutcomes).toHaveLength(1);

    expect(retried?.evidenceReviewedAt).toBeNull();
    expect(await store.setEvidenceReviewed("owner-b", created.id, true)).toBeNull();
    const checked = await store.setEvidenceReviewed("owner-a", created.id, true);
    expect(typeof checked?.evidenceReviewedAt).toBe("string");
    const reanalyzed = await store.recordRepositorySuccess("owner-a", created.id, result(["Good Evidence"], "https://github.com/example/fresh"));
    expect(reanalyzed?.evidenceReviewedAt).toBeNull();

    const hired = await store.updatePipeline("owner-a", created.id, "hired", "in_progress");
    expect(hired).toMatchObject({ furthestStage: "hired", outcome: "hired" });
    expect(hired?.stageHistory.map((event) => event.stage)).toEqual(["applied", "screening", "code_review", "interview", "offer", "hired"]);
    expect(await store.deleteCandidate("owner-b", created.id)).toBe(false);
    expect(await store.deleteCandidate("owner-a", created.id)).toBe(true);
    expect(await store.getCandidate("owner-a", created.id)).toBeNull();
    store.db.close();
  });
});
