import type {
  AttributionStatus,
  CandidateConclusion,
  CanonicalEvidenceLevel,
  DetectorFinding,
  DiscoveryOrigin,
  EvidenceCitation,
  RepositoryCorpusMetrics,
  RepositoryRunMetrics,
} from "@/types/remediation";
import {
  canRollUpEvidence,
  getCapabilityTaxonomyVersion,
  resolveCapabilityAliasInTaxonomy,
} from "./capability-taxonomy";
import { isCitationEligibleForConclusion } from "./evidence-eligibility";

const CONCLUSIVE_LEVELS = new Set<CanonicalEvidenceLevel>(["strong", "good", "partial"]);
const WEAK_SIGNAL_CLASSES = new Set<DetectorFinding["signalClass"]>([
  "dependency",
  "configuration",
  "documentation",
  "generated",
  "trivial",
]);

export interface EvidenceThresholdFacts {
  readonly meaningfulImplementationFileCount: number;
  readonly implementationAreaCount: number;
  readonly hasTestEvidence: boolean;
  readonly architecturalBoundaryCount: number;
  readonly repeatedNonTrivialUseAcrossModules: boolean;
  readonly narrowTestBackedUse: boolean;
}

export interface CanonicalEvidenceItem {
  readonly id: string;
  readonly analysisVersionId: string;
  readonly candidateId: string;
  readonly capabilityId: string;
  /** An observed alias or canonical ID before any explicitly allowed upward roll-up. */
  readonly observedCapability: string;
  readonly repositoryId: string;
  readonly revision: string | null;
  readonly claimScope: string;
  readonly evidenceLevel: CanonicalEvidenceLevel;
  readonly findingIds: readonly string[];
  readonly thresholdFacts: EvidenceThresholdFacts;
}

export interface CanonicalEvidenceGap {
  readonly id: string;
  readonly analysisVersionId: string;
  readonly candidateId: string;
  readonly capabilityId: string;
  readonly repositoryId: string;
  readonly revision: string | null;
  readonly claimScope: string;
}

export type CanonicalEvidenceCitation = Readonly<EvidenceCitation & {
  analysisVersionId: string;
  candidateId: string;
}>;

export interface AnalyzedCorpusFile {
  readonly path: string;
  /** Exact analyzed bytes decoded as text. Repository content remains untrusted data. */
  readonly content: string;
}

export interface AnalyzedRepositoryCorpus {
  readonly repositoryId: string;
  readonly repositoryUrl: string;
  readonly repositoryName: string;
  readonly revision: string | null;
  readonly files: readonly AnalyzedCorpusFile[];
}

export const EVIDENCE_PROJECTION_SURFACES = [
  "persistence",
  "api",
  "recruiter_report",
  "external_report",
  "comparison",
  "review_order",
  "methodology",
] as const;
export type EvidenceProjectionSurface = (typeof EVIDENCE_PROJECTION_SURFACES)[number];

export interface EvidenceSurfaceProjection {
  readonly surface: EvidenceProjectionSurface;
  readonly citationId: string;
  readonly attributionStatus: AttributionStatus;
  readonly discoveryOrigin: DiscoveryOrigin;
  readonly evidenceLevel: CanonicalEvidenceLevel;
  readonly taxonomyVersion: string;
}

export type CanonicalJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly CanonicalJsonValue[]
  | Readonly<{ [key: string]: CanonicalJsonValue }>;

export interface VersionMutationCheck {
  readonly state: "active" | "completed";
  readonly persisted: CanonicalJsonValue;
  readonly proposed: CanonicalJsonValue;
}

export interface CanonicalAnalysisBundle {
  readonly sourceKind: "canonical" | "legacy";
  readonly analysis: Readonly<{
    versionId: string;
    candidateId: string;
    taxonomyVersion: string;
  }>;
  readonly findings: readonly DetectorFinding[];
  readonly evidenceItems: readonly CanonicalEvidenceItem[];
  readonly gaps: readonly CanonicalEvidenceGap[];
  readonly citations: readonly CanonicalEvidenceCitation[];
  readonly conclusions: readonly Readonly<CandidateConclusion>[];
  readonly analyzedCorpora: readonly AnalyzedRepositoryCorpus[];
  readonly projections: readonly EvidenceSurfaceProjection[];
  readonly repositoryRunMetrics: RepositoryRunMetrics;
  readonly repositoryCorpusMetrics: readonly RepositoryCorpusMetrics[];
  readonly immutability?: Readonly<{
    analysis?: VersionMutationCheck;
    requisition?: VersionMutationCheck;
  }>;
}

const ERROR_DEFINITIONS = {
  TAXONOMY_VERSION_UNKNOWN: {
    domain: "taxonomy",
    path: "analysis.taxonomyVersion",
    message: "The pinned taxonomy version is unavailable.",
  },
  TAXONOMY_ALIAS_INVALID: {
    domain: "taxonomy",
    path: "evidenceItems.capability",
    message: "An evidence capability does not resolve in the pinned taxonomy.",
  },
  TAXONOMY_ROLLUP_INVALID: {
    domain: "taxonomy",
    path: "evidenceItems.capabilityId",
    message: "Evidence was rolled up without an explicit taxonomy edge.",
  },
  EVIDENCE_SCOPE_MISMATCH: {
    domain: "evidence",
    path: "evidenceItems",
    message: "Evidence grounding does not belong to the analysis scope.",
  },
  DUPLICATE_EVIDENCE_LEVELS: {
    domain: "evidence",
    path: "evidenceItems.evidenceLevel",
    message: "One canonical evidence scope has multiple evidence levels.",
  },
  GAP_AND_ELIGIBLE_SUPPORT: {
    domain: "evidence",
    path: "gaps",
    message: "One claim scope contains both a gap and eligible support.",
  },
  WEAK_SIGNAL_PROMOTION: {
    domain: "evidence",
    path: "evidenceItems.evidenceLevel",
    message: "Weak-signal-only evidence exceeds the limited level.",
  },
  STRONG_THRESHOLD_NOT_MET: {
    domain: "evidence",
    path: "evidenceItems.thresholdFacts",
    message: "Strong evidence does not satisfy its minimum threshold.",
  },
  GOOD_THRESHOLD_NOT_MET: {
    domain: "evidence",
    path: "evidenceItems.thresholdFacts",
    message: "Good evidence does not satisfy its minimum threshold.",
  },
  PARTIAL_THRESHOLD_NOT_MET: {
    domain: "evidence",
    path: "evidenceItems.thresholdFacts",
    message: "Partial evidence does not satisfy its minimum threshold.",
  },
  CITATION_CORPUS_MISMATCH: {
    domain: "citation",
    path: "citations",
    message: "A citation is not an exact projection of its analyzed corpus grounding.",
  },
  UNSUPPORTED_CONCLUSION: {
    domain: "conclusion",
    path: "conclusions",
    message: "A conclusion lacks same-version eligible verified contribution support.",
  },
  CROSS_SURFACE_PROVENANCE_DRIFT: {
    domain: "projection",
    path: "projections",
    message: "An evidence projection changed canonical provenance.",
  },
  COMPLETED_ANALYSIS_MUTATION: {
    domain: "immutability",
    path: "immutability.analysis",
    message: "A completed analysis version cannot be mutated.",
  },
  COMPLETED_REQUISITION_MUTATION: {
    domain: "immutability",
    path: "immutability.requisition",
    message: "A completed requisition version cannot be mutated.",
  },
  REPOSITORY_RUN_METRICS_INVALID: {
    domain: "metrics",
    path: "repositoryRunMetrics",
    message: "Repository run counts do not satisfy the state equation.",
  },
  ATTRIBUTION_TOTAL_MISMATCH: {
    domain: "metrics",
    path: "repositoryRunMetrics.attributionCounts",
    message: "Attribution counts do not total selected repository relationships.",
  },
  REPOSITORY_CORPUS_METRICS_INVALID: {
    domain: "metrics",
    path: "repositoryCorpusMetrics",
    message: "Repository corpus stage counts or text bytes are not monotonic.",
  },
} as const;

export type CanonicalInvariantErrorCode = keyof typeof ERROR_DEFINITIONS;
type CanonicalInvariantDomain = (typeof ERROR_DEFINITIONS)[CanonicalInvariantErrorCode]["domain"];

const ERROR_CODE_ORDER = Object.freeze(Object.keys(ERROR_DEFINITIONS) as CanonicalInvariantErrorCode[]);

export interface CanonicalInvariantError {
  readonly code: CanonicalInvariantErrorCode;
  readonly domain: CanonicalInvariantDomain;
  readonly path: string;
  readonly message: string;
  /** Aggregated to avoid returning source-derived identifiers or values. */
  readonly occurrences: number;
}

export type CanonicalAnalysisValidationResult =
  | Readonly<{
    outcome: "accepted";
    eligibleForCanonicalPersistence: true;
    errors: readonly CanonicalInvariantError[];
  }>
  | Readonly<{
    outcome: "rejected";
    eligibleForCanonicalPersistence: false;
    errors: readonly CanonicalInvariantError[];
  }>
  | Readonly<{
    outcome: "quarantined_for_recomputation";
    eligibleForCanonicalPersistence: false;
    preserveSourceRecord: true;
    recomputeConclusionIds: readonly string[];
    errors: readonly CanonicalInvariantError[];
  }>;

type ErrorCounts = Map<CanonicalInvariantErrorCode, number>;

function addError(errors: ErrorCounts, code: CanonicalInvariantErrorCode): void {
  errors.set(code, (errors.get(code) ?? 0) + 1);
}

function materializeErrors(errors: ErrorCounts): readonly CanonicalInvariantError[] {
  return Object.freeze(ERROR_CODE_ORDER.flatMap((code) => {
    const occurrences = errors.get(code);
    if (!occurrences) return [];
    const definition = ERROR_DEFINITIONS[code];
    return [Object.freeze({ code, ...definition, occurrences })];
  }));
}

function canonicalJson(value: CanonicalJsonValue): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => (
    `${JSON.stringify(key)}:${canonicalJson((value as Readonly<Record<string, CanonicalJsonValue>>)[key])}`
  )).join(",")}}`;
}

function scopeKey(
  value: Pick<CanonicalEvidenceItem, "analysisVersionId" | "candidateId" | "capabilityId" | "repositoryId" | "revision" | "claimScope">,
): string {
  return JSON.stringify([
    value.analysisVersionId,
    value.candidateId,
    value.capabilityId,
    value.repositoryId,
    value.revision,
    value.claimScope,
  ]);
}

function isNonNegativeInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

function hasValidThreshold(item: CanonicalEvidenceItem): CanonicalInvariantErrorCode | null {
  const facts = item.thresholdFacts;
  if (item.evidenceLevel === "strong" && !(
    facts.meaningfulImplementationFileCount >= 3
    && facts.implementationAreaCount >= 2
    && (facts.hasTestEvidence || facts.architecturalBoundaryCount >= 2)
  )) return "STRONG_THRESHOLD_NOT_MET";

  if (item.evidenceLevel === "good" && !(
    facts.meaningfulImplementationFileCount >= 2
    || facts.repeatedNonTrivialUseAcrossModules
  )) return "GOOD_THRESHOLD_NOT_MET";

  if (item.evidenceLevel === "partial" && !(
    facts.meaningfulImplementationFileCount >= 1
    || facts.narrowTestBackedUse
  )) return "PARTIAL_THRESHOLD_NOT_MET";

  return null;
}

function encodeGitHubPath(path: string): string {
  return path.split("/").map((segment) => encodeURIComponent(segment)).join("/");
}

function expectedSourceLink(
  citation: CanonicalEvidenceCitation,
  corpus: AnalyzedRepositoryCorpus,
): string {
  const repositoryUrl = corpus.repositoryUrl.replace(/\/+$/u, "");
  if (citation.revision === null) return repositoryUrl;
  const base = `${repositoryUrl}/blob/${encodeURIComponent(citation.revision)}/${encodeGitHubPath(citation.filePath)}`;
  return citation.startLine === null || citation.endLine === null
    ? base
    : `${base}#L${citation.startLine}-L${citation.endLine}`;
}

function validLineSpan(start: number | null, end: number | null, lineCount: number): boolean {
  if (start === null || end === null) return start === null && end === null;
  return Number.isInteger(start) && Number.isInteger(end) && start >= 1 && end >= start && end <= lineCount;
}

function citationMatchesCorpus(
  citation: CanonicalEvidenceCitation,
  findingsById: ReadonlyMap<string, DetectorFinding>,
  duplicateFindingIds: ReadonlySet<string>,
  corporaByRepositoryId: ReadonlyMap<string, AnalyzedRepositoryCorpus>,
  duplicateCorpusIds: ReadonlySet<string>,
): boolean {
  const finding = findingsById.get(citation.findingId);
  const corpus = corporaByRepositoryId.get(citation.repositoryId);
  if (
    !finding
    || !corpus
    || duplicateFindingIds.has(citation.findingId)
    || duplicateCorpusIds.has(citation.repositoryId)
  ) return false;

  const files = corpus.files.filter((file) => file.path === citation.filePath);
  if (files.length !== 1) return false;
  const file = files[0];
  const lineCount = file.content.split("\n").length;
  const revisionAvailability = citation.revision === null ? "unavailable" : "available";

  if (
    citation.detectorId !== finding.detectorId
    || citation.detectorVersion !== finding.detectorVersion
    || citation.repositoryId !== finding.repositoryId
    || citation.revision !== finding.revision
    || citation.filePath !== finding.filePath
    || citation.symbol !== finding.symbol
    || citation.startLine !== finding.startLine
    || citation.endLine !== finding.endLine
    || citation.repositoryUrl !== corpus.repositoryUrl
    || citation.repositoryName !== corpus.repositoryName
    || citation.revision !== corpus.revision
    || citation.revisionAvailability !== revisionAvailability
    || !validLineSpan(citation.startLine, citation.endLine, lineCount)
    || citation.sourceLink !== expectedSourceLink(citation, corpus)
  ) return false;

  if (citation.excerpt === null) return true;
  if (citation.startLine === null || citation.endLine === null) return false;
  const excerpt = file.content.split("\n").slice(citation.startLine - 1, citation.endLine).join("\n");
  return citation.endLine - citation.startLine + 1 <= 12
    && citation.excerpt.length <= 800
    && citation.excerpt === excerpt;
}

function validateMetrics(bundle: CanonicalAnalysisBundle, errors: ErrorCounts): void {
  const run = bundle.repositoryRunMetrics;
  const runCounts = [
    run.selectedRepositoryCount,
    run.successfulRepositoryCount,
    run.failedRepositoryCount,
    run.pendingRepositoryCount,
  ];
  const stateEquationHolds = run.state === "completed"
    ? run.pendingRepositoryCount === 0
      && run.selectedRepositoryCount === run.successfulRepositoryCount + run.failedRepositoryCount
    : run.selectedRepositoryCount
      === run.successfulRepositoryCount + run.failedRepositoryCount + run.pendingRepositoryCount;
  if (!runCounts.every(isNonNegativeInteger) || !stateEquationHolds) {
    addError(errors, "REPOSITORY_RUN_METRICS_INVALID");
  }

  const attributionCounts = Object.values(run.attributionCounts);
  if (
    !attributionCounts.every(isNonNegativeInteger)
    || attributionCounts.reduce((sum, value) => sum + value, 0) !== run.selectedRepositoryCount
  ) addError(errors, "ATTRIBUTION_TOTAL_MISMATCH");

  for (const metrics of bundle.repositoryCorpusMetrics) {
    const fileCounts = [
      metrics.rawArchiveEntryCount,
      metrics.eligibleTextFileCount,
      metrics.selectedFileCount,
      metrics.analyzedFileCount,
    ];
    const textBytes = [metrics.eligibleTextBytes, metrics.selectedTextBytes, metrics.analyzedTextBytes];
    const excludedMetrics = Object.values(metrics.excludedByReason)
      .flatMap((metric) => [metric.files, metric.bytes]);
    const limits = Object.values(metrics.limits);
    const allCounts = [...fileCounts, metrics.downloadedArchiveBytes, ...textBytes, ...excludedMetrics, ...limits];
    const fileStagesHold = metrics.analyzedFileCount <= metrics.selectedFileCount
      && metrics.selectedFileCount <= metrics.eligibleTextFileCount
      && metrics.eligibleTextFileCount <= metrics.rawArchiveEntryCount;
    const byteStagesHold = metrics.analyzedTextBytes <= metrics.selectedTextBytes
      && metrics.selectedTextBytes <= metrics.eligibleTextBytes;
    if (!allCounts.every(isNonNegativeInteger) || !fileStagesHold || !byteStagesHold) {
      addError(errors, "REPOSITORY_CORPUS_METRICS_INVALID");
    }
  }
}

/**
 * Pure pre-persistence validation for one canonical analysis bundle.
 *
 * The function performs no I/O and returns no source-derived values in errors.
 * Invalid canonical bundles are rejected as a whole. Invalid legacy bundles are
 * preserved and quarantined, with all candidate conclusions marked for a clean
 * recomputation rather than allowing a partial canonical projection.
 */
export function validateCanonicalAnalysisBundle(
  bundle: CanonicalAnalysisBundle,
): CanonicalAnalysisValidationResult {
  const errors: ErrorCounts = new Map();
  let taxonomyAvailable = true;
  let taxonomy: ReturnType<typeof getCapabilityTaxonomyVersion> | null = null;
  try {
    taxonomy = getCapabilityTaxonomyVersion(bundle.analysis.taxonomyVersion);
  } catch {
    taxonomyAvailable = false;
    addError(errors, "TAXONOMY_VERSION_UNKNOWN");
  }

  const findingsById = new Map<string, DetectorFinding>();
  const duplicateFindingIds = new Set<string>();
  for (const finding of bundle.findings) {
    if (findingsById.has(finding.id)) duplicateFindingIds.add(finding.id);
    else findingsById.set(finding.id, finding);
  }

  const corporaByRepositoryId = new Map<string, AnalyzedRepositoryCorpus>();
  const duplicateCorpusIds = new Set<string>();
  for (const corpus of bundle.analyzedCorpora) {
    if (corporaByRepositoryId.has(corpus.repositoryId)) duplicateCorpusIds.add(corpus.repositoryId);
    else corporaByRepositoryId.set(corpus.repositoryId, corpus);
  }

  const citationsById = new Map<string, CanonicalEvidenceCitation>();
  const duplicateCitationIds = new Set<string>();
  for (const citation of bundle.citations) {
    if (citationsById.has(citation.id)) duplicateCitationIds.add(citation.id);
    else citationsById.set(citation.id, citation);
  }

  const invalidCitationIds = new Set<string>(duplicateCitationIds);
  for (const citation of bundle.citations) {
    if (!citationMatchesCorpus(
      citation,
      findingsById,
      duplicateFindingIds,
      corporaByRepositoryId,
      duplicateCorpusIds,
    )) invalidCitationIds.add(citation.id);
    if (
      citation.analysisVersionId !== bundle.analysis.versionId
      || citation.candidateId !== bundle.analysis.candidateId
    ) addError(errors, "EVIDENCE_SCOPE_MISMATCH");
    if (citation.taxonomyVersion !== bundle.analysis.taxonomyVersion) {
      addError(errors, "CROSS_SURFACE_PROVENANCE_DRIFT");
    }
  }
  if (invalidCitationIds.size > 0) {
    errors.set(
      "CITATION_CORPUS_MISMATCH",
      (errors.get("CITATION_CORPUS_MISMATCH") ?? 0) + invalidCitationIds.size,
    );
  }

  const evidenceByFindingId = new Map<string, CanonicalEvidenceItem[]>();
  const levelsByScope = new Map<string, Set<CanonicalEvidenceLevel>>();
  for (const item of bundle.evidenceItems) {
    if (
      item.analysisVersionId !== bundle.analysis.versionId
      || item.candidateId !== bundle.analysis.candidateId
      || item.findingIds.length === 0
    ) addError(errors, "EVIDENCE_SCOPE_MISMATCH");

    const findings = item.findingIds.flatMap((findingId) => {
      const finding = findingsById.get(findingId);
      if (!finding || duplicateFindingIds.has(findingId)) {
        addError(errors, "EVIDENCE_SCOPE_MISMATCH");
        return [];
      }
      const current = evidenceByFindingId.get(findingId) ?? [];
      evidenceByFindingId.set(findingId, [...current, item]);
      return [finding];
    });

    if (taxonomyAvailable && taxonomy) {
      const observed = resolveCapabilityAliasInTaxonomy(item.observedCapability, taxonomy);
      const target = taxonomy.nodes.find((node) => node.id === item.capabilityId) ?? null;
      if (!observed || !target) {
        addError(errors, "TAXONOMY_ALIAS_INVALID");
      } else {
        if (!canRollUpEvidence(observed.id, target.id, taxonomy.version)) {
          addError(errors, "TAXONOMY_ROLLUP_INVALID");
        }
        if (findings.some((finding) => (
          finding.capabilityId !== observed.id
          || finding.repositoryId !== item.repositoryId
          || finding.revision !== item.revision
          || !observed.signalClasses.includes(finding.signalClass)
        ))) addError(errors, "EVIDENCE_SCOPE_MISMATCH");
      }
    }

    const levels = levelsByScope.get(scopeKey(item)) ?? new Set<CanonicalEvidenceLevel>();
    levels.add(item.evidenceLevel);
    levelsByScope.set(scopeKey(item), levels);

    const thresholdError = hasValidThreshold(item);
    if (thresholdError) addError(errors, thresholdError);

    const signalClasses = findings.map((finding) => finding.signalClass);
    if (
      signalClasses.length > 0
      && signalClasses.every((signalClass) => WEAK_SIGNAL_CLASSES.has(signalClass))
      && CONCLUSIVE_LEVELS.has(item.evidenceLevel)
    ) addError(errors, "WEAK_SIGNAL_PROMOTION");
  }
  for (const levels of levelsByScope.values()) {
    if (levels.size > 1) addError(errors, "DUPLICATE_EVIDENCE_LEVELS");
  }

  const eligibleSupportScopes = new Set<string>();
  for (const item of bundle.evidenceItems) {
    if (!CONCLUSIVE_LEVELS.has(item.evidenceLevel)) continue;
    const hasEligibleCitation = bundle.citations.some((citation) => (
      !invalidCitationIds.has(citation.id)
      && citation.analysisVersionId === bundle.analysis.versionId
      && citation.candidateId === bundle.analysis.candidateId
      && citation.taxonomyVersion === bundle.analysis.taxonomyVersion
      && isCitationEligibleForConclusion(citation)
      && citation.evidenceLevel === item.evidenceLevel
      && item.findingIds.includes(citation.findingId)
    ));
    if (hasEligibleCitation) eligibleSupportScopes.add(scopeKey(item));
  }

  for (const gap of bundle.gaps) {
    if (
      gap.analysisVersionId !== bundle.analysis.versionId
      || gap.candidateId !== bundle.analysis.candidateId
    ) addError(errors, "EVIDENCE_SCOPE_MISMATCH");
    if (taxonomyAvailable && taxonomy && !taxonomy.nodes.some((node) => node.id === gap.capabilityId)) {
      addError(errors, "TAXONOMY_ALIAS_INVALID");
    }
    if (eligibleSupportScopes.has(scopeKey(gap))) addError(errors, "GAP_AND_ELIGIBLE_SUPPORT");
  }

  for (const conclusion of bundle.conclusions) {
    let supported = conclusion.eligibility === "eligible"
      && conclusion.analysisVersionId === bundle.analysis.versionId
      && conclusion.citationIds.length > 0;
    if (taxonomyAvailable && taxonomy) {
      supported = supported && taxonomy.nodes.some((node) => node.id === conclusion.capabilityId);
    } else {
      supported = false;
    }

    const hasEligibleCitation = supported && conclusion.citationIds.some((citationId) => {
      const citation = citationsById.get(citationId);
      if (
        !citation
        || invalidCitationIds.has(citationId)
        || citation.analysisVersionId !== bundle.analysis.versionId
        || citation.candidateId !== bundle.analysis.candidateId
        || citation.taxonomyVersion !== bundle.analysis.taxonomyVersion
        || !isCitationEligibleForConclusion(citation)
        || !CONCLUSIVE_LEVELS.has(citation.evidenceLevel)
        || citation.evidenceLevel !== conclusion.evidenceLevel
      ) return false;
      const finding = findingsById.get(citation.findingId);
      if (!finding || !canRollUpEvidence(
        finding.capabilityId,
        conclusion.capabilityId,
        bundle.analysis.taxonomyVersion,
      )) return false;
      return (evidenceByFindingId.get(finding.id) ?? []).some((item) => (
        item.analysisVersionId === bundle.analysis.versionId
        && item.candidateId === bundle.analysis.candidateId
        && item.evidenceLevel === citation.evidenceLevel
      ));
    });
    if (!hasEligibleCitation) addError(errors, "UNSUPPORTED_CONCLUSION");
  }

  for (const projection of bundle.projections) {
    const citation = citationsById.get(projection.citationId);
    if (
      !citation
      || duplicateCitationIds.has(projection.citationId)
      || projection.attributionStatus !== citation.attributionStatus
      || projection.discoveryOrigin !== citation.discoveryOrigin
      || projection.evidenceLevel !== citation.evidenceLevel
      || projection.taxonomyVersion !== citation.taxonomyVersion
    ) addError(errors, "CROSS_SURFACE_PROVENANCE_DRIFT");
  }

  if (
    bundle.immutability?.analysis?.state === "completed"
    && canonicalJson(bundle.immutability.analysis.persisted)
      !== canonicalJson(bundle.immutability.analysis.proposed)
  ) addError(errors, "COMPLETED_ANALYSIS_MUTATION");
  if (
    bundle.immutability?.requisition?.state === "completed"
    && canonicalJson(bundle.immutability.requisition.persisted)
      !== canonicalJson(bundle.immutability.requisition.proposed)
  ) addError(errors, "COMPLETED_REQUISITION_MUTATION");

  validateMetrics(bundle, errors);

  const structuredErrors = materializeErrors(errors);
  if (structuredErrors.length === 0) {
    return Object.freeze({
      outcome: "accepted",
      eligibleForCanonicalPersistence: true,
      errors: structuredErrors,
    });
  }

  if (bundle.sourceKind === "legacy") {
    const recomputeConclusionIds = Object.freeze([
      ...new Set(bundle.conclusions.map((conclusion) => conclusion.id)),
    ].sort((left, right) => left.localeCompare(right, "en")));
    return Object.freeze({
      outcome: "quarantined_for_recomputation",
      eligibleForCanonicalPersistence: false,
      preserveSourceRecord: true,
      recomputeConclusionIds,
      errors: structuredErrors,
    });
  }

  return Object.freeze({
    outcome: "rejected",
    eligibleForCanonicalPersistence: false,
    errors: structuredErrors,
  });
}
