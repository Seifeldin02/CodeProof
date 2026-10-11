import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Pool } from "pg";
import { getPostgresPool } from "@/features/persistence/postgres";
import { isLocale } from "@/i18n/translations";
import type { CandidateCvNotes, CandidateEvidenceResponse, EvidenceRequest } from "./types";

/**
 * Owner-scoped storage for evidence requests and for the claims noted from a
 * CV. Rows are removed by `deleteForCandidate`, which the candidate delete
 * route calls, so nothing a candidate sent outlives their record.
 */

interface RequestRow {
  id: string;
  owner_user_id: string;
  candidate_id: string;
  locale: string;
  verification_code: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  answered_at: string | null;
  response_json: string | null;
}

interface NotesRow {
  claims_json: string;
  profiles_json: string;
}

export interface NewEvidenceRequest {
  candidateId: string;
  locale: EvidenceRequest["locale"];
  tokenDigest: string;
  verificationCode: string;
  expiresAt: string;
}

export interface EvidenceRequestPersistence {
  /** Opens a new request and closes any earlier one that was still waiting for an answer. */
  create(ownerUserId: string, input: NewEvidenceRequest): Promise<EvidenceRequest>;
  listForCandidate(ownerUserId: string, candidateId: string): Promise<EvidenceRequest[]>;
  listForOwner(ownerUserId: string): Promise<EvidenceRequest[]>;
  get(ownerUserId: string, requestId: string): Promise<EvidenceRequest | null>;
  /** Public lookup by the digest of the link's token. Returns the owner so the answer can be scoped. */
  findByTokenDigest(tokenDigest: string): Promise<(EvidenceRequest & { ownerUserId: string }) | null>;
  /** Stores the answer only if the request is still open. Returns false when it was not. */
  recordResponse(requestId: string, response: CandidateEvidenceResponse, answeredAt: string): Promise<boolean>;
  revoke(ownerUserId: string, requestId: string): Promise<boolean>;
  saveCvNotes(ownerUserId: string, candidateId: string, notes: CandidateCvNotes): Promise<void>;
  getCvNotes(ownerUserId: string, candidateId: string): Promise<CandidateCvNotes | null>;
  /** Candidates whose CV claims were noted at intake, for screens that list many candidates. */
  listCvNotedCandidateIds(ownerUserId: string): Promise<string[]>;
  deleteForCandidate(ownerUserId: string, candidateId: string): Promise<void>;
}

function parseResponse(value: string | null): CandidateEvidenceResponse | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as CandidateEvidenceResponse;
  } catch {
    return null;
  }
}

function mapRequest(row: RequestRow): EvidenceRequest {
  return {
    id: row.id,
    candidateId: row.candidate_id,
    locale: isLocale(row.locale) ? row.locale : "en",
    verificationCode: row.verification_code,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    answeredAt: row.answered_at,
    response: parseResponse(row.response_json),
  };
}

function parseList<T>(value: string): T[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

function mapNotes(row: NotesRow | undefined): CandidateCvNotes | null {
  return row ? { claims: parseList(row.claims_json), profiles: parseList(row.profiles_json) } : null;
}

/** SQLite persistence for local development and deterministic tests. */
export class EvidenceRequestStore implements EvidenceRequestPersistence {
  readonly db: DatabaseSync;

  constructor(databasePath = process.env.CODEPROOF_DB_PATH ?? path.join(process.cwd(), ".data", "codeproof.db")) {
    if (databasePath !== ":memory:") mkdirSync(path.dirname(databasePath), { recursive: true });
    this.db = new DatabaseSync(databasePath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS evidence_requests (
        id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL, candidate_id TEXT NOT NULL, token_digest TEXT NOT NULL UNIQUE,
        locale TEXT NOT NULL, verification_code TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL,
        revoked_at TEXT, answered_at TEXT, response_json TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_evidence_requests_candidate ON evidence_requests(owner_user_id, candidate_id, created_at DESC);
      CREATE TABLE IF NOT EXISTS candidate_cv_notes (
        candidate_id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL, claims_json TEXT NOT NULL, profiles_json TEXT NOT NULL, created_at TEXT NOT NULL
      );
    `);
  }

  async create(ownerUserId: string, input: NewEvidenceRequest): Promise<EvidenceRequest> {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db.exec("BEGIN");
    try {
      this.db.prepare("UPDATE evidence_requests SET revoked_at = ? WHERE owner_user_id = ? AND candidate_id = ? AND answered_at IS NULL AND revoked_at IS NULL")
        .run(now, ownerUserId, input.candidateId);
      this.db.prepare(`INSERT INTO evidence_requests
        (id, owner_user_id, candidate_id, token_digest, locale, verification_code, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(id, ownerUserId, input.candidateId, input.tokenDigest, input.locale, input.verificationCode, now, input.expiresAt);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    const created = await this.get(ownerUserId, id);
    if (!created) throw new Error("Evidence request persistence failed.");
    return created;
  }

  async listForCandidate(ownerUserId: string, candidateId: string): Promise<EvidenceRequest[]> {
    const rows = this.db.prepare("SELECT * FROM evidence_requests WHERE owner_user_id = ? AND candidate_id = ? ORDER BY created_at DESC, id")
      .all(ownerUserId, candidateId) as unknown as RequestRow[];
    return rows.map(mapRequest);
  }

  async listForOwner(ownerUserId: string): Promise<EvidenceRequest[]> {
    const rows = this.db.prepare("SELECT * FROM evidence_requests WHERE owner_user_id = ? ORDER BY created_at DESC, id").all(ownerUserId) as unknown as RequestRow[];
    return rows.map(mapRequest);
  }

  async get(ownerUserId: string, requestId: string): Promise<EvidenceRequest | null> {
    const row = this.db.prepare("SELECT * FROM evidence_requests WHERE id = ? AND owner_user_id = ?").get(requestId, ownerUserId) as RequestRow | undefined;
    return row ? mapRequest(row) : null;
  }

  async findByTokenDigest(tokenDigest: string): Promise<(EvidenceRequest & { ownerUserId: string }) | null> {
    const row = this.db.prepare("SELECT * FROM evidence_requests WHERE token_digest = ?").get(tokenDigest) as RequestRow | undefined;
    return row ? { ...mapRequest(row), ownerUserId: row.owner_user_id } : null;
  }

  async recordResponse(requestId: string, response: CandidateEvidenceResponse, answeredAt: string): Promise<boolean> {
    const result = this.db.prepare(`UPDATE evidence_requests SET answered_at = ?, response_json = ?
      WHERE id = ? AND answered_at IS NULL AND revoked_at IS NULL AND expires_at > ?`).run(answeredAt, JSON.stringify(response), requestId, answeredAt);
    return Number(result.changes) === 1;
  }

  async revoke(ownerUserId: string, requestId: string): Promise<boolean> {
    const result = this.db.prepare("UPDATE evidence_requests SET revoked_at = ? WHERE id = ? AND owner_user_id = ? AND answered_at IS NULL AND revoked_at IS NULL")
      .run(new Date().toISOString(), requestId, ownerUserId);
    return Number(result.changes) === 1;
  }

  async saveCvNotes(ownerUserId: string, candidateId: string, notes: CandidateCvNotes): Promise<void> {
    this.db.prepare(`INSERT INTO candidate_cv_notes (candidate_id, owner_user_id, claims_json, profiles_json, created_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(candidate_id) DO UPDATE SET claims_json = excluded.claims_json, profiles_json = excluded.profiles_json`)
      .run(candidateId, ownerUserId, JSON.stringify(notes.claims), JSON.stringify(notes.profiles), new Date().toISOString());
  }

  async getCvNotes(ownerUserId: string, candidateId: string): Promise<CandidateCvNotes | null> {
    return mapNotes(this.db.prepare("SELECT claims_json, profiles_json FROM candidate_cv_notes WHERE candidate_id = ? AND owner_user_id = ?")
      .get(candidateId, ownerUserId) as NotesRow | undefined);
  }

  async listCvNotedCandidateIds(ownerUserId: string): Promise<string[]> {
    const rows = this.db.prepare("SELECT candidate_id FROM candidate_cv_notes WHERE owner_user_id = ?").all(ownerUserId) as unknown as Array<{ candidate_id: string }>;
    return rows.map((row) => row.candidate_id);
  }

  async deleteForCandidate(ownerUserId: string, candidateId: string): Promise<void> {
    this.db.prepare("DELETE FROM evidence_requests WHERE owner_user_id = ? AND candidate_id = ?").run(ownerUserId, candidateId);
    this.db.prepare("DELETE FROM candidate_cv_notes WHERE owner_user_id = ? AND candidate_id = ?").run(ownerUserId, candidateId);
  }
}

class PostgresEvidenceRequestStore implements EvidenceRequestPersistence {
  private initialized: Promise<void> | null = null;

  constructor(private readonly pool: Pool) {}

  private initialize(): Promise<void> {
    this.initialized ??= this.pool.query(`
      CREATE TABLE IF NOT EXISTS codeproof_evidence_requests (
        id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL, candidate_id TEXT NOT NULL, token_digest TEXT NOT NULL UNIQUE,
        locale TEXT NOT NULL, verification_code TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL,
        revoked_at TEXT, answered_at TEXT, response_json TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_codeproof_evidence_requests_candidate ON codeproof_evidence_requests(owner_user_id, candidate_id, created_at DESC);
      CREATE TABLE IF NOT EXISTS codeproof_candidate_cv_notes (
        candidate_id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL, claims_json TEXT NOT NULL, profiles_json TEXT NOT NULL, created_at TEXT NOT NULL
      );
    `).then(() => undefined);
    return this.initialized;
  }

  async create(ownerUserId: string, input: NewEvidenceRequest): Promise<EvidenceRequest> {
    await this.initialize();
    const id = randomUUID();
    const now = new Date().toISOString();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("UPDATE codeproof_evidence_requests SET revoked_at=$1 WHERE owner_user_id=$2 AND candidate_id=$3 AND answered_at IS NULL AND revoked_at IS NULL", [now, ownerUserId, input.candidateId]);
      await client.query(`INSERT INTO codeproof_evidence_requests
        (id, owner_user_id, candidate_id, token_digest, locale, verification_code, created_at, expires_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [id, ownerUserId, input.candidateId, input.tokenDigest, input.locale, input.verificationCode, now, input.expiresAt]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    const created = await this.get(ownerUserId, id);
    if (!created) throw new Error("Evidence request persistence failed.");
    return created;
  }

  async listForCandidate(ownerUserId: string, candidateId: string): Promise<EvidenceRequest[]> {
    await this.initialize();
    const result = await this.pool.query<RequestRow>("SELECT * FROM codeproof_evidence_requests WHERE owner_user_id=$1 AND candidate_id=$2 ORDER BY created_at DESC, id", [ownerUserId, candidateId]);
    return result.rows.map(mapRequest);
  }

  async listForOwner(ownerUserId: string): Promise<EvidenceRequest[]> {
    await this.initialize();
    const result = await this.pool.query<RequestRow>("SELECT * FROM codeproof_evidence_requests WHERE owner_user_id=$1 ORDER BY created_at DESC, id", [ownerUserId]);
    return result.rows.map(mapRequest);
  }

  async get(ownerUserId: string, requestId: string): Promise<EvidenceRequest | null> {
    await this.initialize();
    const result = await this.pool.query<RequestRow>("SELECT * FROM codeproof_evidence_requests WHERE id=$1 AND owner_user_id=$2", [requestId, ownerUserId]);
    return result.rows[0] ? mapRequest(result.rows[0]) : null;
  }

  async findByTokenDigest(tokenDigest: string): Promise<(EvidenceRequest & { ownerUserId: string }) | null> {
    await this.initialize();
    const result = await this.pool.query<RequestRow>("SELECT * FROM codeproof_evidence_requests WHERE token_digest=$1", [tokenDigest]);
    const row = result.rows[0];
    return row ? { ...mapRequest(row), ownerUserId: row.owner_user_id } : null;
  }

  async recordResponse(requestId: string, response: CandidateEvidenceResponse, answeredAt: string): Promise<boolean> {
    await this.initialize();
    const result = await this.pool.query(`UPDATE codeproof_evidence_requests SET answered_at=$1, response_json=$2
      WHERE id=$3 AND answered_at IS NULL AND revoked_at IS NULL AND expires_at > $1`, [answeredAt, JSON.stringify(response), requestId]);
    return result.rowCount === 1;
  }

  async revoke(ownerUserId: string, requestId: string): Promise<boolean> {
    await this.initialize();
    const result = await this.pool.query("UPDATE codeproof_evidence_requests SET revoked_at=$1 WHERE id=$2 AND owner_user_id=$3 AND answered_at IS NULL AND revoked_at IS NULL", [new Date().toISOString(), requestId, ownerUserId]);
    return result.rowCount === 1;
  }

  async saveCvNotes(ownerUserId: string, candidateId: string, notes: CandidateCvNotes): Promise<void> {
    await this.initialize();
    await this.pool.query(`INSERT INTO codeproof_candidate_cv_notes (candidate_id, owner_user_id, claims_json, profiles_json, created_at) VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT(candidate_id) DO UPDATE SET claims_json=EXCLUDED.claims_json, profiles_json=EXCLUDED.profiles_json`,
      [candidateId, ownerUserId, JSON.stringify(notes.claims), JSON.stringify(notes.profiles), new Date().toISOString()]);
  }

  async getCvNotes(ownerUserId: string, candidateId: string): Promise<CandidateCvNotes | null> {
    await this.initialize();
    const result = await this.pool.query<NotesRow>("SELECT claims_json, profiles_json FROM codeproof_candidate_cv_notes WHERE candidate_id=$1 AND owner_user_id=$2", [candidateId, ownerUserId]);
    return mapNotes(result.rows[0]);
  }

  async listCvNotedCandidateIds(ownerUserId: string): Promise<string[]> {
    await this.initialize();
    const result = await this.pool.query<{ candidate_id: string }>("SELECT candidate_id FROM codeproof_candidate_cv_notes WHERE owner_user_id=$1", [ownerUserId]);
    return result.rows.map((row) => row.candidate_id);
  }

  async deleteForCandidate(ownerUserId: string, candidateId: string): Promise<void> {
    await this.initialize();
    await this.pool.query("DELETE FROM codeproof_evidence_requests WHERE owner_user_id=$1 AND candidate_id=$2", [ownerUserId, candidateId]);
    await this.pool.query("DELETE FROM codeproof_candidate_cv_notes WHERE owner_user_id=$1 AND candidate_id=$2", [ownerUserId, candidateId]);
  }
}

const globalStore = globalThis as typeof globalThis & { codeproofEvidenceRequestStore?: EvidenceRequestPersistence };

export function getEvidenceRequestStore(): EvidenceRequestPersistence {
  if (globalStore.codeproofEvidenceRequestStore) return globalStore.codeproofEvidenceRequestStore;
  const pool = getPostgresPool();
  globalStore.codeproofEvidenceRequestStore = pool ? new PostgresEvidenceRequestStore(pool) : new EvidenceRequestStore();
  return globalStore.codeproofEvidenceRequestStore;
}
