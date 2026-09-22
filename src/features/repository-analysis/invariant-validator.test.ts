import { describe, expect, it } from "vitest";
import type {
  CanonicalAnalysisBundle,
  CanonicalInvariantErrorCode,
  EvidenceSurfaceProjection,
  EvidenceThresholdFacts,
} from "./invariant-validator";
import { validateCanonicalAnalysisBundle } from "./invariant-validator";

const REPOSITORY_URL = "https://github.com/example/canonical";
const REVISION = "abc123def456";
const SOURCE = [
  "export function canonicalValue(input: string): string {",
  "  return input.trim();",
  "}",
].join("\n");
const EXCERPT = SOURCE.split("\n").slice(0, 2).join("\n");

const STRONG_FACTS: EvidenceThresholdFacts = {
  meaningfulImplementationFileCount: 3,
  implementationAreaCount: 2,
  hasTestEvidence: true,
  architecturalBoundaryCount: 1,
  repeatedNonTrivialUseAcrossModules: true,
  narrowTestBackedUse: true,
};

function validBundle(): CanonicalAnalysisBundle {
  return {
    sourceKind: "canonical",
    analysis: {
      versionId: "analysis-v1",
      candidateId: "candidate-1",
      taxonomyVersion: "2025.1",
    },
    findings: [{
      id: "finding-1",
      detectorId: "language.typescript.syntax",
      detectorVersion: "1.0.0",
      capabilityId: "language.typescript",
      signalClass: "implementation",
      repositoryId: "repository-1",
      revision: REVISION,
      filePath: "src/index.ts",
      symbol: "canonicalValue",
      startLine: 1,
      endLine: 2,
      excerptStartOffset: 0,
      excerptEndOffset: EXCERPT.length,
    }],
    evidenceItems: [{
      id: "evidence-1",
      analysisVersionId: "analysis-v1",
      candidateId: "candidate-1",
      capabilityId: "language.typescript",
      observedCapability: "TypeScript",
      repositoryId: "repository-1",
      revision: REVISION,
      claimScope: "language-use",
      evidenceLevel: "strong",
      findingIds: ["finding-1"],
      thresholdFacts: STRONG_FACTS,
    }],
    gaps: [],
    citations: [{
      id: "citation-1",
      analysisVersionId: "analysis-v1",
      candidateId: "candidate-1",
      findingId: "finding-1",
      detectorId: "language.typescript.syntax",
      detectorVersion: "1.0.0",
      repositoryId: "repository-1",
      repositoryUrl: REPOSITORY_URL,
      repositoryName: "canonical",
      revision: REVISION,
      revisionAvailability: "available",
      filePath: "src/index.ts",
      symbol: "canonicalValue",
      startLine: 1,
      endLine: 2,
      excerpt: EXCERPT,
      sourceLink: `${REPOSITORY_URL}/blob/${REVISION}/src/index.ts#L1-L2`,
      discoveryOrigin: "GitHub profile",
      attributionStatus: "verified_contributor",
      evidenceLevel: "strong",
      taxonomyVersion: "2025.1",
    }],
    conclusions: [{
      id: "conclusion-1",
      analysisVersionId: "analysis-v1",
      capabilityId: "language.typescript",
      evidenceLevel: "strong",
      citationIds: ["citation-1"],
      eligibility: "eligible",
      explanation: "Grounded in verified contribution evidence.",
    }],
    analyzedCorpora: [{
      repositoryId: "repository-1",
      repositoryUrl: REPOSITORY_URL,
      repositoryName: "canonical",
      revision: REVISION,
      files: [{ path: "src/index.ts", content: SOURCE }],
    }],
    projections: [{
      surface: "api",
      citationId: "citation-1",
      attributionStatus: "verified_contributor",
      discoveryOrigin: "GitHub profile",
      evidenceLevel: "strong",
      taxonomyVersion: "2025.1",
    }],
    repositoryRunMetrics: {
      state: "completed",
      selectedRepositoryCount: 1,
      successfulRepositoryCount: 1,
      failedRepositoryCount: 0,
      pendingRepositoryCount: 0,
      attributionCounts: {
        unverified: 0,
        candidate_claimed: 0,
        verified_owner: 0,
        verified_contributor: 1,
      },
    },
    repositoryCorpusMetrics: [{
      rawArchiveEntryCount: 4,
      eligibleTextFileCount: 3,
      selectedFileCount: 2,
      analyzedFileCount: 1,
      downloadedArchiveBytes: 150,
      eligibleTextBytes: 120,
      selectedTextBytes: 100,
      analyzedTextBytes: SOURCE.length,
      excludedByReason: { generated: { files: 1, bytes: 30 } },
      limits: { selectedFiles: 20, selectedBytes: 200_000 },
    }],
    immutability: {
      analysis: {
        state: "completed",
        persisted: { version: "analysis-v1", values: [1, 2] },
        proposed: { values: [1, 2], version: "analysis-v1" },
      },
      requisition: {
        state: "completed",
        persisted: { id: "requisition-v1", criteria: ["language.typescript"] },
        proposed: { criteria: ["language.typescript"], id: "requisition-v1" },
      },
    },
  };
}

function errorCodes(bundle: CanonicalAnalysisBundle): CanonicalInvariantErrorCode[] {
  return validateCanonicalAnalysisBundle(bundle).errors.map((error) => error.code);
}

function withEvidenceLevel(
  bundle: CanonicalAnalysisBundle,
  evidenceLevel: "strong" | "good" | "partial",
  thresholdFacts: EvidenceThresholdFacts,
): CanonicalAnalysisBundle {
  return {
    ...bundle,
    evidenceItems: [{ ...bundle.evidenceItems[0], evidenceLevel, thresholdFacts }],
    citations: [{ ...bundle.citations[0], evidenceLevel }],
    conclusions: [{ ...bundle.conclusions[0], evidenceLevel }],
    projections: [{ ...bundle.projections[0], evidenceLevel }],
  };
}

describe("validateCanonicalAnalysisBundle", () => {
  it("accepts a grounded canonical bundle without mutating it", () => {
    const bundle = validBundle();
    const before = structuredClone(bundle);

    expect(validateCanonicalAnalysisBundle(bundle)).toEqual({
      outcome: "accepted",
      eligibleForCanonicalPersistence: true,
      errors: [],
    });
    expect(bundle).toEqual(before);
  });

  it("allows repeated records with one level but rejects distinct levels for the same evidence scope", () => {
    const bundle = validBundle();
    const sameLevel = {
      ...bundle.evidenceItems[0],
      id: "evidence-duplicate",
    };
    expect(validateCanonicalAnalysisBundle({
      ...bundle,
      evidenceItems: [...bundle.evidenceItems, sameLevel],
    }).outcome).toBe("accepted");

    const conflictingLevel = {
      ...sameLevel,
      evidenceLevel: "good" as const,
      thresholdFacts: {
        ...STRONG_FACTS,
        meaningfulImplementationFileCount: 2,
      },
    };
    expect(errorCodes({
      ...bundle,
      evidenceItems: [...bundle.evidenceItems, conflictingLevel],
    })).toContain("DUPLICATE_EVIDENCE_LEVELS");
  });

  it("rejects a gap and eligible supporting citation in the same claim scope", () => {
    const bundle = validBundle();
    expect(errorCodes({
      ...bundle,
      gaps: [{
        id: "gap-1",
        analysisVersionId: "analysis-v1",
        candidateId: "candidate-1",
        capabilityId: "language.typescript",
        repositoryId: "repository-1",
        revision: REVISION,
        claimScope: "language-use",
      }],
    })).toContain("GAP_AND_ELIGIBLE_SUPPORT");
  });

  it("rejects conclusions without a same-version verified_contributor citation", () => {
    const bundle = validBundle();
    const cases: CanonicalAnalysisBundle[] = [
      {
        ...bundle,
        citations: [{ ...bundle.citations[0], attributionStatus: "verified_owner" }],
        projections: [{ ...bundle.projections[0], attributionStatus: "verified_owner" }],
      },
      {
        ...bundle,
        citations: [{ ...bundle.citations[0], analysisVersionId: "analysis-v2" }],
      },
      {
        ...bundle,
        citations: [{ ...bundle.citations[0], taxonomyVersion: "legacy" }],
      },
      {
        ...bundle,
        conclusions: [{ ...bundle.conclusions[0], citationIds: [] }],
      },
      {
        ...bundle,
        conclusions: [{ ...bundle.conclusions[0], eligibility: "unsupported" }],
      },
    ];

    for (const invalid of cases) {
      expect(errorCodes(invalid)).toContain("UNSUPPORTED_CONCLUSION");
    }
  });

  it("rejects promotion above limited when every detector signal is weak", () => {
    const bundle = validBundle();
    expect(errorCodes({
      ...bundle,
      findings: [{ ...bundle.findings[0], signalClass: "documentation" }],
    })).toContain("WEAK_SIGNAL_PROMOTION");
  });

  it("rejects strong, good, and partial at their exact lower threshold boundaries", () => {
    const bundle = validBundle();
    const cases = [
      {
        level: "strong" as const,
        facts: { ...STRONG_FACTS, meaningfulImplementationFileCount: 2 },
        code: "STRONG_THRESHOLD_NOT_MET" as const,
      },
      {
        level: "strong" as const,
        facts: { ...STRONG_FACTS, hasTestEvidence: false, architecturalBoundaryCount: 1 },
        code: "STRONG_THRESHOLD_NOT_MET" as const,
      },
      {
        level: "good" as const,
        facts: {
          ...STRONG_FACTS,
          meaningfulImplementationFileCount: 1,
          repeatedNonTrivialUseAcrossModules: false,
        },
        code: "GOOD_THRESHOLD_NOT_MET" as const,
      },
      {
        level: "partial" as const,
        facts: {
          ...STRONG_FACTS,
          meaningfulImplementationFileCount: 0,
          narrowTestBackedUse: false,
        },
        code: "PARTIAL_THRESHOLD_NOT_MET" as const,
      },
    ];

    for (const { level, facts, code } of cases) {
      expect(errorCodes(withEvidenceLevel(bundle, level, facts))).toContain(code);
    }
  });

  it("rejects citation path, revision, line, excerpt, and source-link drift from analyzed bytes", () => {
    const bundle = validBundle();
    const citationChanges = [
      { filePath: "src/other.ts" },
      { revision: "different-revision" },
      { startLine: 2, endLine: 2 },
      { excerpt: "generated provider prose" },
      { sourceLink: `${REPOSITORY_URL}/blob/${REVISION}/src/index.ts#L1-L3` },
    ];

    for (const change of citationChanges) {
      expect(errorCodes({
        ...bundle,
        citations: [{ ...bundle.citations[0], ...change }],
      })).toContain("CITATION_CORPUS_MISMATCH");
    }
  });

  it("rejects status, origin, level, and taxonomy drift on every projected surface", () => {
    const bundle = validBundle();
    const projectionChanges: readonly Partial<EvidenceSurfaceProjection>[] = [
      { attributionStatus: "verified_owner" },
      { discoveryOrigin: "manual entry" },
      { evidenceLevel: "good" },
      { taxonomyVersion: "legacy" },
    ];

    for (const change of projectionChanges) {
      expect(errorCodes({
        ...bundle,
        projections: [{ ...bundle.projections[0], ...change }],
      })).toContain("CROSS_SURFACE_PROVENANCE_DRIFT");
    }
  });

  it("rejects completed analysis and requisition mutation but permits active draft changes", () => {
    const bundle = validBundle();
    const completedMutation: CanonicalAnalysisBundle = {
      ...bundle,
      immutability: {
        analysis: {
          state: "completed",
          persisted: { value: 1 },
          proposed: { value: 2 },
        },
        requisition: {
          state: "completed",
          persisted: { criterion: "language.typescript" },
          proposed: { criterion: "web.framework.react" },
        },
      },
    };
    expect(errorCodes(completedMutation)).toEqual(expect.arrayContaining([
      "COMPLETED_ANALYSIS_MUTATION",
      "COMPLETED_REQUISITION_MUTATION",
    ]));

    expect(validateCanonicalAnalysisBundle({
      ...bundle,
      immutability: {
        analysis: {
          state: "active",
          persisted: { value: 1 },
          proposed: { value: 2 },
        },
        requisition: {
          state: "active",
          persisted: { value: 1 },
          proposed: { value: 2 },
        },
      },
    }).outcome).toBe("accepted");
  });

  it("enforces completed and running repository equations and exact attribution totals", () => {
    const bundle = validBundle();
    const invalidCompleted: CanonicalAnalysisBundle = {
      ...bundle,
      repositoryRunMetrics: {
        ...bundle.repositoryRunMetrics,
        selectedRepositoryCount: 2,
        attributionCounts: {
          ...bundle.repositoryRunMetrics.attributionCounts,
          verified_contributor: 2,
        },
      },
    };
    expect(errorCodes(invalidCompleted)).toContain("REPOSITORY_RUN_METRICS_INVALID");

    const invalidRunning: CanonicalAnalysisBundle = {
      ...bundle,
      repositoryRunMetrics: {
        ...bundle.repositoryRunMetrics,
        state: "running",
        pendingRepositoryCount: 1,
      },
    };
    expect(errorCodes(invalidRunning)).toContain("REPOSITORY_RUN_METRICS_INVALID");

    expect(errorCodes({
      ...bundle,
      repositoryRunMetrics: {
        ...bundle.repositoryRunMetrics,
        attributionCounts: {
          unverified: 0,
          candidate_claimed: 0,
          verified_owner: 0,
          verified_contributor: 0,
        },
      },
    })).toContain("ATTRIBUTION_TOTAL_MISMATCH");
  });

  it("rejects non-monotonic repository corpus file and text-byte stages", () => {
    const bundle = validBundle();
    expect(errorCodes({
      ...bundle,
      repositoryCorpusMetrics: [{
        ...bundle.repositoryCorpusMetrics[0],
        eligibleTextFileCount: 1,
        selectedFileCount: 2,
        selectedTextBytes: 121,
      }],
    })).toContain("REPOSITORY_CORPUS_METRICS_INVALID");
  });

  it("rejects unknown aliases and sideways roll-up while accepting explicit upward roll-up", () => {
    const bundle = validBundle();
    expect(errorCodes({
      ...bundle,
      evidenceItems: [{ ...bundle.evidenceItems[0], observedCapability: "not-a-capability" }],
    })).toContain("TAXONOMY_ALIAS_INVALID");

    const unitFinding = {
      ...bundle.findings[0],
      capabilityId: "engineering.testing.unit",
    };
    const invalidSideways: CanonicalAnalysisBundle = {
      ...bundle,
      findings: [unitFinding],
      evidenceItems: [{
        ...bundle.evidenceItems[0],
        capabilityId: "engineering.testing.integration",
        observedCapability: "unit testing",
      }],
      conclusions: [{
        ...bundle.conclusions[0],
        capabilityId: "engineering.testing.integration",
      }],
    };
    expect(errorCodes(invalidSideways)).toContain("TAXONOMY_ROLLUP_INVALID");

    const validUpward: CanonicalAnalysisBundle = {
      ...bundle,
      findings: [unitFinding],
      evidenceItems: [{
        ...bundle.evidenceItems[0],
        capabilityId: "engineering.testing",
        observedCapability: "unit testing",
      }],
      conclusions: [{ ...bundle.conclusions[0], capabilityId: "engineering.testing" }],
    };
    expect(validateCanonicalAnalysisBundle(validUpward).outcome).toBe("accepted");
  });

  it("rejects a bundle pinned to an unavailable taxonomy version", () => {
    const bundle = validBundle();
    expect(errorCodes({
      ...bundle,
      analysis: { ...bundle.analysis, taxonomyVersion: "missing.99" },
    })).toContain("TAXONOMY_VERSION_UNKNOWN");
  });

  it("returns deterministic ordered errors without source excerpts or secret values", () => {
    const secretCanary = "Bearer SECRET_CANARY_VALUE_123456789";
    const bundle = validBundle();
    const conflictingEvidence = {
      ...bundle.evidenceItems[0],
      id: "evidence-2",
      evidenceLevel: "good" as const,
      thresholdFacts: { ...STRONG_FACTS, meaningfulImplementationFileCount: 2 },
    };
    const invalid: CanonicalAnalysisBundle = {
      ...bundle,
      evidenceItems: [conflictingEvidence, ...bundle.evidenceItems],
      gaps: [{
        id: "gap-secret",
        analysisVersionId: "analysis-v1",
        candidateId: "candidate-1",
        capabilityId: "language.typescript",
        repositoryId: "repository-1",
        revision: REVISION,
        claimScope: "language-use",
      }],
      citations: [{ ...bundle.citations[0], excerpt: secretCanary }],
      conclusions: [{ ...bundle.conclusions[0], explanation: secretCanary }],
      analyzedCorpora: [{
        ...bundle.analyzedCorpora[0],
        files: [{ path: "src/index.ts", content: `${SOURCE}\n// ${secretCanary}` }],
      }],
    };
    const permuted: CanonicalAnalysisBundle = {
      ...invalid,
      evidenceItems: [...invalid.evidenceItems].reverse(),
      gaps: [...invalid.gaps].reverse(),
      citations: [...invalid.citations].reverse(),
      conclusions: [...invalid.conclusions].reverse(),
      projections: [...invalid.projections].reverse(),
    };

    const first = validateCanonicalAnalysisBundle(invalid);
    const second = validateCanonicalAnalysisBundle(permuted);
    expect(first.errors).toEqual(second.errors);
    expect(JSON.stringify(first)).not.toContain(secretCanary);
    expect(first.errors.every((error) => Object.isFrozen(error))).toBe(true);
    expect(Object.isFrozen(first.errors)).toBe(true);
  });

  it("quarantines invalid legacy data, preserves the source, and marks conclusions for recomputation", () => {
    const bundle = validBundle();
    const legacy: CanonicalAnalysisBundle = {
      ...bundle,
      sourceKind: "legacy",
      evidenceItems: [
        ...bundle.evidenceItems,
        {
          ...bundle.evidenceItems[0],
          id: "legacy-conflict",
          evidenceLevel: "good",
          thresholdFacts: { ...STRONG_FACTS, meaningfulImplementationFileCount: 2 },
        },
      ],
      conclusions: [
        { ...bundle.conclusions[0], id: "conclusion-z" },
        { ...bundle.conclusions[0], id: "conclusion-a" },
      ],
    };
    const before = structuredClone(legacy);

    expect(validateCanonicalAnalysisBundle(legacy)).toMatchObject({
      outcome: "quarantined_for_recomputation",
      eligibleForCanonicalPersistence: false,
      preserveSourceRecord: true,
      recomputeConclusionIds: ["conclusion-a", "conclusion-z"],
      errors: [expect.objectContaining({ code: "DUPLICATE_EVIDENCE_LEVELS" })],
    });
    expect(legacy).toEqual(before);
  });
});

describe("Feature: codeproof-audit-remediation, Property 5: Evidence classification obeys canonical thresholds", () => {
  // **Validates: Requirements 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.12, 15.4**
  it("holds across 256 deterministic threshold and weak-signal boundary cases", () => {
    const generatedCaseCount = 256;
    const levels = ["strong", "good", "partial", "limited", "insufficient"] as const;
    const weakSignalClasses = ["dependency", "configuration", "documentation", "generated", "trivial"] as const;

    for (let index = 0; index < generatedCaseCount; index += 1) {
      const level = levels[index % levels.length];
      const shouldMeetThreshold = Math.floor(index / levels.length) % 2 === 0;
      const capabilityId = index % 2 === 0 ? "engineering.testing" : "delivery.ci_cd";
      const observedCapability = index % 2 === 0 ? "Testing" : "CI/CD";
      const detectorId = capabilityId === "delivery.ci_cd"
        ? "workflow.github-actions.meaningful"
        : "testing.implementation";
      const facts: EvidenceThresholdFacts = level === "strong"
        ? shouldMeetThreshold
          ? {
              meaningfulImplementationFileCount: 3 + (index % 3),
              implementationAreaCount: 2 + (index % 2),
              hasTestEvidence: index % 4 !== 0,
              architecturalBoundaryCount: index % 4 === 0 ? 2 : 1,
              repeatedNonTrivialUseAcrossModules: true,
              narrowTestBackedUse: true,
            }
          : {
              meaningfulImplementationFileCount: index % 3,
              implementationAreaCount: index % 2,
              hasTestEvidence: false,
              architecturalBoundaryCount: 1,
              repeatedNonTrivialUseAcrossModules: false,
              narrowTestBackedUse: false,
            }
        : level === "good"
          ? {
              meaningfulImplementationFileCount: shouldMeetThreshold && index % 2 === 0 ? 2 : shouldMeetThreshold ? 0 : 1,
              implementationAreaCount: 1,
              hasTestEvidence: false,
              architecturalBoundaryCount: 0,
              repeatedNonTrivialUseAcrossModules: shouldMeetThreshold && index % 2 !== 0,
              narrowTestBackedUse: false,
            }
          : level === "partial"
            ? {
                meaningfulImplementationFileCount: shouldMeetThreshold && index % 2 === 0 ? 1 : 0,
                implementationAreaCount: 1,
                hasTestEvidence: shouldMeetThreshold,
                architecturalBoundaryCount: 0,
                repeatedNonTrivialUseAcrossModules: false,
                narrowTestBackedUse: shouldMeetThreshold && index % 2 !== 0,
              }
            : {
                meaningfulImplementationFileCount: 0,
                implementationAreaCount: 0,
                hasTestEvidence: false,
                architecturalBoundaryCount: 0,
                repeatedNonTrivialUseAcrossModules: false,
                narrowTestBackedUse: false,
              };

      const base = validBundle();
      const conclusive = level === "strong" || level === "good" || level === "partial";
      const bundle: CanonicalAnalysisBundle = {
        ...base,
        findings: [{
          ...base.findings[0],
          detectorId,
          capabilityId,
          signalClass: capabilityId === "delivery.ci_cd" ? "architecture" : "implementation",
        }],
        evidenceItems: [{
          ...base.evidenceItems[0],
          capabilityId,
          observedCapability,
          evidenceLevel: level,
          thresholdFacts: facts,
        }],
        citations: [{ ...base.citations[0], detectorId, evidenceLevel: level }],
        conclusions: conclusive ? [{
          ...base.conclusions[0],
          capabilityId,
          evidenceLevel: level,
        }] : [],
        projections: [{ ...base.projections[0], evidenceLevel: level }],
      };
      const result = validateCanonicalAnalysisBundle(bundle);
      const codes = result.errors.map((error) => error.code);

      if (level === "strong") {
        expect(codes.includes("STRONG_THRESHOLD_NOT_MET")).toBe(!shouldMeetThreshold);
      } else if (level === "good") {
        expect(codes.includes("GOOD_THRESHOLD_NOT_MET")).toBe(!shouldMeetThreshold);
      } else if (level === "partial") {
        expect(codes.includes("PARTIAL_THRESHOLD_NOT_MET")).toBe(!shouldMeetThreshold);
      } else {
        expect(codes).not.toContain("STRONG_THRESHOLD_NOT_MET");
        expect(codes).not.toContain("GOOD_THRESHOLD_NOT_MET");
        expect(codes).not.toContain("PARTIAL_THRESHOLD_NOT_MET");
        expect(result.outcome).toBe("accepted");
      }

      const weakSignalClass = weakSignalClasses[index % weakSignalClasses.length];
      const weakBase = validBundle();
      const weakLevel = index % 2 === 0 ? "limited" : "insufficient";
      const weakDetectorId = `weak.${weakSignalClass}`;
      const weakBundle: CanonicalAnalysisBundle = {
        ...weakBase,
        findings: [{
          ...weakBase.findings[0],
          detectorId: weakDetectorId,
          capabilityId,
          signalClass: weakSignalClass,
        }],
        evidenceItems: [{
          ...weakBase.evidenceItems[0],
          capabilityId,
          observedCapability,
          evidenceLevel: weakLevel,
          thresholdFacts: facts,
        }],
        citations: [{ ...weakBase.citations[0], detectorId: weakDetectorId, evidenceLevel: weakLevel }],
        conclusions: [],
        projections: [{ ...weakBase.projections[0], evidenceLevel: weakLevel }],
      };
      expect(validateCanonicalAnalysisBundle(weakBundle)).toMatchObject({
        outcome: "accepted",
        eligibleForCanonicalPersistence: true,
        errors: [],
      });

      const promotedWeakBundle: CanonicalAnalysisBundle = {
        ...weakBundle,
        evidenceItems: [{ ...weakBundle.evidenceItems[0], evidenceLevel: "partial" }],
        citations: [{ ...weakBundle.citations[0], evidenceLevel: "partial" }],
        conclusions: [{
          ...weakBase.conclusions[0],
          capabilityId,
          evidenceLevel: "partial",
        }],
        projections: [{ ...weakBundle.projections[0], evidenceLevel: "partial" }],
      };
      expect(validateCanonicalAnalysisBundle(promotedWeakBundle).errors.map((error) => error.code))
        .toContain("WEAK_SIGNAL_PROMOTION");
    }
  });
});
