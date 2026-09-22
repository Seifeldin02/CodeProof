import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { Pool, PoolClient, QueryResultRow } from "pg";
import { z } from "zod";
import {
  AccountLifecycleStateSchema,
  AccountRemediationFieldsSchema,
  AccountRoleSchema,
  AttributionStatusSchema,
  CandidateConclusionSchema,
  CanonicalAnalysisMetadataSchema,
  CanonicalEvidenceLevelSchema,
  DiscoveryOriginSchema,
  RequisitionVersionSchema,
  parseLegacyAttributionStatusForMigration,
  parseLegacyDiscoveryOriginForMigration,
  parseLegacyEvidenceLevelForMigration,
  type AccountRemediationFields,
  type AttributionStatus,
  type CanonicalAnalysisMetadata,
  type CanonicalEvidenceLevel,
  type DiscoveryOrigin,
  type LegacyAttributionProof,
  type RequisitionVersion,
} from "@/types/remediation";

export const LEGACY_VERSION_MARKER = "legacy" as const;
const LEGACY_TIMESTAMP_MARKER = "1970-01-01T00:00:00.000Z";

export type LegacyReconciliationCategory =
  | "mapping"
  | "unresolved_owner"
  | "unresolved_origin"
  | "recompute"
  | "quarantine";

export interface LegacyReconciliationEvent {
  readonly sourceTable: string;
  readonly sourceId: string;
  readonly category: LegacyReconciliationCategory;
  readonly outcome: string;
  readonly reason: string | null;
}

export interface LegacyReadProjection<TSource, TView> {
  /** The original source value is retained by reference and is never rewritten by an adapter. */
  readonly source: TSource;
  readonly view: TView;
  readonly reconciliationEvents: readonly LegacyReconciliationEvent[];
}

function event(
  sourceTable: string,
  sourceId: string,
  category: LegacyReconciliationCategory,
  outcome: string,
  reason: string | null = null,
): LegacyReconciliationEvent {
  return Object.freeze({ sourceTable, sourceId, category, outcome, reason });
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function nullableString(value: unknown): string | null {
  return nonEmptyString(value);
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (value === 0 || value === 1) return value === 1;
  return fallback;
}

function finiteInteger(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) return null;
  return value;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function canonicalAttribution(
  value: unknown,
  proof: LegacyAttributionProof,
): AttributionStatus {
  try {
    return parseLegacyAttributionStatusForMigration(value, proof);
  } catch {
    return "unverified";
  }
}

function canonicalOrigin(
  value: unknown,
  persistedProviderDiscoveryOrigin: unknown,
): { origin: DiscoveryOrigin | null; originConfirmationRequired: boolean } {
  const persisted = DiscoveryOriginSchema.safeParse(persistedProviderDiscoveryOrigin);
  try {
    return parseLegacyDiscoveryOriginForMigration(
      value,
      persisted.success ? persisted.data : undefined,
    );
  } catch {
    return { origin: null, originConfirmationRequired: true };
  }
}

export interface LegacyCandidateRepositoryRecord {
  readonly sourceTable: "candidate_repository_outcomes" | "candidate_analyses" | string;
  readonly sourceId: string;
  readonly ownerUserId?: string | null;
  readonly candidateId: string;
  readonly repositoryUrl: string;
  readonly repositoryOwner?: string | null;
  readonly repositoryName: string;
  readonly discoveryOrigin?: unknown;
  /** Persisted discovery event used only when the legacy value is `git_provider`. */
  readonly persistedProviderDiscoveryOrigin?: unknown;
  readonly attributionStatus?: unknown;
  readonly attributionProof?: LegacyAttributionProof;
  readonly attributionUpdatedAt: string;
  readonly verificationRevision?: string | null;
  readonly linkedProviderIdentityId?: string | null;
}

export interface CanonicalLegacyCandidateRepositoryView {
  readonly sourceId: string;
  readonly ownerUserId: string | null;
  readonly candidateId: string;
  readonly repositoryUrl: string;
  readonly repositoryOwner: string | null;
  readonly repositoryName: string;
  readonly discoveryOrigin: DiscoveryOrigin | null;
  readonly attributionStatus: AttributionStatus;
  readonly attributionUpdatedAt: string;
  readonly verificationRevision: string | null;
  readonly linkedProviderIdentityId: string | null;
  readonly originConfirmationRequired: boolean;
  readonly eligibleForNewAnalysis: boolean;
  readonly legacyMarker: typeof LEGACY_VERSION_MARKER;
}

/** Conservatively projects one legacy repository relationship without mutating its source row. */
export function projectLegacyCandidateRepositoryRecord(
  source: LegacyCandidateRepositoryRecord,
): LegacyReadProjection<LegacyCandidateRepositoryRecord, CanonicalLegacyCandidateRepositoryView> {
  const proof = source.attributionProof ?? {};
  const attributionStatus = canonicalAttribution(source.attributionStatus, proof);
  const origin = canonicalOrigin(source.discoveryOrigin, source.persistedProviderDiscoveryOrigin);
  const events: LegacyReconciliationEvent[] = [];

  if (source.ownerUserId === null) {
    events.push(event(source.sourceTable, source.sourceId, "unresolved_owner", "owner_unresolved", "persisted_owner_missing"));
  }

  const rawAttribution = nonEmptyString(source.attributionStatus);
  events.push(event(
    source.sourceTable,
    source.sourceId,
    "mapping",
    `attribution:${attributionStatus}`,
    rawAttribution === null
      ? "missing_attribution_default"
      : attributionStatus === "unverified" && rawAttribution !== "unverified"
        ? "insufficient_persisted_proof"
        : "persisted_provenance",
  ));

  if (origin.origin === null) {
    events.push(event(
      source.sourceTable,
      source.sourceId,
      "unresolved_origin",
      "origin_confirmation_required",
      "persisted_discovery_provenance_unavailable",
    ));
  } else {
    events.push(event(source.sourceTable, source.sourceId, "mapping", `origin:${origin.origin}`, "persisted_provenance"));
  }

  return Object.freeze({
    source,
    view: Object.freeze({
      sourceId: source.sourceId,
      ownerUserId: source.ownerUserId ?? null,
      candidateId: source.candidateId,
      repositoryUrl: source.repositoryUrl,
      repositoryOwner: source.repositoryOwner ?? null,
      repositoryName: source.repositoryName,
      discoveryOrigin: origin.origin,
      attributionStatus,
      attributionUpdatedAt: source.attributionUpdatedAt,
      verificationRevision: source.verificationRevision ?? null,
      linkedProviderIdentityId: source.linkedProviderIdentityId ?? null,
      originConfirmationRequired: origin.originConfirmationRequired,
      eligibleForNewAnalysis: origin.origin !== null && !origin.originConfirmationRequired,
      legacyMarker: LEGACY_VERSION_MARKER,
    }),
    reconciliationEvents: Object.freeze(events),
  });
}

export interface LegacyAnalysisRecord {
  readonly sourceTable: "candidate_analyses" | string;
  readonly sourceId: string;
  readonly ownerUserId?: string | null;
  readonly candidateId: string;
  readonly analyzedAt?: string | null;
  readonly analysisJson: unknown;
  readonly evidenceIndex?: number | null;
  readonly verifiedClaimCount?: number | null;
  readonly isDemo?: boolean | number | null;
}

export type LegacyConclusionQuarantineReason =
  | "missing_verified_contributor_grounding"
  | "contradictory_evidence_levels"
  | "unsupported_legacy_evidence_level";

export interface CanonicalLegacyEvidenceProjection {
  readonly sourceKind: "skill" | "conclusion";
  readonly sourceIndex: number;
  readonly claim: string | null;
  readonly evidenceLevel: CanonicalEvidenceLevel | null;
}

export interface QuarantinedLegacyConclusion extends CanonicalLegacyEvidenceProjection {
  readonly eligibility: "unsupported";
  readonly quarantineReason: LegacyConclusionQuarantineReason;
}

export interface CanonicalLegacyAnalysisView {
  readonly analysisVersionId: string;
  readonly ownerUserId: string | null;
  readonly candidateId: string;
  readonly metadata: CanonicalAnalysisMetadata;
  readonly evidence: readonly CanonicalLegacyEvidenceProjection[];
  readonly quarantinedConclusions: readonly QuarantinedLegacyConclusion[];
  readonly recomputeRequired: boolean;
  readonly recomputeReasons: readonly string[];
  /** Retained alongside canonical projections for supported pre-release readers. */
  readonly legacyAggregates: Readonly<{
    evidenceIndex: number | null;
    verifiedClaimCount: number | null;
  }>;
  readonly sourceJsonPreserved: true;
  readonly legacyMarker: typeof LEGACY_VERSION_MARKER;
}

interface RawLegacyConclusion {
  readonly sourceKind: "skill" | "conclusion";
  readonly sourceIndex: number;
  readonly claim: string | null;
  readonly rawLevel: unknown;
}

function parseLegacyAnalysisJson(value: unknown): {
  analysis: Readonly<Record<string, unknown>>;
  malformed: boolean;
} {
  if (isRecord(value)) return { analysis: value, malformed: false };
  if (typeof value !== "string") return { analysis: {}, malformed: true };
  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) ? { analysis: parsed, malformed: false } : { analysis: {}, malformed: true };
  } catch {
    return { analysis: {}, malformed: true };
  }
}

function rawConclusionFrom(
  value: unknown,
  sourceKind: RawLegacyConclusion["sourceKind"],
  sourceIndex: number,
): RawLegacyConclusion | null {
  if (!isRecord(value)) return null;
  return {
    sourceKind,
    sourceIndex,
    claim: nonEmptyString(value.skill)
      ?? nonEmptyString(value.name)
      ?? nonEmptyString(value.claim)
      ?? nonEmptyString(value.capabilityId),
    rawLevel: value.level ?? value.evidenceLevel,
  };
}

function extractLegacyConclusions(analysis: Readonly<Record<string, unknown>>): RawLegacyConclusion[] {
  const skills = Array.isArray(analysis.skills)
    ? analysis.skills.flatMap((value, index) => {
      const item = rawConclusionFrom(value, "skill", index);
      return item ? [item] : [];
    })
    : [];
  const conclusions = Array.isArray(analysis.conclusions)
    ? analysis.conclusions.flatMap((value, index) => {
      const item = rawConclusionFrom(value, "conclusion", index);
      return item ? [item] : [];
    })
    : [];
  return [...skills, ...conclusions];
}

function versionFrom(
  analysis: Readonly<Record<string, unknown>>,
  metadata: Readonly<Record<string, unknown>>,
  keys: readonly string[],
): string {
  for (const key of keys) {
    const nested = nonEmptyString(metadata[key]);
    if (nested) return nested;
    const root = nonEmptyString(analysis[key]);
    if (root) return root;
  }
  return LEGACY_VERSION_MARKER;
}

/**
 * Projects legacy JSON into a version-pinned compatibility view. Legacy skills/conclusions are
 * intentionally unsupported until recomputation because their old JSON has no canonical
 * same-version finding/citation chain proving verified contribution.
 */
export function projectLegacyAnalysisRecord(
  source: LegacyAnalysisRecord,
): LegacyReadProjection<LegacyAnalysisRecord, CanonicalLegacyAnalysisView> {
  const parsed = parseLegacyAnalysisJson(source.analysisJson);
  const metadataRecord = isRecord(parsed.analysis.metadata) ? parsed.analysis.metadata : {};
  const deterministicEngineVersion = versionFrom(
    parsed.analysis,
    metadataRecord,
    ["deterministicEngineVersion", "engineVersion"],
  );
  const taxonomyVersion = versionFrom(parsed.analysis, metadataRecord, ["taxonomyVersion"]);
  const analyzedAt = nonEmptyString(metadataRecord.analyzedAt)
    ?? nonEmptyString(source.analyzedAt)
    ?? LEGACY_TIMESTAMP_MARKER;
  const rawConclusions = extractLegacyConclusions(parsed.analysis);
  const events: LegacyReconciliationEvent[] = [];
  const mapped = rawConclusions.map((item) => {
    try {
      const evidenceLevel = parseLegacyEvidenceLevelForMigration(item.rawLevel);
      events.push(event(
        source.sourceTable,
        source.sourceId,
        "mapping",
        `evidence_level:${evidenceLevel}`,
        typeof item.rawLevel === "string" && item.rawLevel !== evidenceLevel
          ? "legacy_title_case"
          : "canonical_value_preserved",
      ));
      return { ...item, evidenceLevel };
    } catch {
      return { ...item, evidenceLevel: null };
    }
  });

  const levelsByClaim = new Map<string, Set<CanonicalEvidenceLevel>>();
  for (const item of mapped) {
    if (item.evidenceLevel === null) continue;
    const claimKey = item.claim?.normalize("NFKC").trim().toLocaleLowerCase("en-US")
      ?? `${item.sourceKind}:${item.sourceIndex}`;
    const levels = levelsByClaim.get(claimKey) ?? new Set<CanonicalEvidenceLevel>();
    levels.add(item.evidenceLevel);
    levelsByClaim.set(claimKey, levels);
  }

  const quarantinedConclusions = mapped.map((item): QuarantinedLegacyConclusion => {
    const claimKey = item.claim?.normalize("NFKC").trim().toLocaleLowerCase("en-US")
      ?? `${item.sourceKind}:${item.sourceIndex}`;
    const quarantineReason: LegacyConclusionQuarantineReason = item.evidenceLevel === null
      ? "unsupported_legacy_evidence_level"
      : (levelsByClaim.get(claimKey)?.size ?? 0) > 1
        ? "contradictory_evidence_levels"
        : "missing_verified_contributor_grounding";
    events.push(event(
      source.sourceTable,
      source.sourceId,
      "quarantine",
      "conclusion_quarantined",
      quarantineReason,
    ));
    return Object.freeze({
      sourceKind: item.sourceKind,
      sourceIndex: item.sourceIndex,
      claim: item.claim,
      evidenceLevel: item.evidenceLevel,
      eligibility: "unsupported",
      quarantineReason,
    });
  });

  if (source.ownerUserId === null) {
    events.push(event(source.sourceTable, source.sourceId, "unresolved_owner", "owner_unresolved", "persisted_owner_missing"));
  }
  events.push(event(
    source.sourceTable,
    source.sourceId,
    "mapping",
    `engine_version:${deterministicEngineVersion}`,
    deterministicEngineVersion === LEGACY_VERSION_MARKER ? "missing_version_default" : "persisted_version",
  ));
  events.push(event(
    source.sourceTable,
    source.sourceId,
    "mapping",
    `taxonomy_version:${taxonomyVersion}`,
    taxonomyVersion === LEGACY_VERSION_MARKER ? "missing_version_default" : "persisted_version",
  ));

  const recomputeReasons = new Set<string>();
  if (parsed.malformed) recomputeReasons.add("malformed_legacy_analysis_json");
  if (deterministicEngineVersion === LEGACY_VERSION_MARKER) recomputeReasons.add("missing_engine_version");
  if (taxonomyVersion === LEGACY_VERSION_MARKER) recomputeReasons.add("missing_taxonomy_version");
  for (const conclusion of quarantinedConclusions) recomputeReasons.add(conclusion.quarantineReason);
  if (recomputeReasons.size === 0) recomputeReasons.add("legacy_analysis_requires_canonical_recomputation");
  const sortedRecomputeReasons = [...recomputeReasons].sort((left, right) => left.localeCompare(right, "en"));
  for (const reason of sortedRecomputeReasons) {
    events.push(event(source.sourceTable, source.sourceId, "recompute", "recompute_required", reason));
  }

  const metadata: CanonicalAnalysisMetadata = CanonicalAnalysisMetadataSchema.parse({
    analysisVersionId: source.sourceId,
    analyzedAt,
    deterministicEngineVersion,
    taxonomyVersion,
    requisitionVersionId: nullableString(metadataRecord.requisitionVersionId),
    aiRequestSchemaVersion: nullableString(metadataRecord.aiRequestSchemaVersion),
    providerId: nullableString(metadataRecord.providerId) ?? nullableString(metadataRecord.aiProvider),
    modelId: nullableString(metadataRecord.modelId) ?? nullableString(metadataRecord.aiModel),
    promptVersion: nullableString(metadataRecord.promptVersion),
    pricingVersion: nullableString(metadataRecord.pricingVersion),
    isDemo: booleanValue(source.isDemo, false),
  });

  return Object.freeze({
    source,
    view: Object.freeze({
      analysisVersionId: source.sourceId,
      ownerUserId: source.ownerUserId ?? null,
      candidateId: source.candidateId,
      metadata,
      evidence: Object.freeze(mapped.map((item) => Object.freeze({
        sourceKind: item.sourceKind,
        sourceIndex: item.sourceIndex,
        claim: item.claim,
        evidenceLevel: item.evidenceLevel,
      }))),
      quarantinedConclusions: Object.freeze(quarantinedConclusions),
      recomputeRequired: true,
      recomputeReasons: Object.freeze(sortedRecomputeReasons),
      legacyAggregates: Object.freeze({
        evidenceIndex: finiteInteger(source.evidenceIndex),
        verifiedClaimCount: finiteInteger(source.verifiedClaimCount),
      }),
      sourceJsonPreserved: true,
      legacyMarker: LEGACY_VERSION_MARKER,
    }),
    reconciliationEvents: Object.freeze(events),
  });
}

export interface LegacyAccountRecord extends Readonly<Record<string, unknown>> {
  readonly sourceTable?: "users" | "codeproof_users" | string;
  readonly sourceId?: string;
  readonly id: string;
  readonly email: string;
  readonly createdAt?: string;
  readonly created_at?: string;
}

export interface CanonicalLegacyAccountView extends AccountRemediationFields {
  readonly id: string;
  readonly email: string;
  readonly createdAt: string;
  readonly legacyMarker: typeof LEGACY_VERSION_MARKER;
}

/** Projects account extension defaults without ever inferring admin, suspension, deletion, or demo state. */
export function projectLegacyAccountRecord(
  source: LegacyAccountRecord,
): LegacyReadProjection<LegacyAccountRecord, CanonicalLegacyAccountView> {
  const sourceTable = source.sourceTable ?? "users";
  const sourceId = source.sourceId ?? source.id;
  const parsedRole = AccountRoleSchema.safeParse(source.role);
  const lifecycleValue = source.lifecycleState ?? source.lifecycle_state;
  const parsedLifecycle = AccountLifecycleStateSchema.safeParse(lifecycleValue);
  const role = parsedRole.success ? parsedRole.data : "RECRUITER";
  const lifecycleState = parsedLifecycle.success ? parsedLifecycle.data : "active";
  const isDemo = booleanValue(source.isDemo ?? source.is_demo, false);
  const fields: AccountRemediationFields = AccountRemediationFieldsSchema.parse({
    role,
    lifecycleState,
    isDemo,
    demoLabel: nullableString(source.demoLabel ?? source.demo_label),
    companyName: nullableString(source.companyName ?? source.company_name),
    planTierId: nullableString(source.planTierId ?? source.plan_tier_id),
    lastActivityAt: nullableString(source.lastActivityAt ?? source.last_activity_at),
    softDeletedAt: nullableString(source.softDeletedAt ?? source.soft_deleted_at),
    suspendedAt: nullableString(source.suspendedAt ?? source.suspended_at),
  });
  const events = [
    event(sourceTable, sourceId, "mapping", `account_role:${role}`, parsedRole.success ? "persisted_value" : "safe_legacy_default"),
    event(sourceTable, sourceId, "mapping", `account_lifecycle:${lifecycleState}`, parsedLifecycle.success ? "persisted_value" : "safe_legacy_default"),
    event(sourceTable, sourceId, "mapping", `account_demo:${isDemo ? "demo" : "real"}`, "persisted_or_safe_default"),
  ];

  return Object.freeze({
    source,
    view: Object.freeze({
      id: source.id,
      email: source.email,
      createdAt: nonEmptyString(source.createdAt ?? source.created_at) ?? LEGACY_TIMESTAMP_MARKER,
      ...fields,
      legacyMarker: LEGACY_VERSION_MARKER,
    }),
    reconciliationEvents: Object.freeze(events),
  });
}

export interface LegacyRequirementRecord extends Readonly<Record<string, unknown>> {
  readonly id: string;
  readonly requirement?: string;
  readonly capabilityId?: string;
  readonly importance?: string;
  readonly category?: string;
  readonly position?: number;
}

export interface LegacyRequisitionRecord {
  readonly sourceTable: "company_requirements" | "codeproof_company_requirements" | string;
  readonly sourceId: string;
  readonly ownerUserId: string | null;
  readonly requisitionId: string;
  readonly versionId: string;
  readonly createdAt?: string | null;
  readonly requirements: readonly LegacyRequirementRecord[];
}

export interface CanonicalLegacyRequisitionView {
  readonly id: string;
  readonly ownerUserId: string | null;
  readonly requisitionId: string;
  readonly version: 1;
  readonly criteria: RequisitionVersion["criteria"];
  readonly contentHash: string;
  readonly createdAt: string;
  readonly recomputeRequired: boolean;
  readonly recomputeReasons: readonly string[];
  readonly sourceRequirementsPreserved: true;
  readonly schemaVersion: typeof LEGACY_VERSION_MARKER;
  readonly legacyMarker: typeof LEGACY_VERSION_MARKER;
}

function stableRequirementSnapshot(requirements: readonly LegacyRequirementRecord[]): string {
  return JSON.stringify([...requirements]
    .map((item) => ({
      id: item.id,
      requirement: item.requirement ?? null,
      capabilityId: item.capabilityId ?? null,
      importance: item.importance ?? null,
      category: item.category ?? null,
      position: finiteInteger(item.position),
    }))
    .sort((left, right) => (left.position ?? Number.MAX_SAFE_INTEGER) - (right.position ?? Number.MAX_SAFE_INTEGER)
      || left.id.localeCompare(right.id, "en")));
}

/** Preserves free-text requirements and maps only explicitly persisted canonical capability IDs. */
export function projectLegacyRequisitionRecord(
  source: LegacyRequisitionRecord,
): LegacyReadProjection<LegacyRequisitionRecord, CanonicalLegacyRequisitionView> {
  const events: LegacyReconciliationEvent[] = [];
  if (source.ownerUserId === null) {
    events.push(event(source.sourceTable, source.sourceId, "unresolved_owner", "owner_unresolved", "persisted_owner_missing"));
  }

  const criteria = [...source.requirements]
    .sort((left, right) => (finiteInteger(left.position) ?? Number.MAX_SAFE_INTEGER)
      - (finiteInteger(right.position) ?? Number.MAX_SAFE_INTEGER)
      || left.id.localeCompare(right.id, "en"))
    .flatMap((requirement) => {
      const capabilityId = nonEmptyString(requirement.capabilityId);
      const importance = z.enum(["required", "preferred", "context"]).safeParse(requirement.importance);
      if (!capabilityId || !importance.success) {
        events.push(event(
          source.sourceTable,
          requirement.id,
          "recompute",
          "recompute_required",
          !capabilityId ? "missing_canonical_capability" : "unsupported_requirement_importance",
        ));
        return [];
      }
      events.push(event(source.sourceTable, requirement.id, "mapping", "requisition_criterion:mapped", "explicit_persisted_capability"));
      return [Object.freeze({ id: requirement.id, capabilityId, importance: importance.data })];
    });

  const recomputeReasons = [...new Set(events
    .filter((item) => item.category === "recompute")
    .flatMap((item) => item.reason ? [item.reason] : []))]
    .sort((left, right) => left.localeCompare(right, "en"));
  events.push(event(source.sourceTable, source.sourceId, "mapping", "requisition_schema_version:legacy", "legacy_projection"));

  return Object.freeze({
    source,
    view: Object.freeze({
      id: source.versionId,
      ownerUserId: source.ownerUserId,
      requisitionId: source.requisitionId,
      version: 1,
      criteria: Object.freeze(criteria),
      contentHash: sha256(stableRequirementSnapshot(source.requirements)),
      createdAt: nonEmptyString(source.createdAt) ?? LEGACY_TIMESTAMP_MARKER,
      recomputeRequired: recomputeReasons.length > 0 || source.ownerUserId === null,
      recomputeReasons: Object.freeze(recomputeReasons),
      sourceRequirementsPreserved: true,
      schemaVersion: LEGACY_VERSION_MARKER,
      legacyMarker: LEGACY_VERSION_MARKER,
    }),
    reconciliationEvents: Object.freeze(events),
  });
}

const IdentifierSchema = z.string().trim().min(1).max(200);
const IsoDateTimeSchema = z.string().datetime({ offset: true });

/** New repository writes require exact canonical provenance values. */
export const CanonicalCandidateRepositoryWriteSchema = z.object({
  id: IdentifierSchema,
  ownerUserId: IdentifierSchema,
  candidateId: IdentifierSchema,
  repositoryUrl: z.string().url(),
  repositoryOwner: z.string().trim().min(1).max(300).nullable(),
  repositoryName: z.string().trim().min(1).max(300),
  discoveryOrigin: DiscoveryOriginSchema,
  attributionStatus: AttributionStatusSchema,
  attributionUpdatedAt: IsoDateTimeSchema,
  verificationRevision: z.string().trim().min(1).max(200).nullable(),
  linkedProviderIdentityId: IdentifierSchema.nullable(),
  originConfirmationRequired: z.literal(false),
}).strict();
export type CanonicalCandidateRepositoryWrite = z.infer<typeof CanonicalCandidateRepositoryWriteSchema>;

export const CanonicalAnalysisWriteSchema = z.object({
  metadata: CanonicalAnalysisMetadataSchema,
  evidenceLevels: z.array(CanonicalEvidenceLevelSchema),
  conclusions: z.array(CandidateConclusionSchema),
}).strict().superRefine((value, context) => {
  if (value.metadata.deterministicEngineVersion === LEGACY_VERSION_MARKER) {
    context.addIssue({ code: "custom", path: ["metadata", "deterministicEngineVersion"], message: "New writes require a current engine version" });
  }
  if (value.metadata.taxonomyVersion === LEGACY_VERSION_MARKER) {
    context.addIssue({ code: "custom", path: ["metadata", "taxonomyVersion"], message: "New writes require a current taxonomy version" });
  }
});
export type CanonicalAnalysisWrite = z.infer<typeof CanonicalAnalysisWriteSchema>;

export const CanonicalAccountWriteSchema = AccountRemediationFieldsSchema;
export type CanonicalAccountWrite = z.infer<typeof CanonicalAccountWriteSchema>;

export const CanonicalRequisitionWriteSchema = RequisitionVersionSchema;
export type CanonicalRequisitionWrite = z.infer<typeof CanonicalRequisitionWriteSchema>;

export function parseCanonicalCandidateRepositoryWrite(value: unknown): CanonicalCandidateRepositoryWrite {
  return CanonicalCandidateRepositoryWriteSchema.parse(value);
}

export function parseCanonicalAnalysisWrite(value: unknown): CanonicalAnalysisWrite {
  return CanonicalAnalysisWriteSchema.parse(value);
}

export function parseCanonicalAccountWrite(value: unknown): CanonicalAccountWrite {
  return CanonicalAccountWriteSchema.parse(value);
}

export function parseCanonicalRequisitionWrite(value: unknown): CanonicalRequisitionWrite {
  return CanonicalRequisitionWriteSchema.parse(value);
}

export type LegacyReconciliationAdapter = "memory" | "sqlite" | "postgresql";

export interface LegacyReconciliationCount {
  readonly sourceTable: string;
  readonly category: LegacyReconciliationCategory;
  readonly outcome: string;
  readonly reason: string | null;
  readonly count: number;
}

export interface LegacyReconciliationReport {
  readonly version: "legacy-reconciliation.v1";
  readonly adapter: LegacyReconciliationAdapter;
  readonly sourceRecordCount: number;
  readonly eventCount: number;
  readonly mappingCount: number;
  readonly unresolvedOwnerCount: number;
  readonly unresolvedOriginCount: number;
  readonly recomputeCount: number;
  readonly quarantineCount: number;
  readonly counts: readonly LegacyReconciliationCount[];
}

const CATEGORY_ORDER: Readonly<Record<LegacyReconciliationCategory, number>> = Object.freeze({
  mapping: 0,
  unresolved_owner: 1,
  unresolved_origin: 2,
  recompute: 3,
  quarantine: 4,
});

/** Aggregates events without timestamps or source ordering, yielding byte-stable deterministic counts. */
export function buildLegacyReconciliationReport(
  adapter: LegacyReconciliationAdapter,
  events: readonly LegacyReconciliationEvent[],
): LegacyReconciliationReport {
  const grouped = new Map<string, LegacyReconciliationCount>();
  for (const item of events) {
    const key = JSON.stringify([item.sourceTable, item.category, item.outcome, item.reason]);
    const existing = grouped.get(key);
    grouped.set(key, Object.freeze({
      sourceTable: item.sourceTable,
      category: item.category,
      outcome: item.outcome,
      reason: item.reason,
      count: (existing?.count ?? 0) + 1,
    }));
  }
  const counts = [...grouped.values()].sort((left, right) =>
    left.sourceTable.localeCompare(right.sourceTable, "en")
    || CATEGORY_ORDER[left.category] - CATEGORY_ORDER[right.category]
    || left.outcome.localeCompare(right.outcome, "en")
    || (left.reason ?? "").localeCompare(right.reason ?? "", "en"));
  const countCategory = (category: LegacyReconciliationCategory) => events
    .filter((item) => item.category === category).length;

  return Object.freeze({
    version: "legacy-reconciliation.v1",
    adapter,
    sourceRecordCount: new Set(events.map((item) => `${item.sourceTable}\0${item.sourceId}`)).size,
    eventCount: events.length,
    mappingCount: countCategory("mapping"),
    unresolvedOwnerCount: countCategory("unresolved_owner"),
    unresolvedOriginCount: countCategory("unresolved_origin"),
    recomputeCount: countCategory("recompute"),
    quarantineCount: countCategory("quarantine"),
    counts: Object.freeze(counts),
  });
}

interface LegacyMigrationMarkerRow extends QueryResultRow {
  source_table: string;
  source_id: string;
  target_table: string;
  status: "backfilled" | "owner_unresolved" | "recompute_required";
  detail_json: string | Readonly<Record<string, unknown>>;
}

function parsedMarkerDetail(value: LegacyMigrationMarkerRow["detail_json"]): Readonly<Record<string, unknown>> {
  if (isRecord(value)) return value;
  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function defaultRecomputeReason(targetTable: string): string {
  if (targetTable.endsWith("analysis_versions")) return "legacy_analysis_requires_canonical_recomputation";
  if (targetTable.endsWith("requisition_versions")) return "legacy_requisition_requires_canonicalization";
  if (targetTable.endsWith("candidate_conclusions")) return "legacy_conclusion_requires_recomputation";
  return "legacy_record_requires_recomputation";
}

function markerEvents(rows: readonly LegacyMigrationMarkerRow[]): LegacyReconciliationEvent[] {
  return rows.flatMap((row) => {
    const detail = parsedMarkerDetail(row.detail_json);
    const events: LegacyReconciliationEvent[] = [];
    if (row.status === "backfilled") {
      events.push(event(row.source_table, row.source_id, "mapping", `backfilled:${row.target_table}`, "source_preserved"));
    } else if (row.status === "owner_unresolved") {
      events.push(event(row.source_table, row.source_id, "unresolved_owner", "owner_unresolved", "persisted_owner_missing"));
    } else {
      events.push(event(
        row.source_table,
        row.source_id,
        "recompute",
        "recompute_required",
        nonEmptyString(detail.recomputeReason) ?? defaultRecomputeReason(row.target_table),
      ));
    }

    const attributionStatus = AttributionStatusSchema.safeParse(detail.attributionStatus);
    if (attributionStatus.success) {
      events.push(event(row.source_table, row.source_id, "mapping", `attribution:${attributionStatus.data}`, "migration_projection"));
    }
    const discoveryOrigin = DiscoveryOriginSchema.safeParse(detail.discoveryOrigin);
    if (discoveryOrigin.success) {
      events.push(event(row.source_table, row.source_id, "mapping", `origin:${discoveryOrigin.data}`, "migration_projection"));
    }
    if (booleanValue(detail.originConfirmationRequired, false)) {
      events.push(event(
        row.source_table,
        row.source_id,
        "unresolved_origin",
        "origin_confirmation_required",
        "persisted_discovery_provenance_unavailable",
      ));
    }
    for (const [key, prefix] of [
      ["deterministicEngineVersion", "engine_version"],
      ["taxonomyVersion", "taxonomy_version"],
    ] as const) {
      const version = nonEmptyString(detail[key]);
      if (version) events.push(event(row.source_table, row.source_id, "mapping", `${prefix}:${version}`, "migration_projection"));
    }
    const quarantineReason = nonEmptyString(detail.quarantineReason);
    if (quarantineReason) {
      events.push(event(row.source_table, row.source_id, "quarantine", "conclusion_quarantined", quarantineReason));
    }
    return events;
  });
}

/** Reads the persisted SQLite migration audit without changing migration or source rows. */
export function readSQLiteLegacyReconciliationReport(db: DatabaseSync): LegacyReconciliationReport {
  const table = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'legacy_migration_markers'").get();
  if (!table) return buildLegacyReconciliationReport("sqlite", []);
  const rows = db.prepare(`SELECT source_table, source_id, target_table, status, detail_json
    FROM legacy_migration_markers ORDER BY source_table, source_id, target_table`).all() as unknown as LegacyMigrationMarkerRow[];
  return buildLegacyReconciliationReport("sqlite", markerEvents(rows));
}

/** Reads the PostgreSQL parity audit using the same pure normalization as SQLite. */
export async function readPostgreSQLLegacyReconciliationReport(
  database: Pool | PoolClient,
): Promise<LegacyReconciliationReport> {
  const result = await database.query<LegacyMigrationMarkerRow>(`SELECT source_table, source_id, target_table,
    status, detail_json FROM codeproof_legacy_migration_markers
    ORDER BY source_table, source_id, target_table`);
  return buildLegacyReconciliationReport("postgresql", markerEvents(result.rows));
}
