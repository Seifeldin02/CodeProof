import { DatabaseSync } from "node:sqlite";
import type { Pool } from "pg";
import { describe, expect, it } from "vitest";
import {
  buildLegacyReconciliationReport,
  parseCanonicalAccountWrite,
  parseCanonicalAnalysisWrite,
  parseCanonicalCandidateRepositoryWrite,
  projectLegacyAccountRecord,
  projectLegacyAnalysisRecord,
  projectLegacyCandidateRepositoryRecord,
  projectLegacyRequisitionRecord,
  readPostgreSQLLegacyReconciliationReport,
  readSQLiteLegacyReconciliationReport,
  type LegacyCandidateRepositoryRecord,
} from "./legacy-adapters";

const timestamp = "2025-01-02T03:04:05.000Z";

function repositoryRecord(
  overrides: Partial<LegacyCandidateRepositoryRecord> = {},
): LegacyCandidateRepositoryRecord {
  return {
    sourceTable: "candidate_repository_outcomes",
    sourceId: "repository-source-1",
    ownerUserId: "owner-1",
    candidateId: "candidate-1",
    repositoryUrl: "https://github.com/example/project",
    repositoryOwner: "example",
    repositoryName: "project",
    attributionUpdatedAt: timestamp,
    ...overrides,
  };
}

function canonicalRepositoryWrite() {
  return {
    id: "repository-1",
    ownerUserId: "owner-1",
    candidateId: "candidate-1",
    repositoryUrl: "https://github.com/example/project",
    repositoryOwner: "example",
    repositoryName: "project",
    discoveryOrigin: "CV" as const,
    attributionStatus: "verified_contributor" as const,
    attributionUpdatedAt: timestamp,
    verificationRevision: "abc123",
    linkedProviderIdentityId: "provider-identity-1",
    originConfirmationRequired: false as const,
  };
}

function canonicalMetadata() {
  return {
    analysisVersionId: "analysis-1",
    analyzedAt: timestamp,
    deterministicEngineVersion: "engine.v2",
    taxonomyVersion: "taxonomy.v1",
    requisitionVersionId: null,
    aiRequestSchemaVersion: null,
    providerId: null,
    modelId: null,
    promptVersion: null,
    pricingVersion: null,
    isDemo: false,
  };
}

describe("legacy candidate repository read adapter", () => {
  it("maps every supported attribution only with persisted proof and never invents origin", () => {
    const cases = [
      [repositoryRecord(), "unverified"],
      [repositoryRecord({ attributionStatus: "unknown_contributor" }), "unverified"],
      [repositoryRecord({ attributionStatus: "candidate_claimed" }), "unverified"],
      [repositoryRecord({ attributionStatus: "candidate_claimed", attributionProof: { hasCandidateSourceClaim: true } }), "candidate_claimed"],
      [repositoryRecord({ attributionStatus: "verified_owner", attributionProof: {
        hasAuthenticatedProviderIdentity: true,
        hasRepositoryIdentity: true,
        hasRepositoryOwnershipProof: true,
      } }), "verified_owner"],
      [repositoryRecord({ attributionStatus: "verified_contributor", attributionProof: {
        hasAuthenticatedProviderIdentity: true,
        hasRepositoryIdentity: true,
      } }), "unverified"],
      [repositoryRecord({ attributionStatus: "verified_contributor", attributionProof: {
        hasAuthenticatedProviderIdentity: true,
        hasRepositoryIdentity: true,
        hasImmutableRevision: true,
      } }), "verified_contributor"],
    ] as const;

    for (const [source, expected] of cases) {
      expect(projectLegacyCandidateRepositoryRecord(source).view.attributionStatus).toBe(expected);
    }

    expect(projectLegacyCandidateRepositoryRecord(repositoryRecord({ discoveryOrigin: "cv_link" })).view)
      .toMatchObject({ discoveryOrigin: "CV", originConfirmationRequired: false, eligibleForNewAnalysis: true });
    expect(projectLegacyCandidateRepositoryRecord(repositoryRecord({ discoveryOrigin: "recruiter_entry" })).view.discoveryOrigin)
      .toBe("manual entry");
    expect(projectLegacyCandidateRepositoryRecord(repositoryRecord({ discoveryOrigin: "profile_discovery" })).view.discoveryOrigin)
      .toBe("GitHub profile");
    expect(projectLegacyCandidateRepositoryRecord(repositoryRecord({ discoveryOrigin: "portfolio" })).view.discoveryOrigin)
      .toBe("portfolio");
    expect(projectLegacyCandidateRepositoryRecord(repositoryRecord({ discoveryOrigin: "git_provider" })).view)
      .toMatchObject({ discoveryOrigin: null, originConfirmationRequired: true, eligibleForNewAnalysis: false });
    expect(projectLegacyCandidateRepositoryRecord(repositoryRecord({
      discoveryOrigin: "git_provider",
      persistedProviderDiscoveryOrigin: "portfolio",
    })).view.discoveryOrigin).toBe("portfolio");
    expect(projectLegacyCandidateRepositoryRecord(repositoryRecord({ discoveryOrigin: "invented_source" })).view)
      .toMatchObject({ discoveryOrigin: null, originConfirmationRequired: true });
  });
});

describe("legacy analysis read adapter", () => {
  it("maps old JSON levels, pins missing versions, preserves aggregates/source, and quarantines unsupported conclusions", () => {
    const analysisJson = {
      metadata: { analyzedAt: timestamp },
      skills: [
        { name: "TypeScript", level: "Strong Evidence" },
        { skill: "TypeScript", level: "Partial Evidence" },
        { skill: "Testing", level: "Strong" },
      ],
      legacyConclusion: "preserve exactly",
    };
    const before = JSON.stringify(analysisJson);
    const source = {
      sourceTable: "candidate_analyses",
      sourceId: "analysis-1",
      ownerUserId: "owner-1",
      candidateId: "candidate-1",
      analysisJson,
      evidenceIndex: 72,
      verifiedClaimCount: 4,
      isDemo: 1,
    } as const;

    const projection = projectLegacyAnalysisRecord(source);

    expect(projection.source).toBe(source);
    expect(projection.source.analysisJson).toBe(analysisJson);
    expect(JSON.stringify(analysisJson)).toBe(before);
    expect(projection.view.metadata).toMatchObject({
      analysisVersionId: "analysis-1",
      deterministicEngineVersion: "legacy",
      taxonomyVersion: "legacy",
      isDemo: true,
    });
    expect(projection.view.evidence.map((item) => item.evidenceLevel)).toEqual(["strong", "partial", null]);
    expect(projection.view.legacyAggregates).toEqual({ evidenceIndex: 72, verifiedClaimCount: 4 });
    expect(projection.view.quarantinedConclusions).toEqual([
      expect.objectContaining({ claim: "TypeScript", eligibility: "unsupported", quarantineReason: "contradictory_evidence_levels" }),
      expect.objectContaining({ claim: "TypeScript", eligibility: "unsupported", quarantineReason: "contradictory_evidence_levels" }),
      expect.objectContaining({ claim: "Testing", eligibility: "unsupported", quarantineReason: "unsupported_legacy_evidence_level" }),
    ]);
    expect(projection.view.recomputeRequired).toBe(true);
    expect(projection.view.recomputeReasons).toEqual([
      "contradictory_evidence_levels",
      "missing_engine_version",
      "missing_taxonomy_version",
      "unsupported_legacy_evidence_level",
    ]);
  });

  it("never exposes a title-cased legacy conclusion as eligible even when it is not contradictory", () => {
    const projection = projectLegacyAnalysisRecord({
      sourceTable: "candidate_analyses",
      sourceId: "analysis-2",
      candidateId: "candidate-1",
      analyzedAt: timestamp,
      analysisJson: JSON.stringify({ skills: [{ skill: "TypeScript", level: "Good Evidence" }] }),
      evidenceIndex: 60,
    });
    expect(projection.view.quarantinedConclusions).toEqual([
      expect.objectContaining({
        evidenceLevel: "good",
        eligibility: "unsupported",
        quarantineReason: "missing_verified_contributor_grounding",
      }),
    ]);
  });
});

describe("legacy account and requisition read adapters", () => {
  it("uses safe account defaults and preserves the original row", () => {
    const source = {
      id: "owner-1",
      email: "owner@example.test",
      created_at: timestamp,
      role: "OWNER",
      lifecycle_state: "deleted",
    };
    const projection = projectLegacyAccountRecord(source);
    expect(projection.source).toBe(source);
    expect(projection.view).toMatchObject({
      id: "owner-1",
      role: "RECRUITER",
      lifecycleState: "active",
      isDemo: false,
      demoLabel: null,
      planTierId: null,
      legacyMarker: "legacy",
    });
  });

  it("maps only explicit canonical requisition criteria and audits unresolved owners deterministically", () => {
    const requirements = [
      { id: "requirement-2", requirement: "Leadership", importance: "context", category: "responsibility", position: 1 },
      { id: "requirement-1", capabilityId: "language.typescript", importance: "required", position: 0 },
    ] as const;
    const source = {
      sourceTable: "company_requirements",
      sourceId: "legacy-requisition-ownerless",
      ownerUserId: null,
      requisitionId: "requisition-1",
      versionId: "requisition-version-1",
      createdAt: timestamp,
      requirements,
    } as const;
    const projection = projectLegacyRequisitionRecord(source);
    expect(projection.source.requirements).toBe(requirements);
    expect(projection.view.criteria).toEqual([{
      id: "requirement-1",
      capabilityId: "language.typescript",
      importance: "required",
    }]);
    expect(projection.view).toMatchObject({
      ownerUserId: null,
      schemaVersion: "legacy",
      sourceRequirementsPreserved: true,
      recomputeRequired: true,
    });
    expect(projection.view.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(projection.reconciliationEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: "unresolved_owner" }),
      expect.objectContaining({ category: "recompute", reason: "missing_canonical_capability" }),
    ]));
  });
});

describe("canonical-only write adapters", () => {
  it("accepts canonical writes and rejects legacy enum spellings and legacy version markers", () => {
    expect(parseCanonicalCandidateRepositoryWrite(canonicalRepositoryWrite()).attributionStatus)
      .toBe("verified_contributor");
    expect(() => parseCanonicalCandidateRepositoryWrite({
      ...canonicalRepositoryWrite(),
      attributionStatus: "unknown_contributor",
    })).toThrow();
    expect(() => parseCanonicalCandidateRepositoryWrite({
      ...canonicalRepositoryWrite(),
      discoveryOrigin: "cv_link",
    })).toThrow();

    const conclusion = {
      id: "conclusion-1",
      analysisVersionId: "analysis-1",
      capabilityId: "language.typescript",
      evidenceLevel: "partial" as const,
      citationIds: ["citation-1"],
      eligibility: "eligible" as const,
      explanation: "Grounded TypeScript implementation.",
    };
    expect(parseCanonicalAnalysisWrite({
      metadata: canonicalMetadata(),
      evidenceLevels: ["strong", "good", "partial", "limited", "insufficient"],
      conclusions: [conclusion],
    }).evidenceLevels).toHaveLength(5);
    expect(() => parseCanonicalAnalysisWrite({
      metadata: canonicalMetadata(),
      evidenceLevels: ["Strong Evidence"],
      conclusions: [],
    })).toThrow();
    expect(() => parseCanonicalAnalysisWrite({
      metadata: { ...canonicalMetadata(), taxonomyVersion: "legacy" },
      evidenceLevels: ["partial"],
      conclusions: [],
    })).toThrow();
    expect(() => parseCanonicalAccountWrite({
      role: "admin",
      lifecycleState: "active",
      isDemo: false,
      demoLabel: null,
      companyName: null,
      planTierId: null,
      lastActivityAt: null,
      softDeletedAt: null,
      suspendedAt: null,
    })).toThrow();
  });
});

describe("deterministic reconciliation audit", () => {
  it("produces order-independent counts for every mapping and quarantine reason", () => {
    const repository = projectLegacyCandidateRepositoryRecord(repositoryRecord({
      ownerUserId: null,
      attributionStatus: "verified_contributor",
      attributionProof: { hasAuthenticatedProviderIdentity: true },
      discoveryOrigin: "git_provider",
    }));
    const analysis = projectLegacyAnalysisRecord({
      sourceTable: "candidate_analyses",
      sourceId: "analysis-1",
      candidateId: "candidate-1",
      analyzedAt: timestamp,
      analysisJson: { skills: [{ skill: "TypeScript", level: "Good Evidence" }] },
    });
    const events = [...repository.reconciliationEvents, ...analysis.reconciliationEvents];
    const forward = buildLegacyReconciliationReport("memory", events);
    const reverse = buildLegacyReconciliationReport("memory", [...events].reverse());

    expect(reverse).toEqual(forward);
    expect(forward).toMatchObject({
      unresolvedOwnerCount: 1,
      unresolvedOriginCount: 1,
      quarantineCount: 1,
      sourceRecordCount: 2,
    });
    expect(forward.counts).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceTable: "candidate_analyses", category: "quarantine", reason: "missing_verified_contributor_grounding", count: 1 }),
      expect.objectContaining({ sourceTable: "candidate_repository_outcomes", category: "mapping", outcome: "attribution:unverified", count: 1 }),
    ]));
  });

  it("normalizes SQLite and PostgreSQL migration markers through the same report contract", async () => {
    const markerRows = [
      {
        source_table: "candidate_repository_outcomes",
        source_id: "outcome-1",
        target_table: "candidate_repositories",
        status: "backfilled",
        detail_json: { attributionStatus: "unverified", originConfirmationRequired: true },
      },
      {
        source_table: "candidate_analyses",
        source_id: "analysis-1",
        target_table: "analysis_versions",
        status: "recompute_required",
        detail_json: { deterministicEngineVersion: "legacy", taxonomyVersion: "legacy" },
      },
      {
        source_table: "company_requirements",
        source_id: "requirement-1",
        target_table: "requisition_versions",
        status: "owner_unresolved",
        detail_json: {},
      },
    ] as const;

    const db = new DatabaseSync(":memory:");
    db.exec(`CREATE TABLE legacy_migration_markers (
      source_table TEXT NOT NULL, source_id TEXT NOT NULL, target_table TEXT NOT NULL,
      status TEXT NOT NULL, detail_json TEXT NOT NULL
    )`);
    const insert = db.prepare(`INSERT INTO legacy_migration_markers
      (source_table, source_id, target_table, status, detail_json) VALUES (?, ?, ?, ?, ?)`);
    for (const row of markerRows) {
      insert.run(row.source_table, row.source_id, row.target_table, row.status, JSON.stringify(row.detail_json));
    }
    const sqlite = readSQLiteLegacyReconciliationReport(db);
    db.close();

    const fakePostgres = {
      async query() {
        return { rows: markerRows, rowCount: markerRows.length };
      },
    } as unknown as Pool;
    const postgres = await readPostgreSQLLegacyReconciliationReport(fakePostgres);

    expect({ ...postgres, adapter: "sqlite" }).toEqual(sqlite);
    expect(sqlite).toMatchObject({
      sourceRecordCount: 3,
      unresolvedOwnerCount: 1,
      unresolvedOriginCount: 1,
      recomputeCount: 1,
      quarantineCount: 0,
    });
    expect(sqlite.counts).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceTable: "candidate_analyses", outcome: "engine_version:legacy" }),
      expect.objectContaining({ sourceTable: "candidate_analyses", outcome: "taxonomy_version:legacy" }),
      expect.objectContaining({ sourceTable: "candidate_repository_outcomes", outcome: "attribution:unverified" }),
    ]));
  });
});
