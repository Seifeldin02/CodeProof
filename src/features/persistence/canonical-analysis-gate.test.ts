import { describe, expect, it } from "vitest";
import type { CanonicalAnalysisBundle } from "@/features/repository-analysis/invariant-validator";
import {
  CanonicalAnalysisRejectedError,
  persistCanonicalAnalysisBundle,
  type CanonicalAnalysisPersistenceAdapter,
  type CanonicalAnalysisPersistenceTransaction,
  type CanonicalPersistenceEngine,
} from "./canonical-analysis-gate";

const source = "export function value(input: string): string {\n  return input.trim();\n}";
const excerpt = source.split("\n").slice(0, 2).join("\n");

function validBundle(index = 0): CanonicalAnalysisBundle {
  const suffix = String(index);
  const versionId = `analysis-${suffix}`;
  const candidateId = `candidate-${suffix}`;
  const repositoryId = `repository-${suffix}`;
  const findingId = `finding-${suffix}`;
  const citationId = `citation-${suffix}`;
  const revision = `revision-${suffix}`;
  const repositoryUrl = `https://github.com/example/repository-${suffix}`;
  return {
    sourceKind: "canonical",
    analysis: { versionId, candidateId, taxonomyVersion: "2025.1" },
    findings: [{
      id: findingId,
      detectorId: "language.typescript.syntax",
      detectorVersion: "1.0.0",
      capabilityId: "language.typescript",
      signalClass: "implementation",
      repositoryId,
      revision,
      filePath: "src/index.ts",
      symbol: "value",
      startLine: 1,
      endLine: 2,
      excerptStartOffset: 0,
      excerptEndOffset: excerpt.length,
    }],
    evidenceItems: [{
      id: `evidence-${suffix}`,
      analysisVersionId: versionId,
      candidateId,
      capabilityId: "language.typescript",
      observedCapability: "TypeScript",
      repositoryId,
      revision,
      claimScope: "language-use",
      evidenceLevel: "strong",
      findingIds: [findingId],
      thresholdFacts: {
        meaningfulImplementationFileCount: 3,
        implementationAreaCount: 2,
        hasTestEvidence: true,
        architecturalBoundaryCount: 1,
        repeatedNonTrivialUseAcrossModules: true,
        narrowTestBackedUse: true,
      },
    }],
    gaps: [],
    citations: [{
      id: citationId,
      analysisVersionId: versionId,
      candidateId,
      findingId,
      detectorId: "language.typescript.syntax",
      detectorVersion: "1.0.0",
      repositoryId,
      repositoryUrl,
      repositoryName: `example/repository-${suffix}`,
      revision,
      revisionAvailability: "available",
      filePath: "src/index.ts",
      symbol: "value",
      startLine: 1,
      endLine: 2,
      excerpt,
      sourceLink: `${repositoryUrl}/blob/${revision}/src/index.ts#L1-L2`,
      discoveryOrigin: "manual entry",
      attributionStatus: "verified_contributor",
      evidenceLevel: "strong",
      taxonomyVersion: "2025.1",
    }],
    conclusions: [{
      id: `conclusion-${suffix}`,
      analysisVersionId: versionId,
      capabilityId: "language.typescript",
      evidenceLevel: "strong",
      citationIds: [citationId],
      eligibility: "eligible",
      explanation: "Grounded in verified contribution evidence.",
    }],
    analyzedCorpora: [{
      repositoryId,
      repositoryUrl,
      repositoryName: `example/repository-${suffix}`,
      revision,
      files: [{ path: "src/index.ts", content: source }],
    }],
    projections: [{
      surface: "persistence",
      citationId,
      attributionStatus: "verified_contributor",
      discoveryOrigin: "manual entry",
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
      rawArchiveEntryCount: 3,
      eligibleTextFileCount: 2,
      selectedFileCount: 1,
      analyzedFileCount: 1,
      downloadedArchiveBytes: 120,
      eligibleTextBytes: 100,
      selectedTextBytes: source.length,
      analyzedTextBytes: source.length,
      excludedByReason: { generated: { files: 1, bytes: 20 } },
      limits: { selectedFiles: 32, selectedBytes: 600_000 },
    }],
    immutability: {
      analysis: { state: "completed", persisted: { id: versionId }, proposed: { id: versionId } },
      requisition: { state: "completed", persisted: { id: "req-1" }, proposed: { id: "req-1" } },
    },
  };
}

function invalidBundle(index: number): CanonicalAnalysisBundle {
  const bundle = validBundle(index);
  switch (index % 8) {
    case 0:
      return { ...bundle, analysis: { ...bundle.analysis, taxonomyVersion: "missing.version" } };
    case 1:
      return {
        ...bundle,
        gaps: [{
          id: `gap-${index}`,
          analysisVersionId: bundle.analysis.versionId,
          candidateId: bundle.analysis.candidateId,
          capabilityId: bundle.evidenceItems[0].capabilityId,
          repositoryId: bundle.evidenceItems[0].repositoryId,
          revision: bundle.evidenceItems[0].revision,
          claimScope: bundle.evidenceItems[0].claimScope,
        }],
      };
    case 2:
      return { ...bundle, conclusions: [{ ...bundle.conclusions[0], citationIds: ["missing-citation"] }] };
    case 3:
      return { ...bundle, projections: [{ ...bundle.projections[0], attributionStatus: "unverified" }] };
    case 4:
      return {
        ...bundle,
        evidenceItems: [{
          ...bundle.evidenceItems[0],
          thresholdFacts: { ...bundle.evidenceItems[0].thresholdFacts, meaningfulImplementationFileCount: 2 },
        }],
      };
    case 5: {
      const detectorId = "weak.dependency";
      return {
        ...bundle,
        findings: [{ ...bundle.findings[0], detectorId, signalClass: "dependency" }],
        citations: [{ ...bundle.citations[0], detectorId }],
      };
    }
    case 6:
      return {
        ...bundle,
        immutability: {
          ...bundle.immutability,
          analysis: { state: "completed", persisted: { id: "before" }, proposed: { id: "after" } },
        },
      };
    default:
      return {
        ...bundle,
        repositoryRunMetrics: { ...bundle.repositoryRunMetrics, successfulRepositoryCount: 0 },
      };
  }
}

class RecordingAdapter implements CanonicalAnalysisPersistenceAdapter {
  transactionCalls = 0;
  writeCalls = 0;
  commitCalls = 0;
  readonly rows: CanonicalAnalysisBundle[] = [];

  constructor(readonly engine: CanonicalPersistenceEngine) {}

  async transaction<T>(
    operation: (transaction: CanonicalAnalysisPersistenceTransaction) => Promise<T>,
  ): Promise<T> {
    this.transactionCalls += 1;
    const staged: CanonicalAnalysisBundle[] = [];
    const value = await operation({
      writeCanonicalAnalysis: async (bundle) => {
        this.writeCalls += 1;
        staged.push(bundle);
      },
    });
    this.rows.push(...staged);
    this.commitCalls += 1;
    return value;
  }
}

describe("Feature: codeproof-audit-remediation, Property 6: Contradictory analyses are rejected before persistence", () => {
  // **Validates: Requirements 2.11, 2.12, 14.9, 15.4**
  it("opens no SQLite or PostgreSQL transaction for 256 generated invalid bundles", async () => {
    const generatedCaseCount = 256;
    const sqlite = new RecordingAdapter("sqlite");
    const postgresql = new RecordingAdapter("postgresql");

    for (let index = 0; index < generatedCaseCount; index += 1) {
      const bundle = invalidBundle(index);
      for (const adapter of [sqlite, postgresql]) {
        await expect(persistCanonicalAnalysisBundle(adapter, bundle)).rejects.toMatchObject({
          name: "CanonicalAnalysisRejectedError",
          code: "CANONICAL_ANALYSIS_REJECTED",
        });
      }
    }

    for (const adapter of [sqlite, postgresql]) {
      expect(adapter.transactionCalls).toBe(0);
      expect(adapter.writeCalls).toBe(0);
      expect(adapter.commitCalls).toBe(0);
      expect(adapter.rows).toEqual([]);
    }
  });

  it("writes an accepted control bundle once through each transactional adapter", async () => {
    for (const engine of ["sqlite", "postgresql"] as const) {
      const adapter = new RecordingAdapter(engine);
      const bundle = validBundle();
      await persistCanonicalAnalysisBundle(adapter, bundle);
      expect(adapter.transactionCalls).toBe(1);
      expect(adapter.writeCalls).toBe(1);
      expect(adapter.commitCalls).toBe(1);
      expect(adapter.rows).toEqual([bundle]);
    }
  });

  it("returns only stable redacted validation details", async () => {
    const secretCanary = "sk-live-never-surface-this";
    const bundle = invalidBundle(0);
    const adapter = new RecordingAdapter("sqlite");
    let rejected: unknown;
    try {
      await persistCanonicalAnalysisBundle(adapter, {
        ...bundle,
        conclusions: [{ ...bundle.conclusions[0], explanation: secretCanary }],
      });
    } catch (error) {
      rejected = error;
    }
    expect(rejected).toBeInstanceOf(CanonicalAnalysisRejectedError);
    expect(JSON.stringify(rejected)).not.toContain(secretCanary);
  });
});
