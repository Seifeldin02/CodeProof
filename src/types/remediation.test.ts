import { describe, expect, it } from "vitest";
import {
  AccountLifecycleStateSchema,
  AccountRemediationFieldsSchema,
  AccountRoleSchema,
  AiTelemetryRecordSchema,
  AttributionStatusSchema,
  BuildMetadataSchema,
  CandidateConclusionSchema,
  CanonicalAnalysisMetadataSchema,
  CanonicalEvidenceLevelSchema,
  ContextSafeInterviewQuestionSchema,
  DangerousImpersonatedActionCategorySchema,
  DetectorFindingSchema,
  DiscoveryOriginSchema,
  EvidenceCitationSchema,
  ExternalShareWriteSchema,
  ImpersonationGrantSchema,
  PilotTierSchema,
  ReleaseDisclosureSchema,
  ReleaseVerificationSchema,
  RepositoryCorpusMetricsSchema,
  RepositoryRunMetricsSchema,
  RequisitionVersionSchema,
  ReviewOrderSchema,
  SavedComparisonSchema,
  ShareExpiryOptionSchema,
  parseLegacyAccountRemediationFieldsForMigration,
  parseLegacyAttributionStatusForMigration,
  parseLegacyDiscoveryOriginForMigration,
  parseLegacyEvidenceLevelForMigration,
} from "./remediation";

const timestamp = "2025-02-03T04:05:06.000Z";
const digest = "a".repeat(64);

const finding = {
  id: "finding-1",
  detectorId: "detector.typescript",
  detectorVersion: "1.0.0",
  capabilityId: "language.typescript",
  signalClass: "implementation" as const,
  repositoryId: "repository-1",
  revision: "abc123",
  filePath: "src/index.ts",
  symbol: "main",
  startLine: 1,
  endLine: 12,
  excerptStartOffset: 0,
  excerptEndOffset: 120,
};

const citation = {
  id: "citation-1",
  findingId: finding.id,
  detectorId: finding.detectorId,
  detectorVersion: finding.detectorVersion,
  repositoryId: finding.repositoryId,
  repositoryUrl: "https://github.com/example/project",
  repositoryName: "project",
  revision: finding.revision,
  revisionAvailability: "available" as const,
  filePath: finding.filePath,
  symbol: finding.symbol,
  startLine: finding.startLine,
  endLine: finding.endLine,
  excerpt: "export function main() {}",
  sourceLink: "https://github.com/example/project/blob/abc123/src/index.ts#L1-L12",
  discoveryOrigin: "CV" as const,
  attributionStatus: "verified_contributor" as const,
  evidenceLevel: "partial" as const,
  taxonomyVersion: "2025.1",
};

const factor = {
  criterionId: "criterion-1",
  level: "partial" as const,
  citationIds: [citation.id],
};

const uncertainty = {
  criterionId: "criterion-2",
  reason: "evidence_gap" as const,
};

function jsonRoundTrip<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe("canonical remediation enums", () => {
  it("accepts every exact canonical attribution status, origin, and evidence level", () => {
    expect(["unverified", "candidate_claimed", "verified_owner", "verified_contributor"].map(
      (value) => AttributionStatusSchema.parse(value),
    )).toEqual(["unverified", "candidate_claimed", "verified_owner", "verified_contributor"]);
    expect(["CV", "portfolio", "GitHub profile", "manual entry"].map(
      (value) => DiscoveryOriginSchema.parse(value),
    )).toEqual(["CV", "portfolio", "GitHub profile", "manual entry"]);
    expect(["strong", "good", "partial", "limited", "insufficient"].map(
      (value) => CanonicalEvidenceLevelSchema.parse(value),
    )).toEqual(["strong", "good", "partial", "limited", "insufficient"]);
  });

  it("rejects legacy and near-match spellings at canonical write boundaries", () => {
    for (const value of ["unknown_contributor", "unverified_contributor", "Verified_contributor"])
      expect(AttributionStatusSchema.safeParse(value).success).toBe(false);
    for (const value of ["cv_link", "recruiter_entry", "profile_discovery", "git_provider", "cv"])
      expect(DiscoveryOriginSchema.safeParse(value).success).toBe(false);
    for (const value of ["Strong Evidence", "Good Evidence", "Partial Evidence"])
      expect(CanonicalEvidenceLevelSchema.safeParse(value).success).toBe(false);
    expect(AccountRoleSchema.safeParse("admin").success).toBe(false);
    expect(AccountLifecycleStateSchema.safeParse("deleted").success).toBe(false);
    expect(ShareExpiryOptionSchema.safeParse("7 days").success).toBe(false);
  });
});

describe("migration-only adapters", () => {
  it("maps supported legacy values conservatively", () => {
    expect(parseLegacyAttributionStatusForMigration("unknown_contributor")).toBe("unverified");
    expect(parseLegacyAttributionStatusForMigration("candidate_claimed")).toBe("unverified");
    expect(parseLegacyAttributionStatusForMigration("candidate_claimed", {
      hasCandidateSourceClaim: true,
    })).toBe("candidate_claimed");
    expect(parseLegacyAttributionStatusForMigration("verified_contributor", {
      hasAuthenticatedProviderIdentity: true,
      hasRepositoryIdentity: true,
    })).toBe("unverified");
    expect(parseLegacyAttributionStatusForMigration("verified_contributor", {
      hasAuthenticatedProviderIdentity: true,
      hasRepositoryIdentity: true,
      hasImmutableRevision: true,
    })).toBe("verified_contributor");

    expect(parseLegacyDiscoveryOriginForMigration("cv_link")).toEqual({
      origin: "CV",
      originConfirmationRequired: false,
    });
    expect(parseLegacyDiscoveryOriginForMigration("git_provider")).toEqual({
      origin: null,
      originConfirmationRequired: true,
    });
    expect(parseLegacyDiscoveryOriginForMigration("git_provider", "portfolio")).toEqual({
      origin: "portfolio",
      originConfirmationRequired: false,
    });
    expect(parseLegacyEvidenceLevelForMigration("Strong Evidence")).toBe("strong");
  });

  it("defaults missing legacy account extensions without accepting invented values", () => {
    expect(parseLegacyAccountRemediationFieldsForMigration({})).toEqual({
      role: "RECRUITER",
      lifecycleState: "active",
      isDemo: false,
      demoLabel: null,
      companyName: null,
      planTierId: null,
      lastActivityAt: null,
      softDeletedAt: null,
      suspendedAt: null,
    });
    expect(() => parseLegacyAccountRemediationFieldsForMigration({ role: "OWNER" })).toThrow();
    expect(() => parseLegacyEvidenceLevelForMigration("Strong")).toThrow();
  });
});

describe("evidence and analysis contracts", () => {
  it("round-trips strict findings, citations, conclusions, and context-safe questions", () => {
    expect(DetectorFindingSchema.parse(jsonRoundTrip(finding))).toEqual(finding);
    expect(EvidenceCitationSchema.parse(jsonRoundTrip(citation))).toEqual(citation);

    const conclusion = {
      id: "conclusion-1",
      analysisVersionId: "analysis-1",
      capabilityId: "language.typescript",
      evidenceLevel: "partial" as const,
      citationIds: [citation.id],
      eligibility: "eligible" as const,
      explanation: "Grounded TypeScript implementation is visible.",
    };
    expect(CandidateConclusionSchema.parse(jsonRoundTrip(conclusion))).toEqual(conclusion);

    const question = {
      id: "question-1",
      analysisVersionId: "analysis-1",
      basis: { kind: "evidence" as const, citationIds: [citation.id] },
      attributionGate: "verified_contributor" as const,
      question: "How did you structure the typed entry point?",
      redactionApplied: false,
    };
    expect(ContextSafeInterviewQuestionSchema.parse(jsonRoundTrip(question))).toEqual(question);
    expect(ContextSafeInterviewQuestionSchema.safeParse({ ...question, unexpected: true }).success).toBe(false);
  });

  it("round-trips exact repository metrics and versioned analysis metadata", () => {
    const corpusMetrics = {
      rawArchiveEntryCount: 12,
      eligibleTextFileCount: 10,
      selectedFileCount: 5,
      analyzedFileCount: 5,
      downloadedArchiveBytes: 8_000,
      eligibleTextBytes: 7_000,
      selectedTextBytes: 4_000,
      analyzedTextBytes: 4_000,
      excludedByReason: { generated: { files: 2, bytes: 1_000 } },
      limits: { selectedFiles: 20, selectedBytes: 100_000 },
    };
    expect(RepositoryCorpusMetricsSchema.parse(jsonRoundTrip(corpusMetrics))).toEqual(corpusMetrics);

    const runMetrics = {
      state: "completed" as const,
      selectedRepositoryCount: 2,
      successfulRepositoryCount: 1,
      failedRepositoryCount: 1,
      pendingRepositoryCount: 0,
      attributionCounts: {
        unverified: 1,
        candidate_claimed: 0,
        verified_owner: 0,
        verified_contributor: 1,
      },
    };
    expect(RepositoryRunMetricsSchema.parse(jsonRoundTrip(runMetrics))).toEqual(runMetrics);

    const metadata = {
      analysisVersionId: "analysis-1",
      analyzedAt: timestamp,
      deterministicEngineVersion: "engine.v2",
      taxonomyVersion: "taxonomy.v1",
      requisitionVersionId: "requisition-version-1",
      aiRequestSchemaVersion: null,
      providerId: null,
      modelId: null,
      promptVersion: null,
      pricingVersion: null,
      isDemo: false,
    };
    expect(CanonicalAnalysisMetadataSchema.parse(jsonRoundTrip(metadata))).toEqual(metadata);
  });
});

describe("requisition and review contracts", () => {
  it("parses immutable requisition versions and round-trips requisition-bound results", () => {
    const requisition = RequisitionVersionSchema.parse({
      id: "requisition-version-1",
      ownerUserId: "owner-1",
      requisitionId: "requisition-1",
      version: 1,
      criteria: [{ id: "criterion-1", capabilityId: "language.typescript", importance: "required" }],
      contentHash: digest,
      createdAt: timestamp,
    });
    expect(Object.isFrozen(requisition)).toBe(true);
    expect(Object.isFrozen(requisition.criteria)).toBe(true);
    expect(Object.isFrozen(requisition.criteria[0])).toBe(true);

    const candidateResult = {
      candidateId: "candidate-1",
      analysisVersionId: "analysis-1",
      factors: [factor],
      uncertainties: [uncertainty],
    };
    const comparison = {
      id: "comparison-1",
      ownerUserId: "owner-1",
      requisitionVersionId: requisition.id,
      candidateAnalysisVersionIds: [candidateResult.analysisVersionId],
      result: { candidates: [candidateResult] },
      createdAt: timestamp,
    };
    expect(SavedComparisonSchema.parse(jsonRoundTrip(comparison))).toEqual(comparison);

    const reviewOrder = {
      id: "review-order-1",
      ownerUserId: "owner-1",
      requisitionVersionId: requisition.id,
      status: "draft" as const,
      entries: [{ ...candidateResult, stableTieBreakKey: "0001:candidate-1" }],
      createdAt: timestamp,
    };
    expect(ReviewOrderSchema.parse(jsonRoundTrip(reviewOrder))).toEqual(reviewOrder);
  });
});

describe("sharing, AI telemetry, and pilot access contracts", () => {
  it("round-trips digest-only shares and rejects plaintext token fields", () => {
    const share = {
      id: "share-1",
      ownerUserId: "owner-1",
      candidateId: "candidate-1",
      analysisVersionId: "analysis-1",
      tokenDigest: digest,
      expiryOption: "7d" as const,
      expiresAt: timestamp,
      revokedAt: null,
      passcodeRequired: false,
      passcodeDigest: null,
      emailVerificationRequired: false,
      emailAddressDigest: null,
      isDemo: false,
      createdAt: timestamp,
    };
    expect(ExternalShareWriteSchema.parse(jsonRoundTrip(share))).toEqual(share);
    expect(ExternalShareWriteSchema.safeParse({ ...share, token: "plaintext-secret" }).success).toBe(false);
  });

  it("round-trips AI telemetry without treating unavailable actual cost as zero", () => {
    const telemetry = {
      id: "telemetry-1",
      ownerUserId: "owner-1",
      operation: "analysis_enrichment",
      providerId: null,
      modelId: null,
      status: "fallback" as const,
      fallbackReason: "provider_not_configured",
      latencyMs: 4,
      cacheStatus: "not_applicable" as const,
      attemptCount: 0,
      inputUnits: null,
      cachedInputUnits: null,
      outputUnits: null,
      estimatedCostMicros: null,
      actualCostMicros: null,
      actualCostStatus: "unavailable" as const,
      currency: null,
      pricingVersion: null,
      schemaVersion: "ai.v1",
      promptVersion: "prompt.v1",
      taxonomyVersion: "taxonomy.v1",
      isDemo: false,
      createdAt: timestamp,
    };
    expect(AiTelemetryRecordSchema.parse(jsonRoundTrip(telemetry))).toEqual(telemetry);
    expect(AiTelemetryRecordSchema.safeParse({ ...telemetry, actualCostMicros: 0 }).success).toBe(false);
  });

  it("round-trips a versioned bilingual pilot tier with named quotas", () => {
    const tier = {
      id: "pilot_core",
      version: "2025.1",
      displayName: { en: "Pilot Core", ar: "الباقة التجريبية الأساسية" },
      entitlements: [{ id: "external_sharing", enabled: true }],
      quotas: [{
        kind: "repository_analyses" as const,
        limit: 25,
        usagePeriod: { id: "2025-02", startsAt: timestamp, endsAt: "2025-03-03T04:05:06.000Z" },
      }],
    };
    expect(PilotTierSchema.parse(jsonRoundTrip(tier))).toEqual(tier);
  });
});

describe("administration, impersonation, and release contracts", () => {
  it("accepts approved account/demo fields and every dangerous impersonation category", () => {
    const account = {
      role: "ADMIN" as const,
      lifecycleState: "active" as const,
      isDemo: true,
      demoLabel: "Training workspace",
      companyName: "Example Company",
      planTierId: "pilot_team",
      lastActivityAt: timestamp,
      softDeletedAt: null,
      suspendedAt: null,
    };
    expect(AccountRemediationFieldsSchema.parse(jsonRoundTrip(account))).toEqual(account);
    expect(DangerousImpersonatedActionCategorySchema.parse("secret_disclosure")).toBe("secret_disclosure");
  });

  it("enforces the one-hour maximum on versioned impersonation grants", () => {
    const grant = {
      purpose: "impersonation.v1" as const,
      grantId: "grant-1",
      adminActorUserId: "admin-1",
      targetUserId: "owner-1",
      reason: "Reproduce a reported display issue",
      startedAt: 1_738_555_506_000,
      expiresAt: 1_738_556_406_000,
      auditEntryId: "audit-1",
    };
    expect(ImpersonationGrantSchema.parse(jsonRoundTrip(grant))).toEqual(grant);
    expect(ImpersonationGrantSchema.safeParse({
      ...grant,
      expiresAt: grant.startedAt + (61 * 60 * 1_000),
    }).success).toBe(false);
  });

  it("round-trips build metadata, release checks, and honest disclosure states", () => {
    const buildMetadata = {
      commitSha: "abc123",
      buildId: "build-1",
      environment: "preview",
      releaseTimestamp: timestamp,
      verificationTimestamp: timestamp,
    };
    expect(BuildMetadataSchema.parse(jsonRoundTrip(buildMetadata))).toEqual(buildMetadata);

    const check = {
      id: "typecheck" as const,
      command: "npm run typecheck",
      outcome: "passed" as const,
      previouslyPassing: true,
      detail: null,
    };
    const verification = {
      id: "verification-1",
      target: "vercel_preview" as const,
      deploymentUrl: "https://example.vercel.app",
      buildMetadata,
      verifiedAt: timestamp,
      checks: [check],
    };
    expect(ReleaseVerificationSchema.parse(jsonRoundTrip(verification))).toEqual(verification);

    const disclosure = {
      id: "disclosure-1",
      releaseCommitHash: "abc123",
      generatedAt: timestamp,
      items: [{
        id: "check-live-provider",
        kind: "live_check" as const,
        status: "externally_unverifiable" as const,
        affectedScope: "Live provider execution",
        reason: "Credential unavailable",
        userImpact: "Deterministic fallback remains available",
        evidence: ["Mocked provider contract passed separately"],
        nextAction: "Configure the provider credential and rerun",
      }],
      modifiedFiles: ["src/types/remediation.ts"],
      baselineEvidenceIds: ["baseline-1"],
      postRemediationEvidenceIds: ["verification-1"],
      demoReadinessVerdict: {
        status: "not_ready" as const,
        statement: "Live verification remains outstanding.",
        remainingRisks: ["Provider path is not live-verified"],
        knownLimitations: ["No configured provider credential"],
      },
    };
    expect(ReleaseDisclosureSchema.parse(jsonRoundTrip(disclosure))).toEqual(disclosure);
  });
});
