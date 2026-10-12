import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import type { Pool } from "pg";
import { getCandidateStore } from "@/features/candidates/store";
import { getPostgresPool } from "@/features/persistence/postgres";
import { ensurePostgreSQLRemediationSchema } from "@/features/persistence/postgres-migrations";
import { SQLITE_INTERVIEW_SCHEMA } from "./schema";
import { applyInterviewUpdate, InterviewAssessmentSchema, InterviewPreparationSchema, type InterviewPreparation, type InterviewSession, type UpdateInterview } from "./contracts";
import { blankAssessment } from "./preparation";

interface Row {
  id: string; candidate_id: string; preparation_json: unknown; assessment_json: unknown;
  status: "draft" | "completed"; revision: number; is_demo: boolean | number;
  created_at: string | Date; updated_at: string | Date; completed_at: string | Date | null; communicated_at: string | Date | null;
}
const date = (value: string | Date) => new Date(value).toISOString();
function map(row: Row): InterviewSession {
  const json = (value: unknown) => typeof value === "string" ? JSON.parse(value) as unknown : value;
  return { id: row.id, candidateId: row.candidate_id, preparation: InterviewPreparationSchema.parse(json(row.preparation_json)),
    assessment: InterviewAssessmentSchema.parse(json(row.assessment_json)), status: row.status, revision: row.revision, isDemo: Boolean(row.is_demo),
    createdAt: date(row.created_at), updatedAt: date(row.updated_at), completedAt: row.completed_at ? date(row.completed_at) : null,
    communicatedAt: row.communicated_at ? date(row.communicated_at) : null };
}
export interface InterviewPersistence {
  list(owner: string): Promise<InterviewSession[]>;
  get(owner: string, id: string): Promise<InterviewSession | null>;
  create(owner: string, candidateId: string, preparation: InterviewPreparation): Promise<InterviewSession | null>;
  update(owner: string, id: string, input: UpdateInterview): Promise<InterviewSession | null>;
}
export class InterviewStore implements InterviewPersistence {
  constructor(readonly db: DatabaseSync) { db.exec("PRAGMA foreign_keys = ON"); db.exec(SQLITE_INTERVIEW_SCHEMA); }
  async list(owner: string) { return (this.db.prepare("SELECT * FROM interview_sessions WHERE owner_user_id = ? ORDER BY updated_at DESC").all(owner) as unknown as Row[]).map(map); }
  async get(owner: string, id: string) {
    const row = this.db.prepare("SELECT * FROM interview_sessions WHERE owner_user_id = ? AND id = ?").get(owner, id) as unknown as Row | undefined;
    return row ? map(row) : null;
  }
  async create(owner: string, candidateId: string, preparation: InterviewPreparation) {
    const candidate = this.db.prepare("SELECT is_demo FROM candidates WHERE owner_user_id = ? AND id = ?").get(owner, candidateId) as { is_demo: number } | undefined;
    if (!candidate) return null;
    const validated = InterviewPreparationSchema.parse(preparation);
    const id = randomUUID(), now = new Date().toISOString();
    this.db.prepare(`INSERT INTO interview_sessions (id, owner_user_id, candidate_id, preparation_json, assessment_json, status, revision, is_demo, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'draft', 1, ?, ?, ?)`).run(id, owner, candidateId, JSON.stringify(validated), JSON.stringify(blankAssessment(validated)), candidate.is_demo, now, now);
    return this.get(owner, id);
  }
  async update(owner: string, id: string, input: UpdateInterview) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const row = this.db.prepare("SELECT * FROM interview_sessions WHERE owner_user_id = ? AND id = ?").get(owner, id) as unknown as Row | undefined;
      const next = row ? applyInterviewUpdate(map(row), input, new Date().toISOString()) : null;
      if (next) this.db.prepare(`UPDATE interview_sessions SET assessment_json = ?, status = ?, revision = ?, updated_at = ?, completed_at = ?, communicated_at = ? WHERE owner_user_id = ? AND id = ?`)
        .run(JSON.stringify(next.assessment), next.status, next.revision, next.updatedAt, next.completedAt, next.communicatedAt, owner, id);
      this.db.exec("COMMIT"); return next;
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
}
export class PostgresInterviewStore implements InterviewPersistence {
  private ready: Promise<void> | null = null;
  constructor(private readonly pool: Pool) {}
  private initialize() { return this.ready ??= ensurePostgreSQLRemediationSchema(this.pool); }
  async list(owner: string) { await this.initialize(); return (await this.pool.query<Row>("SELECT * FROM codeproof_interview_sessions WHERE owner_user_id = $1 ORDER BY updated_at DESC", [owner])).rows.map(map); }
  async get(owner: string, id: string) {
    await this.initialize(); const row = (await this.pool.query<Row>("SELECT * FROM codeproof_interview_sessions WHERE owner_user_id = $1 AND id = $2", [owner, id])).rows[0];
    return row ? map(row) : null;
  }
  async create(owner: string, candidateId: string, preparation: InterviewPreparation) {
    await this.initialize(); const validated = InterviewPreparationSchema.parse(preparation), id = randomUUID(), now = new Date().toISOString();
    const result = await this.pool.query<Row>(`INSERT INTO codeproof_interview_sessions
      (id, owner_user_id, candidate_id, preparation_json, assessment_json, status, revision, is_demo, created_at, updated_at)
      SELECT $1, $2, id, $4::jsonb, $5::jsonb, 'draft', 1, is_demo, $6, $6 FROM codeproof_candidates WHERE owner_user_id = $2 AND id = $3 RETURNING *`,
      [id, owner, candidateId, JSON.stringify(validated), JSON.stringify(blankAssessment(validated)), now]);
    return result.rows[0] ? map(result.rows[0]) : null;
  }
  async update(owner: string, id: string, input: UpdateInterview) {
    await this.initialize(); const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const row = (await client.query<Row>("SELECT * FROM codeproof_interview_sessions WHERE owner_user_id = $1 AND id = $2 FOR UPDATE", [owner, id])).rows[0];
      const next = row ? applyInterviewUpdate(map(row), input, new Date().toISOString()) : null;
      if (next) await client.query(`UPDATE codeproof_interview_sessions SET assessment_json = $3::jsonb, status = $4, revision = $5, updated_at = $6, completed_at = $7, communicated_at = $8 WHERE owner_user_id = $1 AND id = $2`,
        [owner, id, JSON.stringify(next.assessment), next.status, next.revision, next.updatedAt, next.completedAt, next.communicatedAt]);
      await client.query("COMMIT"); return next;
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }
}
const cache = globalThis as typeof globalThis & { codeproofInterviews?: InterviewPersistence };
export function getInterviewStore(): InterviewPersistence {
  if (!cache.codeproofInterviews) {
    const pool = getPostgresPool();
    if (pool) cache.codeproofInterviews = new PostgresInterviewStore(pool);
    else {
      getCandidateStore();
      cache.codeproofInterviews = new InterviewStore(new DatabaseSync(process.env.CODEPROOF_DB_PATH ?? path.join(process.cwd(), ".data", "codeproof.db")));
    }
  }
  return cache.codeproofInterviews;
}
