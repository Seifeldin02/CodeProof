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

function canonicalResult(suffix = "1"): AnalysisResult {
  const analysis = result(["Good Evidence"]);
  analysis.metadata = {
    analysisId: `canonical-analysis-${suffix}`,
    analyzedAt: "2026-01-01T00:00:00.000Z",
    durationMs: 1,
    selectedFileCount: 1,
    inspectedTreeFileCount: 1,
    selectedBytes: 20,
    cacheHit: false,
    cacheStorage: "disabled",
    engineVersion: "test-engine",
    aiProvider: null,
    aiModel: null,
    aiStatus: "unavailable_not_configured",
    aiUnavailableReason: "test fixture",
    warnings: [],
    corpusMetrics: {
      rawArchiveEntryCount: 2,
      eligibleTextFileCount: 1,
      selectedFileCount: 1,
      analyzedFileCount: 1,
      downloadedArchiveBytes: 200,
      eligibleTextBytes: 20,
      selectedTextBytes: 20,
      analyzedTextBytes: 20,
      excludedByReason: { generated_vendor_or_binary: { files: 1, bytes: 180 } },
      limits: { selectedFiles: 32, selectedBytes: 600_000 },
    },
  };
  analysis.canonicalEvidence = {
    taxonomyVersion: "2025.1",
    findings: [{
      id: `finding-${suffix}`, detectorId: "detector-1", detectorVersion: "1.0.0",
      capabilityId: "language.typescript", signalClass: "implementation",
      repositoryId: "repository-1", revision: null, filePath: "src/app.ts",
      symbol: "run", startLine: 1, endLine: 1, excerptStartOffset: 0, excerptEndOffset: 20,
    }],
    citations: [{
      id: `citation-${suffix}`, findingId: `finding-${suffix}`, detectorId: "detector-1", detectorVersion: "1.0.0",
      repositoryId: "repository-1", repositoryUrl: analysis.repository.url, repositoryName: "example/app",
      revision: null, revisionAvailability: "unavailable", filePath: "src/app.ts", symbol: "run",
      startLine: 1, endLine: 1, excerpt: "export function run()", sourceLink: "https://github.com/example/app/blob/HEAD/src/app.ts#L1-L1",
      discoveryOrigin: "manual entry", attributionStatus: "unverified", evidenceLevel: "good", taxonomyVersion: "2025.1",
    }],
    interviewQuestions: [{
      id: `question-${suffix}`, analysisVersionId: `canonical-analysis-${suffix}`,
      basis: { kind: "evidence", citationIds: [`citation-${suffix}`] }, attributionGate: "unverified",
      question: "To verify your relationship to this repository, explain run.", redactionApplied: true,
    }],
  };
  return analysis;
}

describe("candidate evidence persistence", () => {
  it("does not record code review for a CV-only intake", async () => {
    const store = new CandidateStore(":memory:");
    seedOwners(store);
    const candidate = await store.createCandidate("owner-a", {
      name: "CV-only candidate", role: "Backend Engineer", results: [], initialStage: "screening",
    });
    expect(candidate.furthestStage).toBe("screening");
    expect(candidate.stageHistory.map((event) => event.stage)).toEqual(["applied", "screening"]);
    expect(candidate.analyses).toEqual([]);
    store.db.close();
  });
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
    expect(verified?.verifiedSkillScore).toBe(0);
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

  it("persists canonical findings, citations, and safe questions and reprojects them after verification", async () => {
    const store = new CandidateStore(":memory:");
    seedOwners(store);
    const created = await store.createCandidate("owner-a", {
      name: "Canonical Candidate",
      role: "Backend Engineer",
      results: [canonicalResult()],
      repositorySelections: [{
        repositoryUrl: "https://github.com/example/app",
        discoveryOrigin: "CV",
        candidateSourceClaim: true,
      }],
    });
    expect(store.db.prepare("SELECT COUNT(*) AS count FROM analysis_versions").get()).toMatchObject({ count: 1 });
    expect(store.db.prepare("SELECT COUNT(*) AS count FROM detector_findings").get()).toMatchObject({ count: 1 });
    expect(store.db.prepare("SELECT COUNT(*) AS count FROM repository_corpus_metrics").get()).toMatchObject({ count: 1 });
    expect(store.db.prepare("SELECT selected_repository_count, successful_repository_count, failed_repository_count, pending_repository_count FROM repository_run_metrics").get()).toEqual({
      selected_repository_count: 1,
      successful_repository_count: 1,
      failed_repository_count: 0,
      pending_repository_count: 0,
    });
    expect(store.db.prepare("SELECT attribution_status, discovery_origin FROM evidence_citations").get()).toEqual({
      attribution_status: "candidate_claimed",
      discovery_origin: "CV",
    });
    expect(store.db.prepare("SELECT attribution_gate, question FROM interview_questions").get()).toMatchObject({
      attribution_gate: "candidate_claimed",
      question: expect.stringMatching(/^To verify your relationship/u),
    });

    await store.verifyRepositoryAttribution("owner-a", created.id, "https://github.com/example/app", {
      provider: "github",
      repositoryProviderId: "repository-42",
      providerIdentityFingerprint: "b".repeat(64),
      verifiedAt: "2026-01-02T00:00:00.000Z",
      proof: {
        providerConfigured: true,
        hasAuthenticatedProviderIdentity: true,
        hasRepositoryIdentity: true,
        hasRepositoryOwnershipProof: false,
        immutableContributionRevision: "abcdef0123456789",
      },
    });
    expect(store.db.prepare("SELECT attribution_status FROM evidence_citations WHERE id = 'citation-1'").get()).toEqual({
      attribution_status: "candidate_claimed",
    });
    expect(store.db.prepare("SELECT attribution_gate, question FROM interview_questions WHERE id = 'question-1'").get()).toMatchObject({
      attribution_gate: "candidate_claimed",
      question: expect.stringMatching(/^To verify your relationship/u),
    });
    const reanalyzed = await store.recordRepositorySuccess("owner-a", created.id, canonicalResult("2"));
    expect(reanalyzed?.verifiedSkillScore).toBe(75);
    expect(store.db.prepare("SELECT COUNT(*) AS count FROM analysis_versions").get()).toMatchObject({ count: 2 });
    expect(store.db.prepare("SELECT attribution_status FROM evidence_citations WHERE id = 'citation-2'").get()).toEqual({
      attribution_status: "verified_contributor",
    });
    expect(store.db.prepare("SELECT attribution_gate, question FROM interview_questions WHERE id = 'question-2'").get()).toMatchObject({
      attribution_gate: "verified_contributor",
      question: expect.not.stringMatching(/^To verify your relationship/u),
    });
    store.db.close();
  });
});
