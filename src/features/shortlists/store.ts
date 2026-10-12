import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Pool } from "pg";
import { getCandidateStore } from "@/features/candidates/store";
import { getPostgresPool } from "@/features/persistence/postgres";
import { ensurePostgreSQLRemediationSchema } from "@/features/persistence/postgres-migrations";
import { ensureRemediationSchema } from "@/features/persistence/sqlite-migrations";
import { getCapabilityNode, getCapabilityTaxonomyVersion, getPinnedCapabilityTaxonomy } from "@/features/repository-analysis/capability-taxonomy";
import { canonicalSkill } from "@/features/resume-matching/skills";
import { RequisitionCriterionSchema, type RequisitionCriterion } from "@/types/remediation";
import { extractRoleCriteria, type RoleBrief } from "./evaluate";

interface RoleRow {
  id: string;
  version_id: string;
  title: string;
  job_description: string;
  taxonomy_version: string;
  criteria_json: string | RequisitionCriterion[];
  unassessed_requirements_json: string | string[];
  created_at: string | Date;
}

export interface RolePersistence {
  list(ownerUserId: string): Promise<RoleBrief[]>;
  get(ownerUserId: string, roleId: string): Promise<RoleBrief | null>;
  create(ownerUserId: string, title: string, description: string): Promise<RoleBrief>;
}

function parsedJson(value: unknown): unknown {
  return typeof value === "string" ? JSON.parse(value) as unknown : value;
}

function mapRole(row: RoleRow): RoleBrief {
  const criteria = RequisitionCriterionSchema.array().parse(parsedJson(row.criteria_json));
  const unassessed = parsedJson(row.unassessed_requirements_json);
  if (!Array.isArray(unassessed) || !unassessed.every((item) => typeof item === "string")) {
    throw new Error("Invalid saved role requirements.");
  }
  // The saved snapshot holds the criteria that can be checked against code. The brief itself is read again each time,
  // so one reading decides the order and the firmness of every criterion, and a role saved before a skill was listed
  // gains that skill without having to be saved again.
  const read = extractRoleCriteria(row.job_description, getCapabilityTaxonomyVersion(row.taxonomy_version));
  const saved = new Map(criteria.map((criterion) => [criterion.capabilityId, criterion.id]));
  const named = new Set(read.criteria.map((criterion) => criterion.capabilityId));
  return {
    id: row.id,
    versionId: row.version_id,
    title: row.title,
    description: row.job_description,
    taxonomyVersion: row.taxonomy_version,
    criteria: [
      ...read.criteria.map((criterion) => ({
        ...criterion,
        id: criterion.capabilityId ? saved.get(criterion.capabilityId) ?? `capability:${criterion.capabilityId}` : `skill:${criterion.label.toLowerCase()}`,
      })),
      ...criteria.filter((criterion) => !named.has(criterion.capabilityId)).map((criterion) => ({
        ...criterion,
        label: getCapabilityNode(criterion.capabilityId, row.taxonomy_version)?.labels.en ?? criterion.capabilityId,
      })),
    ],
    // Roles saved earlier listed every skill without a code check here. Those are criteria now.
    unassessedRequirements: unassessed.filter((item) => !canonicalSkill(item)),
    minimumYears: read.minimumYears,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function newRole(title: string, description: string) {
  const extracted = extractRoleCriteria(description);
  const criteria: RequisitionCriterion[] = extracted.criteria.flatMap((criterion) => criterion.capabilityId ? [{
    id: randomUUID(), capabilityId: criterion.capabilityId, importance: criterion.importance,
  }] : []);
  const id = randomUUID();
  const versionId = randomUUID();
  const now = new Date().toISOString();
  const taxonomyVersion = getPinnedCapabilityTaxonomy().version;
  const contentHash = createHash("sha256").update(JSON.stringify({ title, description, criteria, taxonomyVersion })).digest("hex");
  return { id, versionId, now, taxonomyVersion, contentHash, title, description, criteria, unassessed: extracted.unassessedRequirements };
}

const SQLITE_ROLE_SCHEMA = `CREATE TABLE IF NOT EXISTS role_brief_versions (
  requisition_version_id TEXT PRIMARY KEY REFERENCES requisition_versions(id) ON DELETE CASCADE,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_description TEXT NOT NULL,
  taxonomy_version TEXT NOT NULL,
  unassessed_requirements_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_role_brief_owner ON role_brief_versions(owner_user_id);`;

const SQLITE_SELECT = `SELECT r.id, r.title, v.id AS version_id, v.criteria_json,
  b.job_description, b.taxonomy_version, b.unassessed_requirements_json, v.created_at
  FROM requisitions r
  JOIN requisition_versions v ON v.requisition_id = r.id AND v.owner_user_id = r.owner_user_id AND v.version = r.current_version
  JOIN role_brief_versions b ON b.requisition_version_id = v.id AND b.owner_user_id = r.owner_user_id
  WHERE r.owner_user_id = ?`;

export class RoleStore implements RolePersistence {
  constructor(readonly db: DatabaseSync) {
    ensureRemediationSchema(db);
    db.exec(SQLITE_ROLE_SCHEMA);
  }

  async list(ownerUserId: string): Promise<RoleBrief[]> {
    return (this.db.prepare(`${SQLITE_SELECT} ORDER BY r.updated_at DESC`).all(ownerUserId) as unknown as RoleRow[]).map(mapRole);
  }

  async get(ownerUserId: string, roleId: string): Promise<RoleBrief | null> {
    const row = this.db.prepare(`${SQLITE_SELECT} AND r.id = ?`).get(ownerUserId, roleId) as unknown as RoleRow | undefined;
    return row ? mapRole(row) : null;
  }

  async create(ownerUserId: string, title: string, description: string): Promise<RoleBrief> {
    const role = newRole(title, description);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare(`INSERT INTO requisitions (id, owner_user_id, title, current_version, created_at, updated_at)
        VALUES (?, ?, ?, 1, ?, ?)`).run(role.id, ownerUserId, role.title, role.now, role.now);
      this.db.prepare(`INSERT INTO requisition_versions
        (id, owner_user_id, requisition_id, version, criteria_json, content_hash, created_at)
        VALUES (?, ?, ?, 1, ?, ?, ?)`).run(role.versionId, ownerUserId, role.id, JSON.stringify(role.criteria), role.contentHash, role.now);
      this.db.prepare(`INSERT INTO role_brief_versions
        (requisition_version_id, owner_user_id, job_description, taxonomy_version, unassessed_requirements_json)
        VALUES (?, ?, ?, ?, ?)`).run(role.versionId, ownerUserId, role.description, role.taxonomyVersion, JSON.stringify(role.unassessed));
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    const saved = await this.get(ownerUserId, role.id);
    if (!saved) throw new Error("Saved role could not be read.");
    return saved;
  }
}

const POSTGRES_SELECT = `SELECT r.id, r.title, v.id AS version_id, v.criteria_json,
  b.job_description, b.taxonomy_version, b.unassessed_requirements_json, v.created_at
  FROM codeproof_requisitions r
  JOIN codeproof_requisition_versions v ON v.requisition_id = r.id AND v.owner_user_id = r.owner_user_id AND v.version = r.current_version
  JOIN codeproof_role_brief_versions b ON b.requisition_version_id = v.id AND b.owner_user_id = r.owner_user_id
  WHERE r.owner_user_id = $1`;

export class PostgresRoleStore implements RolePersistence {
  private ready: Promise<void> | null = null;
  constructor(private readonly pool: Pool) {}

  private initialize(): Promise<void> {
    this.ready ??= (async () => {
      await ensurePostgreSQLRemediationSchema(this.pool);
      await this.pool.query(`CREATE TABLE IF NOT EXISTS codeproof_role_brief_versions (
        requisition_version_id TEXT PRIMARY KEY REFERENCES codeproof_requisition_versions(id) ON DELETE CASCADE,
        owner_user_id TEXT NOT NULL REFERENCES codeproof_users(id) ON DELETE CASCADE,
        job_description TEXT NOT NULL,
        taxonomy_version TEXT NOT NULL,
        unassessed_requirements_json JSONB NOT NULL
      )`);
      await this.pool.query("CREATE INDEX IF NOT EXISTS idx_codeproof_role_brief_owner ON codeproof_role_brief_versions(owner_user_id)");
    })();
    return this.ready;
  }

  async list(ownerUserId: string): Promise<RoleBrief[]> {
    await this.initialize();
    return (await this.pool.query<RoleRow>(`${POSTGRES_SELECT} ORDER BY r.updated_at DESC`, [ownerUserId])).rows.map(mapRole);
  }

  async get(ownerUserId: string, roleId: string): Promise<RoleBrief | null> {
    await this.initialize();
    const row = (await this.pool.query<RoleRow>(`${POSTGRES_SELECT} AND r.id = $2`, [ownerUserId, roleId])).rows[0];
    return row ? mapRole(row) : null;
  }

  async create(ownerUserId: string, title: string, description: string): Promise<RoleBrief> {
    await this.initialize();
    const role = newRole(title, description);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`INSERT INTO codeproof_requisitions (id, owner_user_id, title, current_version, created_at, updated_at)
        VALUES ($1, $2, $3, 1, $4, $4)`, [role.id, ownerUserId, role.title, role.now]);
      await client.query(`INSERT INTO codeproof_requisition_versions
        (id, owner_user_id, requisition_id, version, criteria_json, content_hash, created_at)
        VALUES ($1, $2, $3, 1, $4::jsonb, $5, $6)`, [role.versionId, ownerUserId, role.id, JSON.stringify(role.criteria), role.contentHash, role.now]);
      await client.query(`INSERT INTO codeproof_role_brief_versions
        (requisition_version_id, owner_user_id, job_description, taxonomy_version, unassessed_requirements_json)
        VALUES ($1, $2, $3, $4, $5::jsonb)`, [role.versionId, ownerUserId, role.description, role.taxonomyVersion, JSON.stringify(role.unassessed)]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    const saved = await this.get(ownerUserId, role.id);
    if (!saved) throw new Error("Saved role could not be read.");
    return saved;
  }
}

const cache = globalThis as typeof globalThis & { codeproofRoles?: RolePersistence };
export function getRoleStore(): RolePersistence {
  if (!cache.codeproofRoles) {
    const pool = getPostgresPool();
    if (pool) cache.codeproofRoles = new PostgresRoleStore(pool);
    else {
      getCandidateStore();
      cache.codeproofRoles = new RoleStore(new DatabaseSync(process.env.CODEPROOF_DB_PATH ?? path.join(process.cwd(), ".data", "codeproof.db")));
    }
  }
  return cache.codeproofRoles;
}
