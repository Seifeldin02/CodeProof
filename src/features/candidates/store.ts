import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Pool, PoolClient } from "pg";
import { projectLegacyAnalysisRecord } from "@/features/persistence/legacy-adapters";
import { ensurePostgreSQLRemediationSchema } from "@/features/persistence/postgres-migrations";
import { getPostgresPool } from "@/features/persistence/postgres";
import { ensureRemediationSchema } from "@/features/persistence/sqlite-migrations";
import {
  applyProviderVerification,
  createRepositoryAttributionState,
  type RepositoryAttributionState,
} from "@/features/repository-analysis/attribution-transitions";
import type { ContributionVerificationResult } from "@/features/repository-analysis/provider-verification";
import { reprojectGroundedEvidence } from "@/features/repository-analysis/grounded-citations";
import { reconcileRepositoryRunMetrics } from "@/features/repository-analysis/repository-metrics";
import type { AttributionStatus, DiscoveryOrigin } from "@/types/remediation";
import type { AttributionCounts, RepositoryRunMetrics } from "@/types/remediation";
import type { CandidateDetail, CandidateRepositoryOutcome, CandidateRepositoryRelationship, RepositoryFailure } from "./types";
import {
  PIPELINE_STAGES,
  type CandidateOutcome,
  type CandidateRecord,
  type PipelineStage,
  type Role,
  type SourceChannel,
  type StageEvent,
} from "@/features/hiring-analytics/types";
import type { AnalysisResult, EvidenceLevel } from "@/types/analysis";

const EVIDENCE_WEIGHT: Record<EvidenceLevel, number> = {
  "Strong Evidence": 4,
  "Good Evidence": 3,
  "Partial Evidence": 2,
  "Limited Evidence": 1,
  "Insufficient Evidence": 0,
};

export function calculateEvidenceIndex(results: AnalysisResult[]): number {
  const levels = results.flatMap((result) => result.skills.map((skill) => skill.level));
  if (levels.length === 0) return 0;
  return Math.round((levels.reduce((sum, level) => sum + EVIDENCE_WEIGHT[level], 0) / (levels.length * 4)) * 100);
}

interface CandidateRow {
  id: string;
  owner_user_id: string;
  name: string;
  role: string;
  source: string;
  evidence_index: number;
  applied_at: string;
  outcome: CandidateOutcome;
  furthest_stage: PipelineStage;
  is_demo: number | boolean;
  repository_count: number;
  verified_claim_count: number;
  evidence_reviewed_at?: string | null;
  unanalyzed_sources?: string | null;
}

interface AnalysisRow {
  id: string;
  candidate_id: string;
  repository_url: string;
  repository_name: string;
  primary_language: string | null;
  project_type: string;
  evidence_index: number;
  summary: string;
  analyzed_at: string;
  analysis_json: string | AnalysisResult;
}

interface OutcomeRow {
  id: string;
  candidate_id: string;
  repository_url: string;
  repository_name: string;
  status: CandidateRepositoryOutcome["status"];
  code: string | null;
  message: string | null;
  updated_at: string;
}

interface CandidateRepositoryRow {
  id: string;
  candidate_id: string;
  repository_url: string;
  repository_owner: string | null;
  repository_name: string;
  discovery_origin: DiscoveryOrigin | null;
  attribution_status: AttributionStatus;
  attribution_updated_at: string;
  verification_revision: string | null;
  origin_confirmation_required: number | boolean;
}

interface StageRow {
  stage: PipelineStage;
  entered_at: string;
}

export interface CreateCandidateInput {
  name: string;
  role: Role;
  source?: SourceChannel;
  results: AnalysisResult[];
  /** Interview-only intake must not fabricate completed screening or code-review stages. */
  intakeOnly?: boolean;
  failures?: RepositoryFailure[];
  isDemo?: boolean;
  /** Portfolio / non-GitHub links from the CV. Recorded, never analyzed. */
  unanalyzedSources?: string[];
  repositorySelections?: RepositorySelection[];
}

export interface RepositorySelection {
  repositoryUrl: string;
  discoveryOrigin: DiscoveryOrigin;
  candidateSourceClaim: boolean;
}

export interface CandidatePersistence {
  listCandidates(ownerUserId: string): Promise<CandidateRecord[]>;
  getCandidate(ownerUserId: string, id: string): Promise<CandidateDetail | null>;
  createCandidate(ownerUserId: string, input: CreateCandidateInput): Promise<CandidateDetail>;
  recordRepositorySuccess(ownerUserId: string, candidateId: string, result: AnalysisResult, selection?: RepositorySelection): Promise<CandidateDetail | null>;
  verifyRepositoryAttribution(
    ownerUserId: string,
    candidateId: string,
    repositoryUrl: string,
    verification: ContributionVerificationResult,
  ): Promise<CandidateDetail | null>;
  removeFailedRepository(ownerUserId: string, candidateId: string, repositoryUrl: string): Promise<boolean>;
  updatePipeline(ownerUserId: string, candidateId: string, stage: PipelineStage, outcome: CandidateOutcome, source?: SourceChannel): Promise<CandidateDetail | null>;
  /** Records (or withdraws) the recruiter's confirmation that cited evidence was opened. */
  setEvidenceReviewed(ownerUserId: string, candidateId: string, reviewed: boolean): Promise<CandidateDetail | null>;
  deleteCandidate(ownerUserId: string, candidateId: string): Promise<boolean>;
}

function parseAnalysis(value: string | AnalysisResult): AnalysisResult {
  return typeof value === "string" ? JSON.parse(value) as AnalysisResult : value;
}

/** Stored as a JSON array of URLs. Older rows predate the column and read as none. */
function parseSources(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function verifiedClaimCount(results: AnalysisResult[]): number {
  return new Set(results.flatMap((result) => result.resumeVerification?.claims
    .filter((claim) => claim.support !== "No Repository Evidence")
    .map((claim) => claim.claim) ?? [])).size;
}

function analysisFields(result: AnalysisResult) {
  const primaryLanguage = Object.entries(result.languages).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const evidenceIndex = calculateEvidenceIndex([result]);
  const summary = result.strengths.length
    ? `${result.projectType}. ${result.strengths.slice(0, 2).map((strength) => strength.title).join(" and ")}.`
    : `${result.projectType} with ${result.skills.length} grounded skill signal${result.skills.length === 1 ? "" : "s"}.`;
  return { primaryLanguage, evidenceIndex, summary };
}

function repositoryName(url: string): string {
  try {
    return new URL(url).pathname.replace(/^\//, "");
  } catch {
    return url;
  }
}

function mapCandidate(row: CandidateRow, events: StageEvent[]): CandidateRecord {
  return {
    id: row.id,
    name: row.name,
    role: row.role as Role,
    source: row.source === "CodeProof" ? "Not recorded" : row.source as CandidateRecord["source"],
    verifiedSkillScore: Number(row.evidence_index),
    appliedAt: row.applied_at,
    outcome: row.outcome,
    furthestStage: row.furthest_stage,
    stageHistory: events,
    isDemo: Boolean(row.is_demo),
    repositoryCount: Number(row.repository_count),
    verifiedClaimCount: Number(row.verified_claim_count),
    evidenceReviewedAt: row.evidence_reviewed_at ?? null,
    unanalyzedSources: parseSources(row.unanalyzed_sources),
  };
}

function mapAnalysis(row: AnalysisRow) {
  const result = parseAnalysis(row.analysis_json);
  const remediation = projectLegacyAnalysisRecord({
    sourceTable: "candidate_analyses",
    sourceId: row.id,
    candidateId: row.candidate_id,
    analyzedAt: row.analyzed_at,
    analysisJson: result as unknown,
    evidenceIndex: Number(row.evidence_index),
  }).view;
  return {
    id: row.id,
    candidateId: row.candidate_id,
    repositoryUrl: row.repository_url,
    repositoryName: row.repository_name,
    primaryLanguage: row.primary_language,
    projectType: row.project_type,
    evidenceIndex: Number(row.evidence_index),
    summary: row.summary,
    analyzedAt: row.analyzed_at,
    result,
    remediation,
  };
}

function mapOutcome(row: OutcomeRow): CandidateRepositoryOutcome {
  return {
    id: row.id,
    candidateId: row.candidate_id,
    repositoryUrl: row.repository_url,
    repositoryName: row.repository_name,
    status: row.status,
    code: row.code,
    message: row.message,
    updatedAt: row.updated_at,
  };
}

function mapRepository(row: CandidateRepositoryRow): CandidateRepositoryRelationship {
  return {
    id: row.id,
    candidateId: row.candidate_id,
    repositoryUrl: row.repository_url,
    repositoryOwner: row.repository_owner,
    repositoryName: row.repository_name,
    discoveryOrigin: row.discovery_origin,
    attributionStatus: row.attribution_status,
    attributionUpdatedAt: new Date(row.attribution_updated_at).toISOString(),
    verificationRevision: row.verification_revision,
    originConfirmationRequired: Boolean(row.origin_confirmation_required),
  };
}

function analysesWithAttribution(
  analyses: readonly AnalysisRow[],
  repositories: readonly CandidateRepositoryRelationship[],
) {
  const statuses = new Map(repositories.map((repository) => [repository.repositoryUrl, repository.attributionStatus]));
  return analyses.map((row) => ({
    ...mapAnalysis(row),
    attributionStatus: statuses.get(row.repository_url) ?? "unverified" as const,
  }));
}

function repositoryParts(url: string): { owner: string | null; name: string } {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    return { owner: parts[0] ?? null, name: parts.slice(0, 2).join("/") || url };
  } catch {
    return { owner: null, name: url };
  }
}

function selectionFor(input: CreateCandidateInput, repositoryUrl: string): RepositorySelection {
  return input.repositorySelections?.find((item) => item.repositoryUrl === repositoryUrl) ?? {
    repositoryUrl,
    discoveryOrigin: "manual entry",
    candidateSourceClaim: false,
  };
}

function resultWithAttribution(result: AnalysisResult, selection: RepositorySelection): AnalysisResult {
  const state = createRepositoryAttributionState(selection);
  return result.canonicalEvidence
    ? {
        ...result,
        canonicalEvidence: reprojectGroundedEvidence(
          result.canonicalEvidence,
          state.discoveryOrigin,
          state.attributionStatus,
        ),
      }
    : result;
}

function completedRunMetrics(input: CreateCandidateInput, repositoryUrls: string[]): RepositoryRunMetrics {
  const attributionCounts: AttributionCounts = {
    unverified: 0,
    candidate_claimed: 0,
    verified_owner: 0,
    verified_contributor: 0,
  };
  for (const repositoryUrl of repositoryUrls) {
    const state = createRepositoryAttributionState(selectionFor(input, repositoryUrl));
    attributionCounts[state.attributionStatus] += 1;
  }
  return reconcileRepositoryRunMetrics(
    "completed",
    repositoryUrls.length,
    input.results.length,
    input.failures?.length ?? 0,
    attributionCounts,
  );
}

function attributionState(row: CandidateRepositoryRow): RepositoryAttributionState | null {
  if (!row.discovery_origin || Boolean(row.origin_confirmation_required)) return null;
  return {
    discoveryOrigin: row.discovery_origin,
    attributionStatus: row.attribution_status,
    activeProviderVerification: row.attribution_status === "verified_contributor"
      ? { kind: "contributor", immutableContributionRevision: row.verification_revision }
      : row.attribution_status === "verified_owner"
        ? { kind: "owner", immutableContributionRevision: null }
        : null,
    history: [],
  };
}

/** SQLite persistence for local development and deterministic tests. */
export class CandidateStore implements CandidatePersistence {
  readonly db: DatabaseSync;

  constructor(databasePath = process.env.CODEPROOF_DB_PATH ?? path.join(process.cwd(), ".data", "codeproof.db")) {
    if (databasePath !== ":memory:") mkdirSync(path.dirname(databasePath), { recursive: true });
    this.db = new DatabaseSync(databasePath);
    this.db.exec("PRAGMA foreign_keys = ON;");
    if (databasePath !== ":memory:") this.db.exec("PRAGMA journal_mode = WAL;");
    this.createSchema();
  }

  private createSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS candidates (
        id TEXT PRIMARY KEY, owner_user_id TEXT, name TEXT NOT NULL, role TEXT NOT NULL, source TEXT NOT NULL,
        evidence_index INTEGER NOT NULL, applied_at TEXT NOT NULL, outcome TEXT NOT NULL, furthest_stage TEXT NOT NULL,
        is_demo INTEGER NOT NULL DEFAULT 0, repository_count INTEGER NOT NULL DEFAULT 0, verified_claim_count INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS stage_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT, candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
        stage TEXT NOT NULL, entered_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS candidate_analyses (
        id TEXT PRIMARY KEY, candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
        repository_url TEXT NOT NULL, repository_name TEXT NOT NULL, primary_language TEXT, project_type TEXT NOT NULL,
        evidence_index INTEGER NOT NULL, summary TEXT NOT NULL, analyzed_at TEXT NOT NULL, analysis_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS candidate_repository_outcomes (
        id TEXT PRIMARY KEY, candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
        repository_url TEXT NOT NULL, repository_name TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('analyzed', 'failed')), code TEXT, message TEXT, updated_at TEXT NOT NULL,
        UNIQUE(candidate_id, repository_url)
      );
    `);
    const columns = this.db.prepare("PRAGMA table_info(candidates)").all() as unknown as Array<{ name: string }>;
    if (!columns.some((column) => column.name === "owner_user_id")) {
      this.db.exec("ALTER TABLE candidates ADD COLUMN owner_user_id TEXT");
    }
    if (!columns.some((column) => column.name === "evidence_reviewed_at")) {
      this.db.exec("ALTER TABLE candidates ADD COLUMN evidence_reviewed_at TEXT");
    }
    if (!columns.some((column) => column.name === "unanalyzed_sources")) {
      this.db.exec("ALTER TABLE candidates ADD COLUMN unanalyzed_sources TEXT");
    }
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_candidates_owner ON candidates(owner_user_id, applied_at DESC);
      CREATE INDEX IF NOT EXISTS idx_candidate_analyses_candidate ON candidate_analyses(candidate_id);
      CREATE INDEX IF NOT EXISTS idx_candidate_repository_outcomes_candidate ON candidate_repository_outcomes(candidate_id);
      CREATE INDEX IF NOT EXISTS idx_stage_events_candidate ON stage_events(candidate_id);
      INSERT OR IGNORE INTO candidate_repository_outcomes
        (id, candidate_id, repository_url, repository_name, status, code, message, updated_at)
        SELECT lower(hex(randomblob(16))), candidate_id, repository_url, repository_name, 'analyzed', NULL, NULL, analyzed_at
        FROM candidate_analyses;
    `);
    const hasUsers = this.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'").get();
    if (hasUsers) {
      const users = this.db.prepare("SELECT id FROM users ORDER BY created_at LIMIT 2").all() as unknown as Array<{ id: string }>;
      if (users.length === 1) this.db.prepare("UPDATE candidates SET owner_user_id = ? WHERE owner_user_id IS NULL").run(users[0].id);
    }
    ensureRemediationSchema(this.db);
  }

  private events(candidateId: string): StageEvent[] {
    const rows = this.db.prepare("SELECT stage, entered_at FROM stage_events WHERE candidate_id = ? ORDER BY entered_at, id").all(candidateId) as unknown as StageRow[];
    return rows.map((row) => ({ stage: row.stage, enteredAt: row.entered_at }));
  }

  async listCandidates(ownerUserId: string): Promise<CandidateRecord[]> {
    const rows = this.db.prepare("SELECT * FROM candidates WHERE owner_user_id = ? ORDER BY applied_at DESC").all(ownerUserId) as unknown as CandidateRow[];
    return rows.map((row) => mapCandidate(row, this.events(row.id)));
  }

  async getCandidate(ownerUserId: string, id: string): Promise<CandidateDetail | null> {
    const row = this.db.prepare("SELECT * FROM candidates WHERE id = ? AND owner_user_id = ?").get(id, ownerUserId) as CandidateRow | undefined;
    if (!row) return null;
    const analyses = this.db.prepare("SELECT * FROM candidate_analyses WHERE candidate_id = ? ORDER BY analyzed_at DESC").all(id) as unknown as AnalysisRow[];
    const outcomes = this.db.prepare("SELECT * FROM candidate_repository_outcomes WHERE candidate_id = ? ORDER BY updated_at DESC").all(id) as unknown as OutcomeRow[];
    const repositories = this.db.prepare(`SELECT id, candidate_id, repository_url, repository_owner,
      repository_name, discovery_origin, attribution_status, attribution_updated_at,
      verification_revision, origin_confirmation_required
      FROM candidate_repositories WHERE candidate_id = ? AND owner_user_id = ?
      ORDER BY attribution_updated_at DESC`).all(id, ownerUserId) as unknown as CandidateRepositoryRow[];
    return {
      ...mapCandidate(row, this.events(id)),
      analyses: analysesWithAttribution(analyses, repositories.map(mapRepository)),
      repositoryOutcomes: outcomes.map(mapOutcome),
      repositories: repositories.map(mapRepository),
    };
  }

  private insertRepositoryRelationship(
    ownerUserId: string,
    candidateId: string,
    repositoryUrl: string,
    selection: RepositorySelection,
    now: string,
  ): void {
    const state = createRepositoryAttributionState(selection);
    const parts = repositoryParts(repositoryUrl);
    const relationshipId = randomUUID();
    this.db.prepare(`INSERT INTO candidate_repositories
      (id, owner_user_id, candidate_id, repository_url, repository_owner, repository_name,
       discovery_origin, attribution_status, attribution_updated_at, verification_revision,
       linked_provider_identity_id, origin_confirmation_required, legacy_marker)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 0, NULL)`)
      .run(
        relationshipId,
        ownerUserId,
        candidateId,
        repositoryUrl,
        parts.owner,
        parts.name,
        state.discoveryOrigin,
        state.attributionStatus,
        now,
      );
    if (state.attributionStatus === "candidate_claimed") {
      this.db.prepare(`INSERT INTO contribution_verification_events
        (id, candidate_repository_id, from_status, to_status, provider,
         provider_identity_fingerprint, repository_provider_id, immutable_revision,
         reason, verified_at, created_at)
        VALUES (?, ?, 'unverified', 'candidate_claimed', NULL, NULL, NULL, NULL,
          'candidate_source_claim', NULL, ?)`)
        .run(randomUUID(), relationshipId, now);
    }
  }

  private insertAnalysis(candidateId: string, result: AnalysisResult): void {
    const fields = analysisFields(result);
    this.db.prepare("DELETE FROM candidate_analyses WHERE candidate_id = ? AND repository_url = ?").run(candidateId, result.repository.url);
    this.db.prepare(`INSERT INTO candidate_analyses
      (id, candidate_id, repository_url, repository_name, primary_language, project_type, evidence_index, summary, analyzed_at, analysis_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      randomUUID(), candidateId, result.repository.url, `${result.repository.owner}/${result.repository.name}`,
      fields.primaryLanguage, result.projectType, fields.evidenceIndex, fields.summary, result.metadata.analyzedAt, JSON.stringify(result),
    );
    this.db.prepare(`INSERT INTO candidate_repository_outcomes
      (id, candidate_id, repository_url, repository_name, status, code, message, updated_at)
      VALUES (?, ?, ?, ?, 'analyzed', NULL, NULL, ?)
      ON CONFLICT(candidate_id, repository_url) DO UPDATE SET repository_name = excluded.repository_name,
      status = 'analyzed', code = NULL, message = NULL, updated_at = excluded.updated_at`).run(
      randomUUID(), candidateId, result.repository.url, `${result.repository.owner}/${result.repository.name}`, result.metadata.analyzedAt,
    );
  }

  private insertCanonicalEvidence(
    ownerUserId: string,
    candidateId: string,
    candidateRepositoryId: string,
    _legacyAnalysisId: string,
    result: AnalysisResult,
    isDemo: boolean,
  ): void {
    const bundle = result.canonicalEvidence;
    if (!bundle) return;
    const analysisVersionId = result.metadata.analysisId;
    this.db.prepare(`INSERT INTO analysis_versions
      (id, owner_user_id, candidate_id, legacy_analysis_id, status, analyzed_at,
       deterministic_engine_version, taxonomy_version, requisition_version_id,
       ai_request_schema_version, provider_id, model_id, prompt_version, pricing_version,
       is_demo, recompute_required, legacy_marker, created_at)
      VALUES (?, ?, ?, NULL, 'completed', ?, ?, ?, NULL, NULL, ?, ?, NULL, NULL, ?, 0, NULL, ?)`)
      .run(
        analysisVersionId, ownerUserId, candidateId, result.metadata.analyzedAt,
        result.metadata.engineVersion, bundle.taxonomyVersion, result.metadata.aiProvider,
        result.metadata.aiModel, isDemo ? 1 : 0, result.metadata.analyzedAt,
      );
    const insertFinding = this.db.prepare(`INSERT INTO detector_findings
      (id, analysis_version_id, candidate_repository_id, detector_id, detector_version,
       capability_id, signal_class, repository_id, revision, file_path, symbol, start_line,
       end_line, excerpt_start_offset, excerpt_end_offset)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const finding of bundle.findings) insertFinding.run(
      finding.id, analysisVersionId, candidateRepositoryId, finding.detectorId,
      finding.detectorVersion, finding.capabilityId, finding.signalClass, finding.repositoryId,
      finding.revision, finding.filePath, finding.symbol, finding.startLine, finding.endLine,
      finding.excerptStartOffset, finding.excerptEndOffset,
    );
    const insertCitation = this.db.prepare(`INSERT INTO evidence_citations
      (id, analysis_version_id, finding_id, detector_id, detector_version, repository_id,
       repository_url, repository_name, revision, revision_availability, file_path, symbol,
       start_line, end_line, excerpt, source_link, discovery_origin, attribution_status,
       evidence_level, taxonomy_version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const insertItem = this.db.prepare(`INSERT INTO evidence_items
      (id, analysis_version_id, finding_id, capability_id, claim_scope, evidence_level, taxonomy_version)
      VALUES (?, ?, ?, ?, ?, ?, ?)`);
    const findingById = new Map(bundle.findings.map((finding) => [finding.id, finding]));
    for (const citation of bundle.citations) {
      insertCitation.run(
        citation.id, analysisVersionId, citation.findingId, citation.detectorId,
        citation.detectorVersion, citation.repositoryId, citation.repositoryUrl,
        citation.repositoryName, citation.revision, citation.revisionAvailability,
        citation.filePath, citation.symbol, citation.startLine, citation.endLine, citation.excerpt,
        citation.sourceLink, citation.discoveryOrigin, citation.attributionStatus,
        citation.evidenceLevel, citation.taxonomyVersion,
      );
      const finding = findingById.get(citation.findingId);
      if (finding) insertItem.run(
        randomUUID(), analysisVersionId, finding.id, finding.capabilityId,
        finding.capabilityId, citation.evidenceLevel, citation.taxonomyVersion,
      );
    }
    const insertQuestion = this.db.prepare(`INSERT INTO interview_questions
      (id, analysis_version_id, basis_kind, basis_json, attribution_gate, question, redaction_applied)
      VALUES (?, ?, ?, ?, ?, ?, ?)`);
    for (const question of bundle.interviewQuestions) insertQuestion.run(
      question.id, analysisVersionId, question.basis.kind, JSON.stringify(question.basis),
      question.attributionGate, question.question, question.redactionApplied ? 1 : 0,
    );
    if (result.metadata.corpusMetrics) {
      const repositoryId = bundle.citations[0]?.repositoryId ?? result.repository.commitSha;
      const revision = bundle.citations[0]?.revision ?? null;
      this.db.prepare(`INSERT INTO repository_corpus_metrics
        (id, analysis_version_id, candidate_repository_id, repository_id, revision, analyzed_at, metrics_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
        randomUUID(), analysisVersionId, candidateRepositoryId, repositoryId, revision,
        result.metadata.analyzedAt, JSON.stringify(result.metadata.corpusMetrics),
      );
    }
  }

  private refreshCandidateEvidence(candidateId: string): void {
    const eligibleRows = this.db.prepare(`SELECT analysis_json FROM candidate_analyses
      WHERE candidate_id = ?`)
      .all(candidateId) as unknown as Array<{ analysis_json: string }>;
    const results = eligibleRows.map((row) => parseAnalysis(row.analysis_json)).filter((analysis) => (
      analysis.canonicalEvidence?.citations.some((citation) => citation.attributionStatus === "verified_contributor") === true
    ));
    const count = (this.db.prepare("SELECT COUNT(*) AS count FROM candidate_repository_outcomes WHERE candidate_id = ?").get(candidateId) as { count: number }).count;
    this.db.prepare("UPDATE candidates SET evidence_index = ?, repository_count = ?, verified_claim_count = ? WHERE id = ?")
      .run(calculateEvidenceIndex(results), count, verifiedClaimCount(results), candidateId);
  }

  async createCandidate(ownerUserId: string, input: CreateCandidateInput): Promise<CandidateDetail> {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db.exec("BEGIN");
    try {
      this.db.prepare(`INSERT INTO candidates
        (id, owner_user_id, name, role, source, evidence_index, applied_at, outcome, furthest_stage, is_demo, repository_count, verified_claim_count, unanalyzed_sources)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        id, ownerUserId, input.name, input.role, input.source ?? "Not recorded", 0, now,
        "in_progress", input.intakeOnly ? "applied" : "code_review", input.isDemo ? 1 : 0, input.results.length + (input.failures?.length ?? 0), 0,
        JSON.stringify(input.unanalyzedSources ?? []),
      );
      const insertStage = this.db.prepare("INSERT INTO stage_events (candidate_id, stage, entered_at) VALUES (?, ?, ?)");
      for (const stage of PIPELINE_STAGES.slice(0, input.intakeOnly ? 1 : 3)) insertStage.run(id, stage, now);
      for (const result of input.results) {
        this.insertAnalysis(id, resultWithAttribution(result, selectionFor(input, result.repository.url)));
      }
      const insertFailure = this.db.prepare(`INSERT INTO candidate_repository_outcomes
        (id, candidate_id, repository_url, repository_name, status, code, message, updated_at)
        VALUES (?, ?, ?, ?, 'failed', ?, ?, ?)`);
      for (const failure of input.failures ?? []) {
        insertFailure.run(randomUUID(), id, failure.repositoryUrl, repositoryName(failure.repositoryUrl), failure.code, failure.message, now);
      }
      const repositoryUrls = new Set([
        ...input.results.map((result) => result.repository.url),
        ...(input.failures ?? []).map((failure) => failure.repositoryUrl),
      ]);
      for (const repositoryUrl of repositoryUrls) {
        this.insertRepositoryRelationship(ownerUserId, id, repositoryUrl, selectionFor(input, repositoryUrl), now);
      }
      for (const result of input.results) {
        const legacy = this.db.prepare(`SELECT id FROM candidate_analyses
          WHERE candidate_id = ? AND repository_url = ?`).get(id, result.repository.url) as { id: string } | undefined;
        const relationship = this.db.prepare(`SELECT id FROM candidate_repositories
          WHERE owner_user_id = ? AND candidate_id = ? AND repository_url = ?`)
          .get(ownerUserId, id, result.repository.url) as { id: string } | undefined;
        if (!legacy || !relationship) throw new Error("Canonical repository analysis linkage failed.");
        this.insertCanonicalEvidence(
          ownerUserId,
          id,
          relationship.id,
          legacy.id,
          resultWithAttribution(result, selectionFor(input, result.repository.url)),
          Boolean(input.isDemo),
        );
      }
      if (input.results[0]?.canonicalEvidence) {
        const metrics = completedRunMetrics(input, [...repositoryUrls]);
        this.db.prepare(`INSERT INTO repository_run_metrics
          (id, owner_user_id, analysis_version_id, state, selected_repository_count,
           successful_repository_count, failed_repository_count, pending_repository_count,
           attribution_counts_json, is_demo, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
          randomUUID(), ownerUserId, input.results[0].metadata.analysisId, metrics.state,
          metrics.selectedRepositoryCount, metrics.successfulRepositoryCount,
          metrics.failedRepositoryCount, metrics.pendingRepositoryCount,
          JSON.stringify(metrics.attributionCounts), input.isDemo ? 1 : 0, now,
        );
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    const created = await this.getCandidate(ownerUserId, id);
    if (!created) throw new Error("Candidate persistence failed.");
    return created;
  }

  async recordRepositorySuccess(ownerUserId: string, candidateId: string, result: AnalysisResult, selection?: RepositorySelection): Promise<CandidateDetail | null> {
    const candidate = await this.getCandidate(ownerUserId, candidateId);
    if (!candidate) return null;
    const relationship = candidate.repositories.find((repository) => repository.repositoryUrl === result.repository.url);
    const fromCv = candidate.unanalyzedSources?.includes(result.repository.url) ?? false;
    const source = selection ?? { repositoryUrl: result.repository.url, discoveryOrigin: fromCv ? "CV" : "manual entry", candidateSourceClaim: fromCv };
    const attribution = relationship?.attributionStatus ?? createRepositoryAttributionState(source).attributionStatus;
    const origin = relationship?.discoveryOrigin ?? source.discoveryOrigin;
    const projected = result.canonicalEvidence
      ? { ...result, canonicalEvidence: reprojectGroundedEvidence(result.canonicalEvidence, origin, attribution) }
      : result;
    this.db.exec("BEGIN");
    try {
      if (!relationship) this.insertRepositoryRelationship(ownerUserId, candidateId, result.repository.url, source, result.metadata.analyzedAt);
      this.insertAnalysis(candidateId, projected);
      const legacy = this.db.prepare(`SELECT id FROM candidate_analyses
        WHERE candidate_id = ? AND repository_url = ?`).get(candidateId, result.repository.url) as { id: string } | undefined;
      const activeRelationship = this.db.prepare(`SELECT id FROM candidate_repositories
        WHERE owner_user_id = ? AND candidate_id = ? AND repository_url = ?`)
        .get(ownerUserId, candidateId, result.repository.url) as { id: string } | undefined;
      if (legacy && activeRelationship) {
        this.insertCanonicalEvidence(ownerUserId, candidateId, activeRelationship.id, legacy.id, projected, Boolean(candidate.isDemo));
      }
      this.refreshCandidateEvidence(candidateId);
      if (PIPELINE_STAGES.indexOf(candidate.furthestStage) < PIPELINE_STAGES.indexOf("code_review")) {
        const insertStage = this.db.prepare("INSERT INTO stage_events (candidate_id, stage, entered_at) VALUES (?, ?, ?)");
        for (const stage of PIPELINE_STAGES.slice(PIPELINE_STAGES.indexOf(candidate.furthestStage) + 1, 3)) {
          insertStage.run(candidateId, stage, result.metadata.analyzedAt);
        }
        this.db.prepare("UPDATE candidates SET furthest_stage = 'code_review' WHERE id = ?").run(candidateId);
      }
      // New evidence must be opened again before it counts as checked.
      this.db.prepare("UPDATE candidates SET evidence_reviewed_at = NULL WHERE id = ?").run(candidateId);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return this.getCandidate(ownerUserId, candidateId);
  }

  async verifyRepositoryAttribution(
    ownerUserId: string,
    candidateId: string,
    repositoryUrl: string,
    verification: ContributionVerificationResult,
  ): Promise<CandidateDetail | null> {
    const row = this.db.prepare(`SELECT id, candidate_id, repository_url, repository_owner,
      repository_name, discovery_origin, attribution_status, attribution_updated_at,
      verification_revision, origin_confirmation_required
      FROM candidate_repositories WHERE owner_user_id = ? AND candidate_id = ? AND repository_url = ?`)
      .get(ownerUserId, candidateId, repositoryUrl) as CandidateRepositoryRow | undefined;
    if (!row) return null;
    const current = attributionState(row);
    if (!current) return null;
    const updated = applyProviderVerification(current, verification.proof);
    const transition = updated.history.at(-1);
    if (!transition || transition.reason === "provider_proof_incomplete") {
      return this.getCandidate(ownerUserId, candidateId);
    }

    this.db.exec("BEGIN IMMEDIATE");
    try {
      const changed = this.db.prepare(`UPDATE candidate_repositories SET
        attribution_status = ?, attribution_updated_at = ?, verification_revision = ?,
        linked_provider_identity_id = ?
        WHERE id = ? AND owner_user_id = ? AND candidate_id = ? AND repository_url = ?`)
        .run(
          updated.attributionStatus,
          verification.verifiedAt,
          updated.activeProviderVerification?.immutableContributionRevision ?? null,
          verification.providerIdentityFingerprint,
          row.id,
          ownerUserId,
          candidateId,
          repositoryUrl,
        );
      if (Number(changed.changes) !== 1) throw new Error("Repository attribution changed concurrently.");
      this.db.prepare(`INSERT INTO contribution_verification_events
        (id, candidate_repository_id, from_status, to_status, provider,
         provider_identity_fingerprint, repository_provider_id, immutable_revision,
         reason, verified_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(
          randomUUID(),
          row.id,
          transition.fromStatus,
          transition.toStatus,
          verification.provider,
          verification.providerIdentityFingerprint,
          verification.repositoryProviderId,
          verification.proof.immutableContributionRevision,
          transition.reason,
          verification.verifiedAt,
          verification.verifiedAt,
        );
      this.refreshCandidateEvidence(candidateId);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return this.getCandidate(ownerUserId, candidateId);
  }

  async setEvidenceReviewed(ownerUserId: string, candidateId: string, reviewed: boolean): Promise<CandidateDetail | null> {
    const result = this.db.prepare("UPDATE candidates SET evidence_reviewed_at = ? WHERE id = ? AND owner_user_id = ?")
      .run(reviewed ? new Date().toISOString() : null, candidateId, ownerUserId);
    return Number(result.changes) > 0 ? this.getCandidate(ownerUserId, candidateId) : null;
  }

  async removeFailedRepository(ownerUserId: string, candidateId: string, repositoryUrl: string): Promise<boolean> {
    if (!(await this.getCandidate(ownerUserId, candidateId))) return false;
    this.db.exec("BEGIN");
    try {
      const result = this.db.prepare("DELETE FROM candidate_repository_outcomes WHERE candidate_id = ? AND repository_url = ? AND status = 'failed'").run(candidateId, repositoryUrl);
      if (Number(result.changes) > 0) {
        this.db.prepare("DELETE FROM candidate_repositories WHERE owner_user_id = ? AND candidate_id = ? AND repository_url = ?")
          .run(ownerUserId, candidateId, repositoryUrl);
        this.refreshCandidateEvidence(candidateId);
      }
      this.db.exec("COMMIT");
      return Number(result.changes) > 0;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  async updatePipeline(ownerUserId: string, candidateId: string, stage: PipelineStage, outcome: CandidateOutcome, source?: SourceChannel): Promise<CandidateDetail | null> {
    const existing = await this.getCandidate(ownerUserId, candidateId);
    if (!existing) return null;
    const normalizedOutcome = stage === "hired" ? "hired" : outcome === "hired" ? "in_progress" : outcome;
    const now = new Date().toISOString();
    this.db.exec("BEGIN");
    try {
      this.db.prepare("UPDATE candidates SET furthest_stage = ?, outcome = ?, source = ? WHERE id = ? AND owner_user_id = ?")
        .run(stage, normalizedOutcome, source ?? existing.source, candidateId, ownerUserId);
      this.db.prepare("DELETE FROM stage_events WHERE candidate_id = ?").run(candidateId);
      const insert = this.db.prepare("INSERT INTO stage_events (candidate_id, stage, entered_at) VALUES (?, ?, ?)");
      const enteredAt = new Map(existing.stageHistory.map((event) => [event.stage, event.enteredAt]));
      for (const item of PIPELINE_STAGES.slice(0, PIPELINE_STAGES.indexOf(stage) + 1)) insert.run(candidateId, item, enteredAt.get(item) ?? now);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return this.getCandidate(ownerUserId, candidateId);
  }

  async deleteCandidate(ownerUserId: string, candidateId: string): Promise<boolean> {
    const result = this.db.prepare("DELETE FROM candidates WHERE id = ? AND owner_user_id = ?").run(candidateId, ownerUserId);
    return Number(result.changes) > 0;
  }
}

class PostgresCandidateStore implements CandidatePersistence {
  private initialized: Promise<void> | null = null;

  constructor(private readonly pool: Pool) {}

  private initialize(): Promise<void> {
    this.initialized ??= (async () => {
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS codeproof_candidates (
          id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL, source TEXT NOT NULL,
          evidence_index INTEGER NOT NULL, applied_at TEXT NOT NULL, outcome TEXT NOT NULL, furthest_stage TEXT NOT NULL,
          is_demo BOOLEAN NOT NULL DEFAULT FALSE, repository_count INTEGER NOT NULL DEFAULT 0, verified_claim_count INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_codeproof_candidates_owner ON codeproof_candidates(owner_user_id, applied_at DESC);
        CREATE TABLE IF NOT EXISTS codeproof_stage_events (
          id BIGSERIAL PRIMARY KEY, candidate_id TEXT NOT NULL REFERENCES codeproof_candidates(id) ON DELETE CASCADE,
          stage TEXT NOT NULL, entered_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS codeproof_candidate_analyses (
          id TEXT PRIMARY KEY, candidate_id TEXT NOT NULL REFERENCES codeproof_candidates(id) ON DELETE CASCADE,
          repository_url TEXT NOT NULL, repository_name TEXT NOT NULL, primary_language TEXT, project_type TEXT NOT NULL,
          evidence_index INTEGER NOT NULL, summary TEXT NOT NULL, analyzed_at TEXT NOT NULL, analysis_json JSONB NOT NULL,
          UNIQUE(candidate_id, repository_url)
        );
        CREATE TABLE IF NOT EXISTS codeproof_candidate_repository_outcomes (
          id TEXT PRIMARY KEY, candidate_id TEXT NOT NULL REFERENCES codeproof_candidates(id) ON DELETE CASCADE,
          repository_url TEXT NOT NULL, repository_name TEXT NOT NULL, status TEXT NOT NULL,
          code TEXT, message TEXT, updated_at TEXT NOT NULL, UNIQUE(candidate_id, repository_url)
        );
        ALTER TABLE codeproof_candidates ADD COLUMN IF NOT EXISTS evidence_reviewed_at TEXT;
        ALTER TABLE codeproof_candidates ADD COLUMN IF NOT EXISTS unanalyzed_sources TEXT;
      `);
      await ensurePostgreSQLRemediationSchema(this.pool);
    })();
    return this.initialized;
  }

  private async events(candidateId: string): Promise<StageEvent[]> {
    const rows = await this.pool.query<StageRow>("SELECT stage, entered_at FROM codeproof_stage_events WHERE candidate_id = $1 ORDER BY entered_at, id", [candidateId]);
    return rows.rows.map((row) => ({ stage: row.stage, enteredAt: row.entered_at }));
  }

  async listCandidates(ownerUserId: string): Promise<CandidateRecord[]> {
    await this.initialize();
    const result = await this.pool.query<CandidateRow>("SELECT * FROM codeproof_candidates WHERE owner_user_id = $1 ORDER BY applied_at DESC", [ownerUserId]);
    return Promise.all(result.rows.map(async (row) => mapCandidate(row, await this.events(row.id))));
  }

  async getCandidate(ownerUserId: string, id: string): Promise<CandidateDetail | null> {
    await this.initialize();
    const candidate = await this.pool.query<CandidateRow>("SELECT * FROM codeproof_candidates WHERE id = $1 AND owner_user_id = $2", [id, ownerUserId]);
    const row = candidate.rows[0];
    if (!row) return null;
    const [events, analyses, outcomes, repositories] = await Promise.all([
      this.events(id),
      this.pool.query<AnalysisRow>("SELECT * FROM codeproof_candidate_analyses WHERE candidate_id = $1 ORDER BY analyzed_at DESC", [id]),
      this.pool.query<OutcomeRow>("SELECT * FROM codeproof_candidate_repository_outcomes WHERE candidate_id = $1 ORDER BY updated_at DESC", [id]),
      this.pool.query<CandidateRepositoryRow>(`SELECT id, candidate_id, repository_url, repository_owner,
        repository_name, discovery_origin, attribution_status, attribution_updated_at,
        verification_revision, origin_confirmation_required
        FROM codeproof_candidate_repositories WHERE candidate_id = $1 AND owner_user_id = $2
        ORDER BY attribution_updated_at DESC`, [id, ownerUserId]),
    ]);
    return {
      ...mapCandidate(row, events),
      analyses: analysesWithAttribution(analyses.rows, repositories.rows.map(mapRepository)),
      repositoryOutcomes: outcomes.rows.map(mapOutcome),
      repositories: repositories.rows.map(mapRepository),
    };
  }

  private async insertRepositoryRelationship(
    client: PoolClient,
    ownerUserId: string,
    candidateId: string,
    repositoryUrl: string,
    selection: RepositorySelection,
    now: string,
  ): Promise<void> {
    const state = createRepositoryAttributionState(selection);
    const parts = repositoryParts(repositoryUrl);
    const relationshipId = randomUUID();
    await client.query(`INSERT INTO codeproof_candidate_repositories
      (id, owner_user_id, candidate_id, repository_url, repository_owner, repository_name,
       discovery_origin, attribution_status, attribution_updated_at, verification_revision,
       linked_provider_identity_id, origin_confirmation_required, legacy_marker)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NULL,NULL,FALSE,NULL)`, [
      relationshipId,
      ownerUserId,
      candidateId,
      repositoryUrl,
      parts.owner,
      parts.name,
      state.discoveryOrigin,
      state.attributionStatus,
      now,
    ]);
    if (state.attributionStatus === "candidate_claimed") {
      await client.query(`INSERT INTO codeproof_contribution_verification_events
        (id, candidate_repository_id, from_status, to_status, provider,
         provider_identity_fingerprint, repository_provider_id, immutable_revision,
         reason, verified_at, created_at)
        VALUES ($1,$2,'unverified','candidate_claimed',NULL,NULL,NULL,NULL,
          'candidate_source_claim',NULL,$3)`, [randomUUID(), relationshipId, now]);
    }
  }

  private async insertAnalysis(client: PoolClient, candidateId: string, result: AnalysisResult): Promise<void> {
    const fields = analysisFields(result);
    await client.query(`INSERT INTO codeproof_candidate_analyses
      (id, candidate_id, repository_url, repository_name, primary_language, project_type, evidence_index, summary, analyzed_at, analysis_json)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
      ON CONFLICT(candidate_id, repository_url) DO UPDATE SET repository_name=EXCLUDED.repository_name,
      primary_language=EXCLUDED.primary_language, project_type=EXCLUDED.project_type, evidence_index=EXCLUDED.evidence_index,
      summary=EXCLUDED.summary, analyzed_at=EXCLUDED.analyzed_at, analysis_json=EXCLUDED.analysis_json`, [
      randomUUID(), candidateId, result.repository.url, `${result.repository.owner}/${result.repository.name}`, fields.primaryLanguage,
      result.projectType, fields.evidenceIndex, fields.summary, result.metadata.analyzedAt, JSON.stringify(result),
    ]);
    await client.query(`INSERT INTO codeproof_candidate_repository_outcomes
      (id, candidate_id, repository_url, repository_name, status, code, message, updated_at)
      VALUES ($1,$2,$3,$4,'analyzed',NULL,NULL,$5)
      ON CONFLICT(candidate_id, repository_url) DO UPDATE SET repository_name=EXCLUDED.repository_name,
      status='analyzed', code=NULL, message=NULL, updated_at=EXCLUDED.updated_at`, [
      randomUUID(), candidateId, result.repository.url, `${result.repository.owner}/${result.repository.name}`, result.metadata.analyzedAt,
    ]);
  }

  private async insertCanonicalEvidence(
    client: PoolClient,
    ownerUserId: string,
    candidateId: string,
    candidateRepositoryId: string,
    _legacyAnalysisId: string,
    result: AnalysisResult,
    isDemo: boolean,
  ): Promise<void> {
    const bundle = result.canonicalEvidence;
    if (!bundle) return;
    const analysisVersionId = result.metadata.analysisId;
    await client.query(`INSERT INTO codeproof_analysis_versions
      (id, owner_user_id, candidate_id, legacy_analysis_id, status, analyzed_at,
       deterministic_engine_version, taxonomy_version, requisition_version_id,
       ai_request_schema_version, provider_id, model_id, prompt_version, pricing_version,
       is_demo, recompute_required, legacy_marker, created_at)
      VALUES ($1,$2,$3,NULL,'completed',$4,$5,$6,NULL,NULL,$7,$8,NULL,NULL,$9,FALSE,NULL,$4)`, [
      analysisVersionId, ownerUserId, candidateId, result.metadata.analyzedAt,
      result.metadata.engineVersion, bundle.taxonomyVersion, result.metadata.aiProvider,
      result.metadata.aiModel, isDemo,
    ]);
    for (const finding of bundle.findings) await client.query(`INSERT INTO codeproof_detector_findings
      (id, analysis_version_id, candidate_repository_id, detector_id, detector_version,
       capability_id, signal_class, repository_id, revision, file_path, symbol, start_line,
       end_line, excerpt_start_offset, excerpt_end_offset)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`, [
      finding.id, analysisVersionId, candidateRepositoryId, finding.detectorId,
      finding.detectorVersion, finding.capabilityId, finding.signalClass, finding.repositoryId,
      finding.revision, finding.filePath, finding.symbol, finding.startLine, finding.endLine,
      finding.excerptStartOffset, finding.excerptEndOffset,
    ]);
    const findingById = new Map(bundle.findings.map((finding) => [finding.id, finding]));
    for (const citation of bundle.citations) {
      await client.query(`INSERT INTO codeproof_evidence_citations
        (id, analysis_version_id, finding_id, detector_id, detector_version, repository_id,
         repository_url, repository_name, revision, revision_availability, file_path, symbol,
         start_line, end_line, excerpt, source_link, discovery_origin, attribution_status,
         evidence_level, taxonomy_version)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`, [
        citation.id, analysisVersionId, citation.findingId, citation.detectorId,
        citation.detectorVersion, citation.repositoryId, citation.repositoryUrl,
        citation.repositoryName, citation.revision, citation.revisionAvailability,
        citation.filePath, citation.symbol, citation.startLine, citation.endLine, citation.excerpt,
        citation.sourceLink, citation.discoveryOrigin, citation.attributionStatus,
        citation.evidenceLevel, citation.taxonomyVersion,
      ]);
      const finding = findingById.get(citation.findingId);
      if (finding) await client.query(`INSERT INTO codeproof_evidence_items
        (id, analysis_version_id, finding_id, capability_id, claim_scope, evidence_level, taxonomy_version)
        VALUES ($1,$2,$3,$4,$4,$5,$6)`, [
        randomUUID(), analysisVersionId, finding.id, finding.capabilityId,
        citation.evidenceLevel, citation.taxonomyVersion,
      ]);
    }
    for (const question of bundle.interviewQuestions) await client.query(`INSERT INTO codeproof_interview_questions
      (id, analysis_version_id, basis_kind, basis_json, attribution_gate, question, redaction_applied)
      VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7)`, [
      question.id, analysisVersionId, question.basis.kind, JSON.stringify(question.basis),
      question.attributionGate, question.question, question.redactionApplied,
    ]);
    if (result.metadata.corpusMetrics) {
      const repositoryId = bundle.citations[0]?.repositoryId ?? result.repository.commitSha;
      const revision = bundle.citations[0]?.revision ?? null;
      await client.query(`INSERT INTO codeproof_repository_corpus_metrics
        (id, analysis_version_id, candidate_repository_id, repository_id, revision, analyzed_at, metrics_json)
        VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`, [
        randomUUID(), analysisVersionId, candidateRepositoryId, repositoryId, revision,
        result.metadata.analyzedAt, JSON.stringify(result.metadata.corpusMetrics),
      ]);
    }
  }

  private async refreshCandidateEvidence(client: PoolClient, candidateId: string): Promise<void> {
    const rows = await client.query<{ analysis_json: AnalysisResult }>(`SELECT analysis_json
      FROM codeproof_candidate_analyses WHERE candidate_id = $1`, [candidateId]);
    const results = rows.rows.map((row) => row.analysis_json).filter((analysis) => (
      analysis.canonicalEvidence?.citations.some((citation) => citation.attributionStatus === "verified_contributor") === true
    ));
    const count = await client.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM codeproof_candidate_repository_outcomes WHERE candidate_id = $1", [candidateId]);
    await client.query("UPDATE codeproof_candidates SET evidence_index=$1, repository_count=$2, verified_claim_count=$3 WHERE id=$4", [
      calculateEvidenceIndex(results), Number(count.rows[0]?.count ?? 0), verifiedClaimCount(results), candidateId,
    ]);
  }

  async createCandidate(ownerUserId: string, input: CreateCandidateInput): Promise<CandidateDetail> {
    await this.initialize();
    const id = randomUUID();
    const now = new Date().toISOString();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`INSERT INTO codeproof_candidates
        (id,owner_user_id,name,role,source,evidence_index,applied_at,outcome,furthest_stage,is_demo,repository_count,verified_claim_count,unanalyzed_sources)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`, [
        id, ownerUserId, input.name, input.role, input.source ?? "Not recorded", 0, now, "in_progress", input.intakeOnly ? "applied" : "code_review",
        Boolean(input.isDemo), input.results.length + (input.failures?.length ?? 0), 0,
        JSON.stringify(input.unanalyzedSources ?? []),
      ]);
      for (const stage of PIPELINE_STAGES.slice(0, input.intakeOnly ? 1 : 3)) {
        await client.query("INSERT INTO codeproof_stage_events (candidate_id,stage,entered_at) VALUES ($1,$2,$3)", [id, stage, now]);
      }
      for (const result of input.results) {
        await this.insertAnalysis(client, id, resultWithAttribution(result, selectionFor(input, result.repository.url)));
      }
      for (const failure of input.failures ?? []) {
        await client.query(`INSERT INTO codeproof_candidate_repository_outcomes
          (id,candidate_id,repository_url,repository_name,status,code,message,updated_at)
          VALUES ($1,$2,$3,$4,'failed',$5,$6,$7)`, [
          randomUUID(), id, failure.repositoryUrl, repositoryName(failure.repositoryUrl), failure.code, failure.message, now,
        ]);
      }
      const repositoryUrls = new Set([
        ...input.results.map((result) => result.repository.url),
        ...(input.failures ?? []).map((failure) => failure.repositoryUrl),
      ]);
      for (const repositoryUrl of repositoryUrls) {
        await this.insertRepositoryRelationship(client, ownerUserId, id, repositoryUrl, selectionFor(input, repositoryUrl), now);
      }
      for (const result of input.results) {
        const legacy = await client.query<{ id: string }>(`SELECT id FROM codeproof_candidate_analyses
          WHERE candidate_id=$1 AND repository_url=$2`, [id, result.repository.url]);
        const relationship = await client.query<{ id: string }>(`SELECT id FROM codeproof_candidate_repositories
          WHERE owner_user_id=$1 AND candidate_id=$2 AND repository_url=$3`, [ownerUserId, id, result.repository.url]);
        if (!legacy.rows[0] || !relationship.rows[0]) throw new Error("Canonical repository analysis linkage failed.");
        await this.insertCanonicalEvidence(
          client,
          ownerUserId,
          id,
          relationship.rows[0].id,
          legacy.rows[0].id,
          resultWithAttribution(result, selectionFor(input, result.repository.url)),
          Boolean(input.isDemo),
        );
      }
      if (input.results[0]?.canonicalEvidence) {
        const metrics = completedRunMetrics(input, [...repositoryUrls]);
        await client.query(`INSERT INTO codeproof_repository_run_metrics
          (id, owner_user_id, analysis_version_id, state, selected_repository_count,
           successful_repository_count, failed_repository_count, pending_repository_count,
           attribution_counts_json, is_demo, created_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11)`, [
          randomUUID(), ownerUserId, input.results[0].metadata.analysisId, metrics.state,
          metrics.selectedRepositoryCount, metrics.successfulRepositoryCount,
          metrics.failedRepositoryCount, metrics.pendingRepositoryCount,
          JSON.stringify(metrics.attributionCounts), Boolean(input.isDemo), now,
        ]);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    const created = await this.getCandidate(ownerUserId, id);
    if (!created) throw new Error("Candidate persistence failed.");
    return created;
  }

  async recordRepositorySuccess(ownerUserId: string, candidateId: string, result: AnalysisResult, selection?: RepositorySelection): Promise<CandidateDetail | null> {
    const candidate = await this.getCandidate(ownerUserId, candidateId);
    if (!candidate) return null;
    const relationship = candidate.repositories.find((repository) => repository.repositoryUrl === result.repository.url);
    const fromCv = candidate.unanalyzedSources?.includes(result.repository.url) ?? false;
    const source = selection ?? { repositoryUrl: result.repository.url, discoveryOrigin: fromCv ? "CV" : "manual entry", candidateSourceClaim: fromCv };
    const attribution = relationship?.attributionStatus ?? createRepositoryAttributionState(source).attributionStatus;
    const origin = relationship?.discoveryOrigin ?? source.discoveryOrigin;
    const projected = result.canonicalEvidence
      ? { ...result, canonicalEvidence: reprojectGroundedEvidence(result.canonicalEvidence, origin, attribution) }
      : result;
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      if (!relationship) await this.insertRepositoryRelationship(client, ownerUserId, candidateId, result.repository.url, source, result.metadata.analyzedAt);
      await this.insertAnalysis(client, candidateId, projected);
      {
        const activeRelationship = (await client.query<{ id: string }>(`SELECT id FROM codeproof_candidate_repositories
          WHERE owner_user_id=$1 AND candidate_id=$2 AND repository_url=$3`, [ownerUserId, candidateId, result.repository.url])).rows[0];
        const legacy = await client.query<{ id: string }>(`SELECT id FROM codeproof_candidate_analyses
          WHERE candidate_id=$1 AND repository_url=$2`, [candidateId, result.repository.url]);
        if (legacy.rows[0] && activeRelationship) await this.insertCanonicalEvidence(
          client, ownerUserId, candidateId, activeRelationship.id, legacy.rows[0].id, projected, Boolean(candidate.isDemo),
        );
      }
      await this.refreshCandidateEvidence(client, candidateId);
      if (PIPELINE_STAGES.indexOf(candidate.furthestStage) < PIPELINE_STAGES.indexOf("code_review")) {
        for (const stage of PIPELINE_STAGES.slice(PIPELINE_STAGES.indexOf(candidate.furthestStage) + 1, 3)) {
          await client.query("INSERT INTO codeproof_stage_events (candidate_id,stage,entered_at) VALUES ($1,$2,$3)", [candidateId, stage, result.metadata.analyzedAt]);
        }
        await client.query("UPDATE codeproof_candidates SET furthest_stage='code_review' WHERE id=$1", [candidateId]);
      }
      // New evidence must be opened again before it counts as checked.
      await client.query("UPDATE codeproof_candidates SET evidence_reviewed_at=NULL WHERE id=$1", [candidateId]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    return this.getCandidate(ownerUserId, candidateId);
  }

  async verifyRepositoryAttribution(
    ownerUserId: string,
    candidateId: string,
    repositoryUrl: string,
    verification: ContributionVerificationResult,
  ): Promise<CandidateDetail | null> {
    await this.initialize();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<CandidateRepositoryRow>(`SELECT id, candidate_id, repository_url,
        repository_owner, repository_name, discovery_origin, attribution_status, attribution_updated_at,
        verification_revision, origin_confirmation_required
        FROM codeproof_candidate_repositories
        WHERE owner_user_id=$1 AND candidate_id=$2 AND repository_url=$3 FOR UPDATE`, [
        ownerUserId, candidateId, repositoryUrl,
      ]);
      const row = result.rows[0];
      if (!row) {
        await client.query("ROLLBACK");
        return null;
      }
      const current = attributionState(row);
      if (!current) {
        await client.query("ROLLBACK");
        return null;
      }
      const updated = applyProviderVerification(current, verification.proof);
      const transition = updated.history.at(-1);
      if (!transition || transition.reason === "provider_proof_incomplete") {
        await client.query("COMMIT");
        return this.getCandidate(ownerUserId, candidateId);
      }
      const changed = await client.query(`UPDATE codeproof_candidate_repositories SET
        attribution_status=$1, attribution_updated_at=$2, verification_revision=$3,
        linked_provider_identity_id=$4
        WHERE id=$5 AND owner_user_id=$6 AND candidate_id=$7 AND repository_url=$8`, [
        updated.attributionStatus,
        verification.verifiedAt,
        updated.activeProviderVerification?.immutableContributionRevision ?? null,
        verification.providerIdentityFingerprint,
        row.id,
        ownerUserId,
        candidateId,
        repositoryUrl,
      ]);
      if (changed.rowCount !== 1) throw new Error("Repository attribution changed concurrently.");
      await client.query(`INSERT INTO codeproof_contribution_verification_events
        (id, candidate_repository_id, from_status, to_status, provider,
         provider_identity_fingerprint, repository_provider_id, immutable_revision,
         reason, verified_at, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)`, [
        randomUUID(),
        row.id,
        transition.fromStatus,
        transition.toStatus,
        verification.provider,
        verification.providerIdentityFingerprint,
        verification.repositoryProviderId,
        verification.proof.immutableContributionRevision,
        transition.reason,
        verification.verifiedAt,
      ]);
      await this.refreshCandidateEvidence(client, candidateId);
      await client.query("COMMIT");
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* Preserve the original error. */ }
      throw error;
    } finally {
      client.release();
    }
    return this.getCandidate(ownerUserId, candidateId);
  }

  async setEvidenceReviewed(ownerUserId: string, candidateId: string, reviewed: boolean): Promise<CandidateDetail | null> {
    await this.initialize();
    const result = await this.pool.query("UPDATE codeproof_candidates SET evidence_reviewed_at=$1 WHERE id=$2 AND owner_user_id=$3", [
      reviewed ? new Date().toISOString() : null, candidateId, ownerUserId,
    ]);
    return (result.rowCount ?? 0) > 0 ? this.getCandidate(ownerUserId, candidateId) : null;
  }

  async removeFailedRepository(ownerUserId: string, candidateId: string, repositoryUrl: string): Promise<boolean> {
    if (!(await this.getCandidate(ownerUserId, candidateId))) return false;
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const removed = await client.query("DELETE FROM codeproof_candidate_repository_outcomes WHERE candidate_id=$1 AND repository_url=$2 AND status='failed'", [candidateId, repositoryUrl]);
      if ((removed.rowCount ?? 0) > 0) {
        await client.query(`DELETE FROM codeproof_candidate_repositories
          WHERE owner_user_id=$1 AND candidate_id=$2 AND repository_url=$3`, [ownerUserId, candidateId, repositoryUrl]);
        await this.refreshCandidateEvidence(client, candidateId);
      }
      await client.query("COMMIT");
      return (removed.rowCount ?? 0) > 0;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async updatePipeline(ownerUserId: string, candidateId: string, stage: PipelineStage, outcome: CandidateOutcome, source?: SourceChannel): Promise<CandidateDetail | null> {
    const existing = await this.getCandidate(ownerUserId, candidateId);
    if (!existing) return null;
    const normalizedOutcome = stage === "hired" ? "hired" : outcome === "hired" ? "in_progress" : outcome;
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("UPDATE codeproof_candidates SET furthest_stage=$1,outcome=$2,source=$3 WHERE id=$4 AND owner_user_id=$5", [stage, normalizedOutcome, source ?? existing.source, candidateId, ownerUserId]);
      await client.query("DELETE FROM codeproof_stage_events WHERE candidate_id=$1", [candidateId]);
      const now = new Date().toISOString();
      const enteredAt = new Map(existing.stageHistory.map((event) => [event.stage, event.enteredAt]));
      for (const item of PIPELINE_STAGES.slice(0, PIPELINE_STAGES.indexOf(stage) + 1)) {
        await client.query("INSERT INTO codeproof_stage_events (candidate_id,stage,entered_at) VALUES ($1,$2,$3)", [candidateId, item, enteredAt.get(item) ?? now]);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    return this.getCandidate(ownerUserId, candidateId);
  }

  async deleteCandidate(ownerUserId: string, candidateId: string): Promise<boolean> {
    await this.initialize();
    const result = await this.pool.query("DELETE FROM codeproof_candidates WHERE id=$1 AND owner_user_id=$2", [candidateId, ownerUserId]);
    return (result.rowCount ?? 0) > 0;
  }
}

const globalStore = globalThis as typeof globalThis & { codeproofCandidateStore?: CandidatePersistence };

export function getCandidateStore(): CandidatePersistence {
  if (globalStore.codeproofCandidateStore) return globalStore.codeproofCandidateStore;
  const pool = getPostgresPool();
  globalStore.codeproofCandidateStore = pool ? new PostgresCandidateStore(pool) : new CandidateStore();
  return globalStore.codeproofCandidateStore;
}
