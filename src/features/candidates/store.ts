import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { CandidateDetail } from "./types";
import type { CandidateRecord, Role, StageEvent } from "@/features/hiring-analytics/types";
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
  name: string;
  role: string;
  source: string;
  evidence_index: number;
  applied_at: string;
  outcome: CandidateRecord["outcome"];
  furthest_stage: CandidateRecord["furthestStage"];
  is_demo: number;
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
  analysis_json: string;
}

export class CandidateStore {
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
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        source TEXT NOT NULL,
        evidence_index INTEGER NOT NULL,
        applied_at TEXT NOT NULL,
        outcome TEXT NOT NULL,
        furthest_stage TEXT NOT NULL,
        is_demo INTEGER NOT NULL DEFAULT 0,
        repository_count INTEGER NOT NULL DEFAULT 0,
        verified_claim_count INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS stage_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
        stage TEXT NOT NULL,
        entered_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS candidate_analyses (
        id TEXT PRIMARY KEY,
        candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
        repository_url TEXT NOT NULL,
        repository_name TEXT NOT NULL,
        primary_language TEXT,
        project_type TEXT NOT NULL,
        evidence_index INTEGER NOT NULL,
        summary TEXT NOT NULL,
        analyzed_at TEXT NOT NULL,
        analysis_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_candidate_analyses_candidate ON candidate_analyses(candidate_id);
      CREATE INDEX IF NOT EXISTS idx_stage_events_candidate ON stage_events(candidate_id);
    `);
  }

  private events(candidateId: string): StageEvent[] {
    const rows = this.db.prepare("SELECT stage, entered_at FROM stage_events WHERE candidate_id = ? ORDER BY entered_at").all(candidateId) as unknown as Array<{ stage: StageEvent["stage"]; entered_at: string }>;
    return rows.map((row) => ({ stage: row.stage, enteredAt: row.entered_at }));
  }

  private toCandidate(row: CandidateRow): CandidateRecord {
    return {
      id: row.id,
      name: row.name,
      role: row.role as Role,
      source: row.source as CandidateRecord["source"],
      verifiedSkillScore: row.evidence_index,
      appliedAt: row.applied_at,
      outcome: row.outcome,
      furthestStage: row.furthest_stage,
      stageHistory: this.events(row.id),
      isDemo: Boolean(row.is_demo),
      repositoryCount: row.repository_count,
      verifiedClaimCount: row.verified_claim_count,
    };
  }

  listCandidates(): CandidateRecord[] {
    const rows = this.db.prepare("SELECT * FROM candidates ORDER BY applied_at DESC").all() as unknown as CandidateRow[];
    return rows.map((row) => this.toCandidate(row));
  }

  getCandidate(id: string): CandidateDetail | null {
    const row = this.db.prepare("SELECT * FROM candidates WHERE id = ?").get(id) as CandidateRow | undefined;
    if (!row) return null;
    const analyses = this.db.prepare("SELECT * FROM candidate_analyses WHERE candidate_id = ? ORDER BY analyzed_at DESC").all(id) as unknown as AnalysisRow[];
    return {
      ...this.toCandidate(row),
      analyses: analyses.map((analysis) => ({
        id: analysis.id,
        candidateId: analysis.candidate_id,
        repositoryUrl: analysis.repository_url,
        repositoryName: analysis.repository_name,
        primaryLanguage: analysis.primary_language,
        projectType: analysis.project_type,
        evidenceIndex: analysis.evidence_index,
        summary: analysis.summary,
        analyzedAt: analysis.analyzed_at,
        result: JSON.parse(analysis.analysis_json) as AnalysisResult,
      })),
    };
  }

  createCandidate(input: { name: string; role: Role; results: AnalysisResult[]; isDemo?: boolean }): CandidateDetail {
    const id = randomUUID();
    const now = new Date().toISOString();
    const evidenceIndex = calculateEvidenceIndex(input.results);
    const verifiedClaimCount = new Set(input.results.flatMap((result) => result.resumeVerification?.claims.filter((claim) => claim.support !== "No Repository Evidence").map((claim) => claim.claim) ?? [])).size;
    this.db.exec("BEGIN");
    try {
      this.db.prepare(`INSERT INTO candidates
        (id, name, role, source, evidence_index, applied_at, outcome, furthest_stage, is_demo, repository_count, verified_claim_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, input.name, input.role, "CodeProof", evidenceIndex, now, "in_progress", "code_review", input.isDemo ? 1 : 0, input.results.length, verifiedClaimCount);
      const insertStage = this.db.prepare("INSERT INTO stage_events (candidate_id, stage, entered_at) VALUES (?, ?, ?)");
      insertStage.run(id, "applied", now);
      insertStage.run(id, "screening", now);
      insertStage.run(id, "code_review", now);
      const insertAnalysis = this.db.prepare(`INSERT INTO candidate_analyses
        (id, candidate_id, repository_url, repository_name, primary_language, project_type, evidence_index, summary, analyzed_at, analysis_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      for (const result of input.results) {
        const primaryLanguage = Object.entries(result.languages).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
        const repositoryIndex = calculateEvidenceIndex([result]);
        const summary = result.strengths.length
          ? `${result.projectType}. ${result.strengths.slice(0, 2).map((strength) => strength.title).join(" and ")}.`
          : `${result.projectType} with ${result.skills.length} grounded skill signal${result.skills.length === 1 ? "" : "s"}.`;
        insertAnalysis.run(randomUUID(), id, result.repository.url, `${result.repository.owner}/${result.repository.name}`, primaryLanguage, result.projectType, repositoryIndex, summary, result.metadata.analyzedAt, JSON.stringify(result));
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    const created = this.getCandidate(id);
    if (!created) throw new Error("Candidate persistence failed.");
    return created;
  }
}

const globalStore = globalThis as typeof globalThis & { codeproofCandidateStore?: CandidateStore };
export function getCandidateStore(): CandidateStore {
  globalStore.codeproofCandidateStore ??= new CandidateStore();
  return globalStore.codeproofCandidateStore;
}
