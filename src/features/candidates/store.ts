import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Pool, PoolClient } from "pg";
import { getPostgresPool } from "@/features/persistence/postgres";
import type { CandidateDetail, CandidateRepositoryOutcome, RepositoryFailure } from "./types";
import {
  PIPELINE_STAGES,
  type CandidateOutcome,
  type CandidateRecord,
  type PipelineStage,
  type Role,
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

interface StageRow {
  stage: PipelineStage;
  entered_at: string;
}

export interface CreateCandidateInput {
  name: string;
  role: Role;
  results: AnalysisResult[];
  failures?: RepositoryFailure[];
  isDemo?: boolean;
}

export interface CandidatePersistence {
  listCandidates(ownerUserId: string): Promise<CandidateRecord[]>;
  getCandidate(ownerUserId: string, id: string): Promise<CandidateDetail | null>;
  createCandidate(ownerUserId: string, input: CreateCandidateInput): Promise<CandidateDetail>;
  recordRepositorySuccess(ownerUserId: string, candidateId: string, result: AnalysisResult): Promise<CandidateDetail | null>;
  removeFailedRepository(ownerUserId: string, candidateId: string, repositoryUrl: string): Promise<boolean>;
  updatePipeline(ownerUserId: string, candidateId: string, stage: PipelineStage, outcome: CandidateOutcome): Promise<CandidateDetail | null>;
  deleteCandidate(ownerUserId: string, candidateId: string): Promise<boolean>;
}

function parseAnalysis(value: string | AnalysisResult): AnalysisResult {
  return typeof value === "string" ? JSON.parse(value) as AnalysisResult : value;
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
    source: row.source as CandidateRecord["source"],
    verifiedSkillScore: Number(row.evidence_index),
    appliedAt: row.applied_at,
    outcome: row.outcome,
    furthestStage: row.furthest_stage,
    stageHistory: events,
    isDemo: Boolean(row.is_demo),
    repositoryCount: Number(row.repository_count),
    verifiedClaimCount: Number(row.verified_claim_count),
  };
}

function mapAnalysis(row: AnalysisRow) {
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
    result: parseAnalysis(row.analysis_json),
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
    return { ...mapCandidate(row, this.events(id)), analyses: analyses.map(mapAnalysis), repositoryOutcomes: outcomes.map(mapOutcome) };
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

  private refreshCandidateEvidence(candidateId: string): void {
    const rows = this.db.prepare("SELECT analysis_json FROM candidate_analyses WHERE candidate_id = ?").all(candidateId) as unknown as Array<{ analysis_json: string }>;
    const results = rows.map((row) => parseAnalysis(row.analysis_json));
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
        (id, owner_user_id, name, role, source, evidence_index, applied_at, outcome, furthest_stage, is_demo, repository_count, verified_claim_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        id, ownerUserId, input.name, input.role, "CodeProof", calculateEvidenceIndex(input.results), now,
        "in_progress", "code_review", input.isDemo ? 1 : 0, input.results.length + (input.failures?.length ?? 0), verifiedClaimCount(input.results),
      );
      const insertStage = this.db.prepare("INSERT INTO stage_events (candidate_id, stage, entered_at) VALUES (?, ?, ?)");
      for (const stage of PIPELINE_STAGES.slice(0, 3)) insertStage.run(id, stage, now);
      for (const result of input.results) this.insertAnalysis(id, result);
      const insertFailure = this.db.prepare(`INSERT INTO candidate_repository_outcomes
        (id, candidate_id, repository_url, repository_name, status, code, message, updated_at)
        VALUES (?, ?, ?, ?, 'failed', ?, ?, ?)`);
      for (const failure of input.failures ?? []) {
        insertFailure.run(randomUUID(), id, failure.repositoryUrl, repositoryName(failure.repositoryUrl), failure.code, failure.message, now);
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

  async recordRepositorySuccess(ownerUserId: string, candidateId: string, result: AnalysisResult): Promise<CandidateDetail | null> {
    if (!(await this.getCandidate(ownerUserId, candidateId))) return null;
    this.db.exec("BEGIN");
    try {
      this.insertAnalysis(candidateId, result);
      this.refreshCandidateEvidence(candidateId);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return this.getCandidate(ownerUserId, candidateId);
  }

  async removeFailedRepository(ownerUserId: string, candidateId: string, repositoryUrl: string): Promise<boolean> {
    if (!(await this.getCandidate(ownerUserId, candidateId))) return false;
    const result = this.db.prepare("DELETE FROM candidate_repository_outcomes WHERE candidate_id = ? AND repository_url = ? AND status = 'failed'").run(candidateId, repositoryUrl);
    if (Number(result.changes) > 0) this.refreshCandidateEvidence(candidateId);
    return Number(result.changes) > 0;
  }

  async updatePipeline(ownerUserId: string, candidateId: string, stage: PipelineStage, outcome: CandidateOutcome): Promise<CandidateDetail | null> {
    const existing = await this.getCandidate(ownerUserId, candidateId);
    if (!existing) return null;
    const normalizedOutcome = stage === "hired" ? "hired" : outcome === "hired" ? "in_progress" : outcome;
    const now = new Date().toISOString();
    this.db.exec("BEGIN");
    try {
      this.db.prepare("UPDATE candidates SET furthest_stage = ?, outcome = ? WHERE id = ? AND owner_user_id = ?")
        .run(stage, normalizedOutcome, candidateId, ownerUserId);
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
    this.initialized ??= this.pool.query(`
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
    `).then(() => undefined);
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
    const [events, analyses, outcomes] = await Promise.all([
      this.events(id),
      this.pool.query<AnalysisRow>("SELECT * FROM codeproof_candidate_analyses WHERE candidate_id = $1 ORDER BY analyzed_at DESC", [id]),
      this.pool.query<OutcomeRow>("SELECT * FROM codeproof_candidate_repository_outcomes WHERE candidate_id = $1 ORDER BY updated_at DESC", [id]),
    ]);
    return { ...mapCandidate(row, events), analyses: analyses.rows.map(mapAnalysis), repositoryOutcomes: outcomes.rows.map(mapOutcome) };
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

  private async refreshCandidateEvidence(client: PoolClient, candidateId: string): Promise<void> {
    const rows = await client.query<{ analysis_json: AnalysisResult }>("SELECT analysis_json FROM codeproof_candidate_analyses WHERE candidate_id = $1", [candidateId]);
    const results = rows.rows.map((row) => row.analysis_json);
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
        (id,owner_user_id,name,role,source,evidence_index,applied_at,outcome,furthest_stage,is_demo,repository_count,verified_claim_count)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [
        id, ownerUserId, input.name, input.role, "CodeProof", calculateEvidenceIndex(input.results), now, "in_progress", "code_review",
        Boolean(input.isDemo), input.results.length + (input.failures?.length ?? 0), verifiedClaimCount(input.results),
      ]);
      for (const stage of PIPELINE_STAGES.slice(0, 3)) {
        await client.query("INSERT INTO codeproof_stage_events (candidate_id,stage,entered_at) VALUES ($1,$2,$3)", [id, stage, now]);
      }
      for (const result of input.results) await this.insertAnalysis(client, id, result);
      for (const failure of input.failures ?? []) {
        await client.query(`INSERT INTO codeproof_candidate_repository_outcomes
          (id,candidate_id,repository_url,repository_name,status,code,message,updated_at)
          VALUES ($1,$2,$3,$4,'failed',$5,$6,$7)`, [
          randomUUID(), id, failure.repositoryUrl, repositoryName(failure.repositoryUrl), failure.code, failure.message, now,
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

  async recordRepositorySuccess(ownerUserId: string, candidateId: string, result: AnalysisResult): Promise<CandidateDetail | null> {
    if (!(await this.getCandidate(ownerUserId, candidateId))) return null;
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await this.insertAnalysis(client, candidateId, result);
      await this.refreshCandidateEvidence(client, candidateId);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    return this.getCandidate(ownerUserId, candidateId);
  }

  async removeFailedRepository(ownerUserId: string, candidateId: string, repositoryUrl: string): Promise<boolean> {
    if (!(await this.getCandidate(ownerUserId, candidateId))) return false;
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const removed = await client.query("DELETE FROM codeproof_candidate_repository_outcomes WHERE candidate_id=$1 AND repository_url=$2 AND status='failed'", [candidateId, repositoryUrl]);
      if ((removed.rowCount ?? 0) > 0) await this.refreshCandidateEvidence(client, candidateId);
      await client.query("COMMIT");
      return (removed.rowCount ?? 0) > 0;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async updatePipeline(ownerUserId: string, candidateId: string, stage: PipelineStage, outcome: CandidateOutcome): Promise<CandidateDetail | null> {
    const existing = await this.getCandidate(ownerUserId, candidateId);
    if (!existing) return null;
    const normalizedOutcome = stage === "hired" ? "hired" : outcome === "hired" ? "in_progress" : outcome;
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("UPDATE codeproof_candidates SET furthest_stage=$1,outcome=$2 WHERE id=$3 AND owner_user_id=$4", [stage, normalizedOutcome, candidateId, ownerUserId]);
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
