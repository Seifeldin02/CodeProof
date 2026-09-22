import { z } from "zod";

const IdentifierSchema = z.string().trim().min(1).max(200);
const VersionSchema = z.string().trim().min(1).max(100);
const IsoDateTimeSchema = z.string().datetime({ offset: true });
const NullableIsoDateTimeSchema = IsoDateTimeSchema.nullable();
const NonNegativeIntegerSchema = z.number().int().nonnegative();
const PositiveIntegerSchema = z.number().int().positive();
const IntegerMicrosSchema = z.string().regex(/^\d+$/, "Expected non-negative integer micros");
const DigestSchema = z.string().regex(/^[a-f0-9]{64}$/i, "Expected a 64-character hexadecimal digest");
const JsonRecordSchema = z.record(z.string(), z.unknown());

export const ATTRIBUTION_STATUSES = [
  "unverified",
  "candidate_claimed",
  "verified_owner",
  "verified_contributor",
] as const;
export const AttributionStatusSchema = z.enum(ATTRIBUTION_STATUSES);
export type AttributionStatus = z.infer<typeof AttributionStatusSchema>;

export const DISCOVERY_ORIGINS = [
  "CV",
  "portfolio",
  "GitHub profile",
  "manual entry",
] as const;
export const DiscoveryOriginSchema = z.enum(DISCOVERY_ORIGINS);
export type DiscoveryOrigin = z.infer<typeof DiscoveryOriginSchema>;

export const CANONICAL_EVIDENCE_LEVELS = [
  "strong",
  "good",
  "partial",
  "limited",
  "insufficient",
] as const;
export const CanonicalEvidenceLevelSchema = z.enum(CANONICAL_EVIDENCE_LEVELS);
export type CanonicalEvidenceLevel = z.infer<typeof CanonicalEvidenceLevelSchema>;

export const CONCLUSION_EVIDENCE_LEVELS = ["strong", "good", "partial"] as const;
export const ConclusionEvidenceLevelSchema = z.enum(CONCLUSION_EVIDENCE_LEVELS);
export type ConclusionEvidenceLevel = z.infer<typeof ConclusionEvidenceLevelSchema>;

export const DetectorSignalClassSchema = z.enum([
  "implementation",
  "test",
  "architecture",
  "dependency",
  "configuration",
  "documentation",
  "generated",
  "trivial",
]);
export type DetectorSignalClass = z.infer<typeof DetectorSignalClassSchema>;

export const DetectorFindingSchema = z.object({
  id: IdentifierSchema,
  detectorId: IdentifierSchema,
  detectorVersion: VersionSchema,
  capabilityId: IdentifierSchema,
  signalClass: DetectorSignalClassSchema,
  repositoryId: IdentifierSchema,
  revision: z.string().min(1).max(200).nullable(),
  filePath: z.string().min(1).max(1_000),
  symbol: z.string().min(1).max(500).nullable(),
  startLine: PositiveIntegerSchema.nullable(),
  endLine: PositiveIntegerSchema.nullable(),
  excerptStartOffset: NonNegativeIntegerSchema.nullable(),
  excerptEndOffset: NonNegativeIntegerSchema.nullable(),
}).strict();
export type DetectorFinding = z.infer<typeof DetectorFindingSchema>;

export const EvidenceCitationSchema = z.object({
  id: IdentifierSchema,
  findingId: IdentifierSchema,
  detectorId: IdentifierSchema,
  detectorVersion: VersionSchema,
  repositoryId: IdentifierSchema,
  repositoryUrl: z.string().url(),
  repositoryName: z.string().min(1).max(300),
  revision: z.string().min(1).max(200).nullable(),
  revisionAvailability: z.enum(["available", "unavailable"]),
  filePath: z.string().min(1).max(1_000),
  symbol: z.string().min(1).max(500).nullable(),
  startLine: PositiveIntegerSchema.nullable(),
  endLine: PositiveIntegerSchema.nullable(),
  excerpt: z.string().max(800).nullable(),
  sourceLink: z.string().url(),
  discoveryOrigin: DiscoveryOriginSchema,
  attributionStatus: AttributionStatusSchema,
  evidenceLevel: CanonicalEvidenceLevelSchema,
  taxonomyVersion: VersionSchema,
}).strict();
export type EvidenceCitation = z.infer<typeof EvidenceCitationSchema>;

export const CandidateConclusionSchema = z.object({
  id: IdentifierSchema,
  analysisVersionId: IdentifierSchema,
  capabilityId: IdentifierSchema,
  evidenceLevel: ConclusionEvidenceLevelSchema,
  citationIds: z.array(IdentifierSchema).min(1),
  eligibility: z.enum(["eligible", "unsupported"]),
  explanation: z.string().min(1).max(3_000),
}).strict();
export type CandidateConclusion = z.infer<typeof CandidateConclusionSchema>;

export const EvidenceQuestionBasisSchema = z.object({
  kind: z.literal("evidence"),
  citationIds: z.array(IdentifierSchema).min(1),
}).strict();

export const GapQuestionBasisSchema = z.object({
  kind: z.literal("gap"),
  missingCapabilityId: IdentifierSchema,
}).strict();

export const QuestionBasisSchema = z.discriminatedUnion("kind", [
  EvidenceQuestionBasisSchema,
  GapQuestionBasisSchema,
]);
export type QuestionBasis = z.infer<typeof QuestionBasisSchema>;

export const ContextSafeInterviewQuestionSchema = z.object({
  id: IdentifierSchema,
  analysisVersionId: IdentifierSchema,
  basis: QuestionBasisSchema,
  attributionGate: AttributionStatusSchema,
  question: z.string().min(1).max(1_000),
  redactionApplied: z.boolean(),
}).strict();
export type ContextSafeInterviewQuestion = z.infer<typeof ContextSafeInterviewQuestionSchema>;

export const ExcludedCorpusMetricSchema = z.object({
  files: NonNegativeIntegerSchema,
  bytes: NonNegativeIntegerSchema,
}).strict();

export const RepositoryCorpusMetricsSchema = z.object({
  rawArchiveEntryCount: NonNegativeIntegerSchema,
  eligibleTextFileCount: NonNegativeIntegerSchema,
  selectedFileCount: NonNegativeIntegerSchema,
  analyzedFileCount: NonNegativeIntegerSchema,
  downloadedArchiveBytes: NonNegativeIntegerSchema,
  eligibleTextBytes: NonNegativeIntegerSchema,
  selectedTextBytes: NonNegativeIntegerSchema,
  analyzedTextBytes: NonNegativeIntegerSchema,
  excludedByReason: z.record(z.string().min(1), ExcludedCorpusMetricSchema),
  limits: z.record(z.string().min(1), NonNegativeIntegerSchema),
}).strict();
export type RepositoryCorpusMetrics = z.infer<typeof RepositoryCorpusMetricsSchema>;

export const AttributionCountsSchema = z.object({
  unverified: NonNegativeIntegerSchema,
  candidate_claimed: NonNegativeIntegerSchema,
  verified_owner: NonNegativeIntegerSchema,
  verified_contributor: NonNegativeIntegerSchema,
}).strict();
export type AttributionCounts = z.infer<typeof AttributionCountsSchema>;

export const RepositoryRunMetricsSchema = z.object({
  state: z.enum(["running", "completed"]),
  selectedRepositoryCount: NonNegativeIntegerSchema,
  successfulRepositoryCount: NonNegativeIntegerSchema,
  failedRepositoryCount: NonNegativeIntegerSchema,
  pendingRepositoryCount: NonNegativeIntegerSchema,
  attributionCounts: AttributionCountsSchema,
}).strict();
export type RepositoryRunMetrics = z.infer<typeof RepositoryRunMetricsSchema>;

export const CanonicalAnalysisMetadataSchema = z.object({
  analysisVersionId: IdentifierSchema,
  analyzedAt: IsoDateTimeSchema,
  deterministicEngineVersion: VersionSchema,
  taxonomyVersion: VersionSchema,
  requisitionVersionId: IdentifierSchema.nullable(),
  aiRequestSchemaVersion: VersionSchema.nullable(),
  providerId: IdentifierSchema.nullable(),
  modelId: IdentifierSchema.nullable(),
  promptVersion: VersionSchema.nullable(),
  pricingVersion: VersionSchema.nullable(),
  isDemo: z.boolean(),
}).strict();
export type CanonicalAnalysisMetadata = z.infer<typeof CanonicalAnalysisMetadataSchema>;

export const RequisitionCriterionSchema = z.object({
  id: IdentifierSchema,
  capabilityId: IdentifierSchema,
  importance: z.enum(["required", "preferred", "context"]),
}).strict().readonly();
export type RequisitionCriterion = z.infer<typeof RequisitionCriterionSchema>;

export const RequisitionVersionSchema = z.object({
  id: IdentifierSchema,
  ownerUserId: IdentifierSchema,
  requisitionId: IdentifierSchema,
  version: PositiveIntegerSchema,
  criteria: z.array(RequisitionCriterionSchema).readonly(),
  contentHash: DigestSchema,
  createdAt: IsoDateTimeSchema,
}).strict().readonly();
export type RequisitionVersion = z.infer<typeof RequisitionVersionSchema>;

export const ComparisonFactorSchema = z.object({
  criterionId: IdentifierSchema,
  level: ConclusionEvidenceLevelSchema,
  citationIds: z.array(IdentifierSchema).min(1),
}).strict();
export type ComparisonFactor = z.infer<typeof ComparisonFactorSchema>;

export const ComparisonUncertaintySchema = z.object({
  criterionId: IdentifierSchema,
  reason: z.enum(["evidence_gap", "unverified_only"]),
}).strict();
export type ComparisonUncertainty = z.infer<typeof ComparisonUncertaintySchema>;

export const CandidateComparisonResultSchema = z.object({
  candidateId: IdentifierSchema,
  analysisVersionId: IdentifierSchema,
  factors: z.array(ComparisonFactorSchema),
  uncertainties: z.array(ComparisonUncertaintySchema),
}).strict();
export type CandidateComparisonResult = z.infer<typeof CandidateComparisonResultSchema>;

export const ComparisonResultSchema = z.object({
  candidates: z.array(CandidateComparisonResultSchema),
}).strict();
export type ComparisonResult = z.infer<typeof ComparisonResultSchema>;

export const SavedComparisonSchema = z.object({
  id: IdentifierSchema,
  ownerUserId: IdentifierSchema,
  requisitionVersionId: IdentifierSchema,
  candidateAnalysisVersionIds: z.array(IdentifierSchema).min(1),
  result: ComparisonResultSchema,
  createdAt: IsoDateTimeSchema,
}).strict();
export type SavedComparison = z.infer<typeof SavedComparisonSchema>;

export const ReviewOrderEntrySchema = CandidateComparisonResultSchema.extend({
  stableTieBreakKey: z.string().min(1).max(500),
}).strict();
export type ReviewOrderEntry = z.infer<typeof ReviewOrderEntrySchema>;

export const ReviewOrderSchema = z.object({
  id: IdentifierSchema,
  ownerUserId: IdentifierSchema,
  requisitionVersionId: IdentifierSchema,
  status: z.literal("draft"),
  entries: z.array(ReviewOrderEntrySchema),
  createdAt: IsoDateTimeSchema,
}).strict();
export type ReviewOrder = z.infer<typeof ReviewOrderSchema>;

export const EvidenceCheckedMarkSchema = z.object({
  ownerUserId: IdentifierSchema,
  candidateId: IdentifierSchema,
  analysisVersionId: IdentifierSchema,
  requisitionVersionId: IdentifierSchema,
  checkedAt: IsoDateTimeSchema,
}).strict();
export type EvidenceCheckedMark = z.infer<typeof EvidenceCheckedMarkSchema>;

export const SHARE_EXPIRY_OPTIONS = ["24h", "7d", "30d"] as const;
export const ShareExpiryOptionSchema = z.enum(SHARE_EXPIRY_OPTIONS);
export type ShareExpiryOption = z.infer<typeof ShareExpiryOptionSchema>;

export const ExternalShareStatusSchema = z.enum(["active", "expired", "revoked"]);
export type ExternalShareStatus = z.infer<typeof ExternalShareStatusSchema>;

export const ExternalShareWriteSchema = z.object({
  id: IdentifierSchema,
  ownerUserId: IdentifierSchema,
  candidateId: IdentifierSchema,
  analysisVersionId: IdentifierSchema,
  tokenDigest: DigestSchema,
  expiryOption: ShareExpiryOptionSchema,
  expiresAt: IsoDateTimeSchema,
  revokedAt: NullableIsoDateTimeSchema,
  passcodeRequired: z.boolean(),
  passcodeDigest: DigestSchema.nullable(),
  emailVerificationRequired: z.boolean(),
  emailAddressDigest: DigestSchema.nullable(),
  isDemo: z.boolean(),
  createdAt: IsoDateTimeSchema,
}).strict();
export type ExternalShareWrite = z.infer<typeof ExternalShareWriteSchema>;

export const ExternalShareSummarySchema = z.object({
  id: IdentifierSchema,
  candidateId: IdentifierSchema,
  analysisVersionId: IdentifierSchema,
  status: ExternalShareStatusSchema,
  expiryOption: ShareExpiryOptionSchema,
  expiresAt: IsoDateTimeSchema,
  passcodeRequired: z.boolean(),
  emailVerificationRequired: z.boolean(),
  isDemo: z.boolean(),
  createdAt: IsoDateTimeSchema,
}).strict();
export type ExternalShareSummary = z.infer<typeof ExternalShareSummarySchema>;

export const ShareGrantScopeSchema = z.object({
  shareId: IdentifierSchema,
  candidateId: IdentifierSchema,
  analysisVersionId: IdentifierSchema,
  ownerUserId: IdentifierSchema,
}).strict();
export type ShareGrantScope = z.infer<typeof ShareGrantScopeSchema>;

export const ShareAccessOutcomeSchema = z.enum([
  "granted",
  "denied_invalid",
  "denied_expired",
  "denied_revoked",
  "denied_passcode",
  "denied_email_verification",
  "rate_limited",
]);
export type ShareAccessOutcome = z.infer<typeof ShareAccessOutcomeSchema>;

export const ShareAccessLogEntrySchema = z.object({
  id: IdentifierSchema,
  shareId: IdentifierSchema,
  occurredAt: IsoDateTimeSchema,
  outcome: ShareAccessOutcomeSchema,
  appliedControls: z.array(z.enum(["passcode", "email_verification"])),
  ipFingerprint: DigestSchema,
  userAgentFamily: z.string().min(1).max(200).nullable(),
  coarseRegion: z.string().min(1).max(100).nullable(),
  isDemo: z.boolean(),
}).strict();
export type ShareAccessLogEntry = z.infer<typeof ShareAccessLogEntrySchema>;

export const EnterpriseSharingExtensionPointSchema = z.object({
  id: IdentifierSchema,
  entitlementId: IdentifierSchema,
  availability: z.literal("planned"),
  capabilityLabelKey: IdentifierSchema,
}).strict();
export type EnterpriseSharingExtensionPoint = z.infer<typeof EnterpriseSharingExtensionPointSchema>;

export const AiTelemetryRecordSchema = z.object({
  id: IdentifierSchema,
  ownerUserId: IdentifierSchema,
  operation: IdentifierSchema,
  providerId: IdentifierSchema.nullable(),
  modelId: IdentifierSchema.nullable(),
  status: z.enum(["success", "failed", "fallback", "skipped"]),
  fallbackReason: z.string().min(1).max(500).nullable(),
  latencyMs: NonNegativeIntegerSchema,
  cacheStatus: z.enum(["hit", "miss", "not_applicable"]),
  attemptCount: NonNegativeIntegerSchema,
  inputUnits: NonNegativeIntegerSchema.nullable(),
  cachedInputUnits: NonNegativeIntegerSchema.nullable(),
  outputUnits: NonNegativeIntegerSchema.nullable(),
  estimatedCostMicros: IntegerMicrosSchema.nullable(),
  actualCostMicros: IntegerMicrosSchema.nullable(),
  actualCostStatus: z.enum(["available", "unavailable"]),
  currency: z.literal("USD").nullable(),
  pricingVersion: VersionSchema.nullable(),
  schemaVersion: VersionSchema,
  promptVersion: VersionSchema,
  taxonomyVersion: VersionSchema,
  isDemo: z.boolean(),
  createdAt: IsoDateTimeSchema,
}).strict();
export type AiTelemetryRecord = z.infer<typeof AiTelemetryRecordSchema>;

export const PILOT_QUOTA_KINDS = [
  "candidates",
  "repository_analyses",
  "paid_ai_usage",
  "active_external_shares",
  "recruiter_seats",
] as const;
export const PilotQuotaKindSchema = z.enum(PILOT_QUOTA_KINDS);
export type PilotQuotaKind = z.infer<typeof PilotQuotaKindSchema>;

export const PilotEntitlementSchema = z.object({
  id: IdentifierSchema,
  enabled: z.boolean(),
}).strict();
export type PilotEntitlement = z.infer<typeof PilotEntitlementSchema>;

export const PilotQuotaSchema = z.object({
  kind: PilotQuotaKindSchema,
  limit: NonNegativeIntegerSchema,
  usagePeriod: z.object({
    id: IdentifierSchema,
    startsAt: IsoDateTimeSchema,
    endsAt: IsoDateTimeSchema,
  }).strict(),
}).strict();
export type PilotQuota = z.infer<typeof PilotQuotaSchema>;

export const PilotTierSchema = z.object({
  id: IdentifierSchema,
  version: VersionSchema,
  displayName: z.object({
    en: z.string().min(1).max(100),
    ar: z.string().min(1).max(100),
  }).strict(),
  entitlements: z.array(PilotEntitlementSchema),
  quotas: z.array(PilotQuotaSchema),
}).strict().readonly();
export type PilotTier = z.infer<typeof PilotTierSchema>;

export const PilotAccessDecisionSchema = z.discriminatedUnion("allowed", [
  z.object({
    allowed: z.literal(true),
    entitlementId: IdentifierSchema,
    quotaKind: PilotQuotaKindSchema.nullable(),
    usage: NonNegativeIntegerSchema.nullable(),
    limit: NonNegativeIntegerSchema.nullable(),
    resetAt: NullableIsoDateTimeSchema,
  }).strict(),
  z.object({
    allowed: z.literal(false),
    reason: z.enum(["entitlement_absent", "quota_exhausted", "account_unavailable"]),
    entitlementId: IdentifierSchema,
    quotaKind: PilotQuotaKindSchema.nullable(),
    usage: NonNegativeIntegerSchema.nullable(),
    limit: NonNegativeIntegerSchema.nullable(),
    resetAt: NullableIsoDateTimeSchema,
  }).strict(),
]);
export type PilotAccessDecision = z.infer<typeof PilotAccessDecisionSchema>;

export const UsageReservationSchema = z.object({
  id: IdentifierSchema,
  ownerUserId: IdentifierSchema,
  idempotencyKey: IdentifierSchema,
  quotaKind: PilotQuotaKindSchema,
  amount: PositiveIntegerSchema,
  status: z.enum(["reserved", "committed", "released", "expired"]),
  isDemo: z.boolean(),
  createdAt: IsoDateTimeSchema,
  expiresAt: IsoDateTimeSchema,
}).strict();
export type UsageReservation = z.infer<typeof UsageReservationSchema>;

export const AccountRoleSchema = z.enum(["RECRUITER", "ADMIN"]);
export type AccountRole = z.infer<typeof AccountRoleSchema>;

export const AccountLifecycleStateSchema = z.enum(["active", "suspended", "soft_deleted"]);
export type AccountLifecycleState = z.infer<typeof AccountLifecycleStateSchema>;

export const AccountRemediationFieldsSchema = z.object({
  role: AccountRoleSchema,
  lifecycleState: AccountLifecycleStateSchema,
  isDemo: z.boolean(),
  demoLabel: z.string().min(1).max(80).nullable(),
  companyName: z.string().min(1).max(300).nullable(),
  planTierId: IdentifierSchema.nullable(),
  lastActivityAt: NullableIsoDateTimeSchema,
  softDeletedAt: NullableIsoDateTimeSchema,
  suspendedAt: NullableIsoDateTimeSchema,
}).strict();
export type AccountRemediationFields = z.infer<typeof AccountRemediationFieldsSchema>;

export const AdminActorSchema = z.object({
  userId: IdentifierSchema,
  email: z.string().email(),
  role: z.literal("ADMIN"),
  lifecycleState: z.literal("active"),
}).strict();
export type AdminActor = z.infer<typeof AdminActorSchema>;

export const AdminDenialReasonSchema = z.enum([
  "no_session",
  "not_admin",
  "account_unavailable",
  "impersonation_active",
  "rate_limited",
]);
export type AdminDenialReason = z.infer<typeof AdminDenialReasonSchema>;

export const AggregatePopulationSchema = z.enum(["real", "demo", "combined"]);
export type AggregatePopulation = z.infer<typeof AggregatePopulationSchema>;

export const DangerousImpersonatedActionCategorySchema = z.enum([
  "password_change",
  "email_change",
  "authentication_method_change",
  "billing_change",
  "payment_method_change",
  "plan_purchase",
  "account_ownership_transfer",
  "account_deletion",
  "admin_role_change",
  "provider_credential_change",
  "secret_disclosure",
]);
export type DangerousImpersonatedActionCategory = z.infer<typeof DangerousImpersonatedActionCategorySchema>;

export const AdminAuditEntrySchema = z.object({
  id: IdentifierSchema,
  sequence: PositiveIntegerSchema,
  occurredAt: IsoDateTimeSchema,
  actorUserId: IdentifierSchema,
  actorRole: AccountRoleSchema,
  impersonatedUserId: IdentifierSchema.nullable(),
  action: IdentifierSchema,
  actionCategory: IdentifierSchema,
  targetKind: z.enum([
    "account",
    "share",
    "candidate",
    "analysis",
    "quota",
    "impersonation_grant",
    "none",
  ]),
  targetId: IdentifierSchema.nullable(),
  outcome: z.enum(["succeeded", "denied", "failed"]),
  denialReason: z.string().min(1).max(500).nullable(),
  parameters: JsonRecordSchema,
  before: JsonRecordSchema.nullable(),
  after: JsonRecordSchema.nullable(),
  requestCorrelationId: IdentifierSchema,
  requestMethod: z.string().min(1).max(20),
  route: z.string().min(1).max(1_000),
  ipFingerprint: DigestSchema,
  userAgentFamily: z.string().min(1).max(200).nullable(),
  previousEntryHash: DigestSchema,
  entryHash: DigestSchema,
}).strict();
export type AdminAuditEntry = z.infer<typeof AdminAuditEntrySchema>;

export const AdminMetricSchema = z.object({
  id: IdentifierSchema,
  value: z.union([z.number(), z.string()]).nullable(),
  availability: z.enum(["available", "unavailable"]),
  unavailableReason: z.enum([
    "no_source_table",
    "no_records_in_period",
    "partial_source",
    "query_failed",
  ]).nullable(),
  population: AggregatePopulationSchema,
  aggregateClass: z.enum(["real_commercial", "combined_operational"]),
  denominator: z.object({
    label: z.string().min(1).max(200),
    value: NonNegativeIntegerSchema.nullable(),
  }).strict(),
  period: z.object({
    start: NullableIsoDateTimeSchema,
    end: NullableIsoDateTimeSchema,
    label: z.string().min(1).max(200),
  }).strict(),
  roundingRule: z.enum(["none", "half_up_0dp", "half_up_1dp", "half_up_2dp"]),
  coverage: z.object({
    observed: NonNegativeIntegerSchema,
    expected: NonNegativeIntegerSchema,
  }).strict().nullable(),
}).strict();
export type AdminMetric = z.infer<typeof AdminMetricSchema>;

export const DemoDesignationSchema = z.object({
  isDemo: z.boolean(),
  demoLabel: z.string().min(1).max(80).nullable(),
  effectiveFrom: IsoDateTimeSchema,
  demoFixtureVersion: VersionSchema.nullable(),
}).strict();
export type DemoDesignation = z.infer<typeof DemoDesignationSchema>;

export function DualPopulationTotalSchema<T extends z.ZodType>(valueSchema: T) {
  return z.object({
    real: valueSchema.nullable(),
    demo: valueSchema.nullable(),
    combined: valueSchema.nullable(),
  }).strict();
}
export type DualPopulationTotal<T> = {
  real: T | null;
  demo: T | null;
  combined: T | null;
};

export const ImpersonationGrantSchema = z.object({
  purpose: z.literal("impersonation.v1"),
  grantId: IdentifierSchema,
  adminActorUserId: IdentifierSchema,
  targetUserId: IdentifierSchema,
  reason: z.string().min(1).max(200),
  startedAt: NonNegativeIntegerSchema,
  expiresAt: NonNegativeIntegerSchema,
  auditEntryId: IdentifierSchema,
}).strict().superRefine((grant, context) => {
  const maximumDurationMs = 60 * 60 * 1_000;
  if (grant.expiresAt <= grant.startedAt || grant.expiresAt - grant.startedAt > maximumDurationMs) {
    context.addIssue({
      code: "custom",
      message: "Impersonation expiry must be after start and no more than 60 minutes later",
      path: ["expiresAt"],
    });
  }
}).readonly();
export type ImpersonationGrant = z.infer<typeof ImpersonationGrantSchema>;

export const RequestPrincipalSchema = z.object({
  actingUserId: IdentifierSchema,
  adminActorUserId: IdentifierSchema.nullable(),
  impersonation: z.object({
    grantId: IdentifierSchema,
    expiresAt: NonNegativeIntegerSchema,
    targetLabel: z.string().min(1).max(300),
  }).strict().nullable(),
}).strict();
export type RequestPrincipal = z.infer<typeof RequestPrincipalSchema>;

export const BuildMetadataSchema = z.object({
  commitSha: z.string().min(1).max(100).nullable(),
  buildId: z.string().min(1).max(200).nullable(),
  environment: z.string().min(1).max(100),
  releaseTimestamp: NullableIsoDateTimeSchema,
  verificationTimestamp: NullableIsoDateTimeSchema,
}).strict();
export type BuildMetadata = z.infer<typeof BuildMetadataSchema>;

export const VERIFICATION_CHECK_IDS = [
  "lint",
  "typecheck",
  "unit",
  "property",
  "integration",
  "e2e",
  "build",
  "migration",
  "browser",
  "security",
  "demo_simulation",
] as const;
export const VerificationCheckIdSchema = z.enum(VERIFICATION_CHECK_IDS);
export type VerificationCheckId = z.infer<typeof VerificationCheckIdSchema>;

export const VerificationOutcomeSchema = z.enum([
  "passed",
  "failed",
  "blocked_live_check",
  "externally_unverifiable",
]);
export type VerificationOutcome = z.infer<typeof VerificationOutcomeSchema>;

export const VerificationCheckSchema = z.object({
  id: VerificationCheckIdSchema,
  command: z.string().min(1).max(2_000),
  outcome: VerificationOutcomeSchema,
  previouslyPassing: z.boolean(),
  detail: z.string().min(1).max(5_000).nullable(),
}).strict();
export type VerificationCheck = z.infer<typeof VerificationCheckSchema>;

export const VerificationCycleSchema = z.object({
  id: IdentifierSchema,
  ordinal: PositiveIntegerSchema,
  commitHash: z.string().min(1).max(100),
  startedAt: IsoDateTimeSchema,
  completedAt: NullableIsoDateTimeSchema,
  checks: z.array(VerificationCheckSchema),
  defectsOpened: z.array(IdentifierSchema),
  defectsClosed: z.array(IdentifierSchema),
  browserConsoleArtifactId: IdentifierSchema.nullable(),
  serverOutputArtifactId: IdentifierSchema.nullable(),
}).strict();
export type VerificationCycle = z.infer<typeof VerificationCycleSchema>;

export const DefectSeveritySchema = z.enum(["critical", "high", "medium", "low"]);
export type DefectSeverity = z.infer<typeof DefectSeveritySchema>;

export const DefectRecordSchema = z.object({
  id: IdentifierSchema,
  severity: DefectSeveritySchema,
  status: z.enum(["open", "resolved"]),
  title: z.string().min(1).max(300),
  detail: z.string().min(1).max(5_000),
  openedAt: IsoDateTimeSchema,
  resolvedAt: NullableIsoDateTimeSchema,
  severityHistory: z.array(z.object({
    from: DefectSeveritySchema.nullable(),
    to: DefectSeveritySchema,
    rationale: z.string().min(1).max(2_000),
    changedAt: IsoDateTimeSchema,
  }).strict()).min(1),
}).strict();
export type DefectRecord = z.infer<typeof DefectRecordSchema>;

export const ReleaseGatePassSchema = z.object({
  passOrdinal: z.union([z.literal(1), z.literal(2)]),
  commitHash: z.string().min(1).max(100),
  startedAt: IsoDateTimeSchema,
  completedAt: IsoDateTimeSchema,
  checkOutcomes: z.array(z.object({
    id: VerificationCheckIdSchema,
    outcome: VerificationOutcomeSchema,
  }).strict()),
  newDefectsDiscovered: z.array(IdentifierSchema),
  resetTriggeredByDefectId: IdentifierSchema.nullable(),
}).strict();
export type ReleaseGatePass = z.infer<typeof ReleaseGatePassSchema>;

export const ReleaseVerificationSchema = z.object({
  id: IdentifierSchema,
  target: z.enum(["local", "vercel_preview", "vercel_production"]),
  deploymentUrl: z.string().url().nullable(),
  buildMetadata: BuildMetadataSchema,
  verifiedAt: IsoDateTimeSchema,
  checks: z.array(VerificationCheckSchema),
}).strict();
export type ReleaseVerification = z.infer<typeof ReleaseVerificationSchema>;

export const RELEASE_DISCLOSURE_STATUSES = [
  "completed",
  "incomplete",
  "blocked",
  "skipped",
  "failed",
  "externally_unverifiable",
] as const;
export const ReleaseDisclosureStatusSchema = z.enum(RELEASE_DISCLOSURE_STATUSES);
export type ReleaseDisclosureStatus = z.infer<typeof ReleaseDisclosureStatusSchema>;

export const ReleaseDisclosureItemSchema = z.object({
  id: IdentifierSchema,
  kind: z.enum(["requirement", "validation_check", "live_check", "migration_path", "browser_mode"]),
  status: ReleaseDisclosureStatusSchema,
  affectedScope: z.string().min(1).max(2_000),
  reason: z.string().min(1).max(5_000).nullable(),
  userImpact: z.string().min(1).max(5_000).nullable(),
  evidence: z.array(z.string().min(1).max(2_000)),
  nextAction: z.string().min(1).max(2_000).nullable(),
}).strict();
export type ReleaseDisclosureItem = z.infer<typeof ReleaseDisclosureItemSchema>;

export const DemoReadinessVerdictSchema = z.object({
  status: z.enum(["ready", "not_ready"]),
  statement: z.string().min(1).max(5_000),
  remainingRisks: z.array(z.string().min(1).max(2_000)),
  knownLimitations: z.array(z.string().min(1).max(2_000)),
}).strict();
export type DemoReadinessVerdict = z.infer<typeof DemoReadinessVerdictSchema>;

export const ReleaseDisclosureSchema = z.object({
  id: IdentifierSchema,
  releaseCommitHash: z.string().min(1).max(100).nullable(),
  generatedAt: IsoDateTimeSchema,
  items: z.array(ReleaseDisclosureItemSchema),
  modifiedFiles: z.array(z.string().min(1).max(1_000)),
  baselineEvidenceIds: z.array(IdentifierSchema),
  postRemediationEvidenceIds: z.array(IdentifierSchema),
  demoReadinessVerdict: DemoReadinessVerdictSchema,
}).strict();
export type ReleaseDisclosure = z.infer<typeof ReleaseDisclosureSchema>;

/**
 * Migration-only schemas and adapters.
 *
 * Never use these at a new write boundary. They exist solely to read Supported
 * Legacy Schema values and return canonical projections without rewriting the
 * original persisted JSON.
 */
export const LegacyAttributionStatusMigrationSchema = z.enum([
  ...ATTRIBUTION_STATUSES,
  "unknown_contributor",
  "unverified_contributor",
]);
export type LegacyAttributionStatusMigration = z.infer<typeof LegacyAttributionStatusMigrationSchema>;

export interface LegacyAttributionProof {
  readonly hasCandidateSourceClaim?: boolean;
  readonly hasAuthenticatedProviderIdentity?: boolean;
  readonly hasRepositoryIdentity?: boolean;
  readonly hasImmutableRevision?: boolean;
  readonly hasRepositoryOwnershipProof?: boolean;
}

export function parseLegacyAttributionStatusForMigration(
  value: unknown,
  proof: LegacyAttributionProof = {},
): AttributionStatus {
  const parsed = LegacyAttributionStatusMigrationSchema.nullish().parse(value);
  if (parsed === "candidate_claimed" && proof.hasCandidateSourceClaim) {
    return "candidate_claimed";
  }
  if (
    parsed === "verified_owner"
    && proof.hasAuthenticatedProviderIdentity
    && proof.hasRepositoryIdentity
    && proof.hasRepositoryOwnershipProof
  ) {
    return "verified_owner";
  }
  if (
    parsed === "verified_contributor"
    && proof.hasAuthenticatedProviderIdentity
    && proof.hasRepositoryIdentity
    && proof.hasImmutableRevision
  ) {
    return "verified_contributor";
  }
  return "unverified";
}

export const LegacyDiscoveryOriginMigrationSchema = z.enum([
  ...DISCOVERY_ORIGINS,
  "cv_link",
  "recruiter_entry",
  "profile_discovery",
  "git_provider",
]);
export type LegacyDiscoveryOriginMigration = z.infer<typeof LegacyDiscoveryOriginMigrationSchema>;

export const MigrationDiscoveryOriginResultSchema = z.object({
  origin: DiscoveryOriginSchema.nullable(),
  originConfirmationRequired: z.boolean(),
}).strict();
export type MigrationDiscoveryOriginResult = z.infer<typeof MigrationDiscoveryOriginResultSchema>;

export function parseLegacyDiscoveryOriginForMigration(
  value: unknown,
  persistedProviderDiscoveryOrigin?: DiscoveryOrigin,
): MigrationDiscoveryOriginResult {
  const parsed = LegacyDiscoveryOriginMigrationSchema.nullish().parse(value);
  const canonical = DiscoveryOriginSchema.safeParse(parsed);
  if (canonical.success) {
    return { origin: canonical.data, originConfirmationRequired: false };
  }

  const mapped = parsed === "cv_link"
    ? "CV"
    : parsed === "recruiter_entry"
      ? "manual entry"
      : parsed === "profile_discovery"
        ? "GitHub profile"
        : parsed === "git_provider"
          ? persistedProviderDiscoveryOrigin ?? null
          : null;

  return {
    origin: mapped,
    originConfirmationRequired: mapped === null,
  };
}

export const LEGACY_EVIDENCE_LEVELS = [
  "Strong Evidence",
  "Good Evidence",
  "Partial Evidence",
  "Limited Evidence",
  "Insufficient Evidence",
] as const;
export const LegacyEvidenceLevelMigrationSchema = z.enum(LEGACY_EVIDENCE_LEVELS);
export type LegacyEvidenceLevelMigration = z.infer<typeof LegacyEvidenceLevelMigrationSchema>;

const LEGACY_EVIDENCE_LEVEL_MAP: Record<LegacyEvidenceLevelMigration, CanonicalEvidenceLevel> = {
  "Strong Evidence": "strong",
  "Good Evidence": "good",
  "Partial Evidence": "partial",
  "Limited Evidence": "limited",
  "Insufficient Evidence": "insufficient",
};

export function parseLegacyEvidenceLevelForMigration(value: unknown): CanonicalEvidenceLevel {
  const canonical = CanonicalEvidenceLevelSchema.safeParse(value);
  if (canonical.success) {
    return canonical.data;
  }
  return LEGACY_EVIDENCE_LEVEL_MAP[LegacyEvidenceLevelMigrationSchema.parse(value)];
}

export const LegacyAccountRemediationFieldsMigrationSchema = z.object({
  role: AccountRoleSchema.optional(),
  lifecycleState: AccountLifecycleStateSchema.optional(),
  isDemo: z.boolean().optional(),
  demoLabel: z.string().min(1).max(80).nullable().optional(),
  companyName: z.string().min(1).max(300).nullable().optional(),
  planTierId: IdentifierSchema.nullable().optional(),
  lastActivityAt: NullableIsoDateTimeSchema.optional(),
  softDeletedAt: NullableIsoDateTimeSchema.optional(),
  suspendedAt: NullableIsoDateTimeSchema.optional(),
}).strict();

export function parseLegacyAccountRemediationFieldsForMigration(
  value: unknown,
): AccountRemediationFields {
  const parsed = LegacyAccountRemediationFieldsMigrationSchema.parse(value);
  return AccountRemediationFieldsSchema.parse({
    role: parsed.role ?? "RECRUITER",
    lifecycleState: parsed.lifecycleState ?? "active",
    isDemo: parsed.isDemo ?? false,
    demoLabel: parsed.demoLabel ?? null,
    companyName: parsed.companyName ?? null,
    planTierId: parsed.planTierId ?? null,
    lastActivityAt: parsed.lastActivityAt ?? null,
    softDeletedAt: parsed.softDeletedAt ?? null,
    suspendedAt: parsed.suspendedAt ?? null,
  });
}
