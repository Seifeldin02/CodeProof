import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Pool } from "pg";
import { getCandidateStore } from "@/features/candidates/store";
import { getPostgresPool } from "@/features/persistence/postgres";
import { ensurePostgreSQLRemediationSchema } from "@/features/persistence/postgres-migrations";
import { ensureRemediationSchema } from "@/features/persistence/sqlite-migrations";
import type { ExtractedResumeClaim } from "@/types/analysis";

interface ClaimRow { candidate_id: string; claims_json: string | ExtractedResumeClaim[] }

export interface CandidateResumePersistence {
  save(ownerUserId: string, candidateId: string, claims: ExtractedResumeClaim[]): Promise<boolean>;
  list(ownerUserId: string): Promise<Map<string, ExtractedResumeClaim[]>>;
}

function mapClaims(rows: ClaimRow[]): Map<string, ExtractedResumeClaim[]> {
  return new Map(rows.map((row) => {
    const parsed = typeof row.claims_json === "string" ? JSON.parse(row.claims_json) as unknown : row.claims_json;
    if (!Array.isArray(parsed) || !parsed.every((claim) => claim && typeof claim === "object" && "claim" in claim && typeof claim.claim === "string")) {
      throw new Error("Invalid saved candidate CV claims.");
    }
    return [row.candidate_id, parsed as ExtractedResumeClaim[]];
  }));
}

export class CandidateResumeStore implements CandidateResumePersistence {
  constructor(readonly db: DatabaseSync) {
    ensureRemediationSchema(db);
    db.exec(`CREATE TABLE IF NOT EXISTS candidate_resume_claims (
      candidate_id TEXT PRIMARY KEY REFERENCES candidates(id) ON DELETE CASCADE,
      owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      claims_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_candidate_resume_claims_owner ON candidate_resume_claims(owner_user_id);`);
  }

  async save(ownerUserId: string, candidateId: string, claims: ExtractedResumeClaim[]): Promise<boolean> {
    const result = this.db.prepare(`INSERT INTO candidate_resume_claims (candidate_id, owner_user_id, claims_json, created_at)
      SELECT id, owner_user_id, ?, ? FROM candidates WHERE id = ? AND owner_user_id = ?
      ON CONFLICT(candidate_id) DO UPDATE SET claims_json = excluded.claims_json`)
      .run(JSON.stringify(claims), new Date().toISOString(), candidateId, ownerUserId);
    return Number(result.changes) > 0;
  }

  async list(ownerUserId: string): Promise<Map<string, ExtractedResumeClaim[]>> {
    const rows = this.db.prepare("SELECT candidate_id, claims_json FROM candidate_resume_claims WHERE owner_user_id = ?")
      .all(ownerUserId) as unknown as ClaimRow[];
    return mapClaims(rows);
  }
}

export class PostgresCandidateResumeStore implements CandidateResumePersistence {
  private ready: Promise<void> | null = null;
  constructor(private readonly pool: Pool) {}

  private initialize(): Promise<void> {
    this.ready ??= (async () => {
      await ensurePostgreSQLRemediationSchema(this.pool);
      await this.pool.query(`CREATE TABLE IF NOT EXISTS codeproof_candidate_resume_claims (
        candidate_id TEXT PRIMARY KEY REFERENCES codeproof_candidates(id) ON DELETE CASCADE,
        owner_user_id TEXT NOT NULL REFERENCES codeproof_users(id) ON DELETE CASCADE,
        claims_json JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL
      )`);
      await this.pool.query("CREATE INDEX IF NOT EXISTS idx_codeproof_candidate_resume_claims_owner ON codeproof_candidate_resume_claims(owner_user_id)");
    })();
    return this.ready;
  }

  async save(ownerUserId: string, candidateId: string, claims: ExtractedResumeClaim[]): Promise<boolean> {
    await this.initialize();
    const result = await this.pool.query(`INSERT INTO codeproof_candidate_resume_claims (candidate_id, owner_user_id, claims_json, created_at)
      SELECT id, owner_user_id, $3::jsonb, $4 FROM codeproof_candidates WHERE id = $1 AND owner_user_id = $2
      ON CONFLICT(candidate_id) DO UPDATE SET claims_json = EXCLUDED.claims_json`,
      [candidateId, ownerUserId, JSON.stringify(claims), new Date().toISOString()]);
    return (result.rowCount ?? 0) > 0;
  }

  async list(ownerUserId: string): Promise<Map<string, ExtractedResumeClaim[]>> {
    await this.initialize();
    const result = await this.pool.query<ClaimRow>("SELECT candidate_id, claims_json FROM codeproof_candidate_resume_claims WHERE owner_user_id = $1", [ownerUserId]);
    return mapClaims(result.rows);
  }
}

const cache = globalThis as typeof globalThis & { codeproofCandidateResumes?: CandidateResumePersistence };
export function getCandidateResumeStore(): CandidateResumePersistence {
  if (!cache.codeproofCandidateResumes) {
    const pool = getPostgresPool();
    if (pool) cache.codeproofCandidateResumes = new PostgresCandidateResumeStore(pool);
    else {
      getCandidateStore();
      cache.codeproofCandidateResumes = new CandidateResumeStore(new DatabaseSync(process.env.CODEPROOF_DB_PATH ?? path.join(process.cwd(), ".data", "codeproof.db")));
    }
  }
  return cache.codeproofCandidateResumes;
}
