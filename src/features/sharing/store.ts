import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { Pool } from "pg";
import { z } from "zod";
import { CandidateStore } from "@/features/candidates/store";
import type { CandidateDetail, CandidateRepositoryAnalysis } from "@/features/candidates/types";
import { ensurePostgreSQLRemediationSchema } from "@/features/persistence/postgres-migrations";
import { getPostgresPool } from "@/features/persistence/postgres";
import type { ShareExpiryOption } from "@/types/remediation";

const EXPIRY_MS: Record<ShareExpiryOption, number> = { "24h": 86_400_000, "7d": 604_800_000, "30d": 2_592_000_000 };
const Citation = z.object({ filePath: z.string(), startLine: z.number().nullable(), endLine: z.number().nullable(), sourceLink: z.string().url(), evidenceLevel: z.string() }).strict();
export const SharedReportSchema = z.object({
  version: z.literal(1), candidateName: z.string(), role: z.string(), isDemo: z.boolean(),
  repositoryName: z.string(), repositoryUrl: z.string().url(), attributionStatus: z.string(),
  analyzedAt: z.string(), summary: z.string(), citationStatus: z.enum(["grounded_findings", "inspected_files_only"]),
  skills: z.array(z.object({ skill: z.string(), level: z.string(), explanation: z.string(), files: z.array(z.string()) }).strict()),
  citations: z.array(Citation),
  questions: z.array(z.object({ question: z.string(), files: z.array(z.string()) }).strict()),
}).strict();
export type SharedReport = z.infer<typeof SharedReportSchema>;

export function buildSharedReport(candidate: CandidateDetail, analysis: CandidateRepositoryAnalysis): SharedReport | null {
  if (!analysis.result.canonicalEvidence || analysis.result.selectedFiles.length === 0) return null;
  const grounded = analysis.result.canonicalEvidence.citations;
  const citations = grounded.length > 0 ? grounded.slice(0, 40).map((item) => ({
    filePath: item.filePath, startLine: item.startLine, endLine: item.endLine,
    sourceLink: item.sourceLink, evidenceLevel: item.evidenceLevel,
  })) : analysis.result.selectedFiles.slice(0, 40).map((file) => ({
    filePath: file.path, startLine: null, endLine: null,
    sourceLink: /^[0-9a-f]{7,64}$/iu.test(analysis.result.repository.commitSha)
      ? `${analysis.repositoryUrl.replace(/\/$/u, "")}/blob/${analysis.result.repository.commitSha}/${file.path.split("/").map(encodeURIComponent).join("/")}`
      : analysis.repositoryUrl,
    evidenceLevel: "inspected_file_only",
  }));
  return SharedReportSchema.parse({
    version: 1,
    candidateName: candidate.name.slice(0, 120), role: candidate.role, isDemo: candidate.isDemo,
    repositoryName: analysis.repositoryName, repositoryUrl: analysis.repositoryUrl,
    attributionStatus: analysis.attributionStatus ?? "unverified", analyzedAt: analysis.analyzedAt,
    summary: analysis.summary.slice(0, 2_000),
    citationStatus: grounded.length > 0 ? "grounded_findings" : "inspected_files_only",
    skills: (grounded.length > 0 ? analysis.result.skills : []).slice(0, 12).map((skill) => ({
      skill: skill.skill.slice(0, 120), level: skill.level, explanation: skill.explanation.slice(0, 500),
      files: skill.evidence.map((item) => item.file).slice(0, 6),
    })),
    citations,
    questions: (grounded.length > 0 ? analysis.result.interviewQuestions : []).slice(0, 6).map((item) => ({ question: item.question.slice(0, 1_000), files: item.files.slice(0, 6) })),
  });
}

interface ShareRow {
  id: string; candidate_id: string; analysis_version_id: string; expiry_option: ShareExpiryOption;
  expires_at: string; revoked_at: string | null; is_demo: number | boolean; created_at: string;
  open_count?: number | string | null; last_opened_at?: string | null;
}
export interface ShareSummary {
  id: string; candidateId: string; analysisVersionId: string; expiryOption: ShareExpiryOption;
  expiresAt: string; revokedAt: string | null; isDemo: boolean; createdAt: string;
  status: "active" | "expired" | "revoked";
  /** How often the report was shown to a visitor, and when last. Refused attempts are logged but not counted here. */
  openCount: number; lastOpenedAt: string | null;
}
function summarize(row: ShareRow, now = Date.now()): ShareSummary {
  return {
    id: row.id, candidateId: row.candidate_id, analysisVersionId: row.analysis_version_id,
    expiryOption: row.expiry_option, expiresAt: new Date(row.expires_at).toISOString(),
    revokedAt: row.revoked_at ? new Date(row.revoked_at).toISOString() : null,
    isDemo: Boolean(row.is_demo), createdAt: new Date(row.created_at).toISOString(),
    status: row.revoked_at ? "revoked" : new Date(row.expires_at).getTime() <= now ? "expired" : "active",
    openCount: Number(row.open_count ?? 0),
    lastOpenedAt: row.last_opened_at ? new Date(row.last_opened_at).toISOString() : null,
  };
}
function digest(token: string): string { return createHash("sha256").update(token).digest("hex"); }

/**
 * What one attempt to read a link comes to. An expired or withdrawn link says so in the log. A link whose owner's
 * account is not active is otherwise sound, so it is logged as not valid at this time. The visitor sees the same
 * unavailable page for all three.
 */
function accessOutcome(status: ShareSummary["status"], ownerIsActive: boolean): "granted" | "denied_expired" | "denied_revoked" | "denied_invalid" {
  if (status === "expired") return "denied_expired";
  if (status === "revoked") return "denied_revoked";
  return ownerIsActive ? "granted" : "denied_invalid";
}

export interface ShareStore {
  create(ownerId: string, candidateId: string, analysisVersionId: string, report: SharedReport, expiry: ShareExpiryOption): Promise<{ token: string; share: ShareSummary } | null>;
  list(ownerId: string, candidateId: string): Promise<ShareSummary[]>;
  revoke(ownerId: string, candidateId: string, shareId: string): Promise<boolean>;
  resolve(token: string, ipFingerprint: string, userAgentFamily: string | null): Promise<SharedReport | null>;
}

export class SqliteShareStore implements ShareStore {
  constructor(private readonly db: DatabaseSync) {}

  /** A link stops working while its owner's account is suspended, and works again once the account is reactivated. */
  private ownerIsActive(ownerId: string): boolean {
    const owner = this.db.prepare("SELECT lifecycle_state FROM users WHERE id = ?").get(ownerId) as { lifecycle_state: string } | undefined;
    return owner?.lifecycle_state === "active";
  }

  async create(ownerId: string, candidateId: string, analysisVersionId: string, report: SharedReport, expiry: ShareExpiryOption) {
    const token = randomBytes(32).toString("base64url");
    const now = new Date();
    const row = {
      id: randomUUID(), candidate_id: candidateId, analysis_version_id: analysisVersionId, expiry_option: expiry,
      expires_at: new Date(now.getTime() + EXPIRY_MS[expiry]).toISOString(), revoked_at: null,
      is_demo: report.isDemo ? 1 : 0, created_at: now.toISOString(),
    } satisfies ShareRow;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const inserted = this.db.prepare(`INSERT INTO external_shares
        (id, owner_user_id, candidate_id, analysis_version_id, token_digest, expiry_option, expires_at, is_demo, created_at)
        SELECT ?, ?, ?, id, ?, ?, ?, ?, ? FROM analysis_versions
        WHERE id = ? AND owner_user_id = ? AND candidate_id = ? AND status = 'completed'`).run(
        row.id, ownerId, candidateId, digest(token), expiry, row.expires_at, row.is_demo, row.created_at,
        analysisVersionId, ownerId, candidateId,
      );
      if (inserted.changes !== 1) { this.db.exec("ROLLBACK"); return null; }
      this.db.prepare(`INSERT INTO external_report_snapshots
        (id, share_id, projection_json, taxonomy_version, created_at) VALUES (?, ?, ?, ?, ?)`).run(
        randomUUID(), row.id, JSON.stringify(report), "shared-report-v1", row.created_at,
      );
      this.db.exec("COMMIT");
      return { token, share: summarize(row) };
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }

  async list(ownerId: string, candidateId: string): Promise<ShareSummary[]> {
    const rows = this.db.prepare(`SELECT s.id, s.candidate_id, s.analysis_version_id, s.expiry_option, s.expires_at,
      s.revoked_at, s.is_demo, s.created_at,
      (SELECT COUNT(*) FROM share_access_log l WHERE l.share_id = s.id AND l.outcome = 'granted') AS open_count,
      (SELECT MAX(l.occurred_at) FROM share_access_log l WHERE l.share_id = s.id AND l.outcome = 'granted') AS last_opened_at
      FROM external_shares s
      WHERE s.owner_user_id = ? AND s.candidate_id = ? ORDER BY s.created_at DESC LIMIT 50`).all(ownerId, candidateId) as unknown as ShareRow[];
    return rows.map((row) => summarize(row));
  }

  async revoke(ownerId: string, candidateId: string, shareId: string): Promise<boolean> {
    return this.db.prepare(`UPDATE external_shares SET revoked_at = ?
      WHERE id = ? AND owner_user_id = ? AND candidate_id = ? AND revoked_at IS NULL`).run(
      new Date().toISOString(), shareId, ownerId, candidateId,
    ).changes === 1;
  }

  async resolve(token: string, ipFingerprint: string, userAgentFamily: string | null): Promise<SharedReport | null> {
    if (!/^[A-Za-z0-9_-]{43}$/u.test(token)) return null;
    const row = this.db.prepare(`SELECT s.id, s.owner_user_id, s.candidate_id, s.analysis_version_id, s.expiry_option,
      s.expires_at, s.revoked_at, s.is_demo, s.created_at, r.projection_json
      FROM external_shares s JOIN external_report_snapshots r ON r.share_id = s.id
      WHERE s.token_digest = ?`).get(digest(token)) as (ShareRow & { owner_user_id: string; projection_json: string }) | undefined;
    if (!row) return null;
    const outcome = accessOutcome(summarize(row).status, this.ownerIsActive(row.owner_user_id));
    this.db.prepare(`INSERT INTO share_access_log
      (id, share_id, occurred_at, outcome, applied_controls_json, ip_fingerprint, user_agent_family, is_demo)
      VALUES (?, ?, ?, ?, '[]', ?, ?, ?)`).run(
      randomUUID(), row.id, new Date().toISOString(), outcome, ipFingerprint, userAgentFamily, row.is_demo ? 1 : 0,
    );
    return outcome === "granted" ? SharedReportSchema.parse(JSON.parse(row.projection_json)) : null;
  }
}

class PostgresShareStore implements ShareStore {
  private initialized: Promise<void> | null = null;
  constructor(private readonly pool: Pool) {}
  private ready(): Promise<void> {
    this.initialized ??= ensurePostgreSQLRemediationSchema(this.pool).then(() => undefined);
    return this.initialized;
  }

  private accountStatesExist: Promise<boolean> | null = null;
  /**
   * The same rule as the SQLite store. The account columns are added the first time anyone signs in, which is before
   * any link can exist; the check for them only keeps a visitor's page from failing if that order is ever broken.
   */
  private async ownerIsActive(ownerId: string): Promise<boolean> {
    this.accountStatesExist ??= this.pool.query(`SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'codeproof_users' AND column_name = 'lifecycle_state' LIMIT 1`)
      .then((result) => result.rowCount === 1);
    if (!await this.accountStatesExist) return true;
    const owner = await this.pool.query<{ lifecycle_state: string }>("SELECT lifecycle_state FROM codeproof_users WHERE id = $1", [ownerId]);
    return owner.rows[0]?.lifecycle_state === "active";
  }

  async create(ownerId: string, candidateId: string, analysisVersionId: string, report: SharedReport, expiry: ShareExpiryOption) {
    await this.ready();
    const token = randomBytes(32).toString("base64url");
    const now = new Date();
    const row = {
      id: randomUUID(), candidate_id: candidateId, analysis_version_id: analysisVersionId, expiry_option: expiry,
      expires_at: new Date(now.getTime() + EXPIRY_MS[expiry]).toISOString(), revoked_at: null,
      is_demo: report.isDemo, created_at: now.toISOString(),
    } satisfies ShareRow;
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const inserted = await client.query(`INSERT INTO codeproof_external_shares
        (id, owner_user_id, candidate_id, analysis_version_id, token_digest, expiry_option, expires_at, is_demo, created_at)
        SELECT $1, $2, $3, id, $4, $5, $6, $7, $8 FROM codeproof_analysis_versions
        WHERE id = $9 AND owner_user_id = $2 AND candidate_id = $3 AND status = 'completed'`, [
        row.id, ownerId, candidateId, digest(token), expiry, row.expires_at, row.is_demo, row.created_at, analysisVersionId,
      ]);
      if (inserted.rowCount !== 1) { await client.query("ROLLBACK"); return null; }
      await client.query(`INSERT INTO codeproof_external_report_snapshots
        (id, share_id, projection_json, taxonomy_version, created_at) VALUES ($1, $2, $3, $4, $5)`, [
        randomUUID(), row.id, JSON.stringify(report), "shared-report-v1", row.created_at,
      ]);
      await client.query("COMMIT");
      return { token, share: summarize(row) };
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }

  async list(ownerId: string, candidateId: string): Promise<ShareSummary[]> {
    await this.ready();
    const result = await this.pool.query<ShareRow>(`SELECT s.id, s.candidate_id, s.analysis_version_id, s.expiry_option,
      s.expires_at::text, s.revoked_at::text, s.is_demo, s.created_at::text,
      (SELECT COUNT(*) FROM codeproof_share_access_log l WHERE l.share_id = s.id AND l.outcome = 'granted') AS open_count,
      (SELECT MAX(l.occurred_at)::text FROM codeproof_share_access_log l WHERE l.share_id = s.id AND l.outcome = 'granted') AS last_opened_at
      FROM codeproof_external_shares s
      WHERE s.owner_user_id = $1 AND s.candidate_id = $2 ORDER BY s.created_at DESC LIMIT 50`, [ownerId, candidateId]);
    return result.rows.map((row) => summarize(row));
  }

  async revoke(ownerId: string, candidateId: string, shareId: string): Promise<boolean> {
    await this.ready();
    const result = await this.pool.query(`UPDATE codeproof_external_shares SET revoked_at = NOW()
      WHERE id = $1 AND owner_user_id = $2 AND candidate_id = $3 AND revoked_at IS NULL`, [shareId, ownerId, candidateId]);
    return result.rowCount === 1;
  }

  async resolve(token: string, ipFingerprint: string, userAgentFamily: string | null): Promise<SharedReport | null> {
    if (!/^[A-Za-z0-9_-]{43}$/u.test(token)) return null;
    await this.ready();
    const result = await this.pool.query<ShareRow & { owner_user_id: string; projection_json: SharedReport }>(`SELECT s.id,
      s.owner_user_id, s.candidate_id, s.analysis_version_id, s.expiry_option, s.expires_at::text, s.revoked_at::text,
      s.is_demo, s.created_at::text, r.projection_json FROM codeproof_external_shares s
      JOIN codeproof_external_report_snapshots r ON r.share_id = s.id WHERE s.token_digest = $1`, [digest(token)]);
    const row = result.rows[0];
    if (!row) return null;
    const outcome = accessOutcome(summarize(row).status, await this.ownerIsActive(row.owner_user_id));
    await this.pool.query(`INSERT INTO codeproof_share_access_log
      (id, share_id, occurred_at, outcome, applied_controls_json, ip_fingerprint, user_agent_family, is_demo)
      VALUES ($1, $2, NOW(), $3, '[]'::jsonb, $4, $5, $6)`, [
      randomUUID(), row.id, outcome, ipFingerprint, userAgentFamily, row.is_demo,
    ]);
    return outcome === "granted" ? SharedReportSchema.parse(row.projection_json) : null;
  }
}

let cached: ShareStore | null = null;
export function getShareStore(): ShareStore {
  if (cached) return cached;
  const pool = getPostgresPool();
  cached = pool ? new PostgresShareStore(pool) : new SqliteShareStore(new CandidateStore().db);
  return cached;
}
