import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Pool } from "pg";
import { getPostgresPool } from "@/features/persistence/postgres";
import type { ExtractedJobRequirement } from "@/types/analysis";

export type RequirementImportance = ExtractedJobRequirement["importance"];
export type RequirementCategory = ExtractedJobRequirement["category"];

export interface CompanyRequirement {
  id: string;
  requirement: string;
  importance: RequirementImportance;
  category: RequirementCategory;
}

interface RequirementRow {
  id: string;
  requirement: string;
  importance: string;
  category: string;
  position: number;
}

export interface RequirementsPersistence {
  list(ownerUserId: string): Promise<CompanyRequirement[]>;
  replaceAll(ownerUserId: string, requirements: CompanyRequirement[]): Promise<CompanyRequirement[]>;
}

const IMPORTANCE: readonly RequirementImportance[] = ["required", "preferred", "context"];
const CATEGORY: readonly RequirementCategory[] = ["skill", "responsibility", "seniority", "experience", "domain"];

export function isImportance(value: string): value is RequirementImportance {
  return (IMPORTANCE as readonly string[]).includes(value);
}

export function isCategory(value: string): value is RequirementCategory {
  return (CATEGORY as readonly string[]).includes(value);
}

function mapRequirement(row: RequirementRow): CompanyRequirement {
  return {
    id: row.id,
    requirement: row.requirement,
    importance: isImportance(row.importance) ? row.importance : "context",
    category: isCategory(row.category) ? row.category : "skill",
  };
}

export class RequirementsStore implements RequirementsPersistence {
  readonly db: DatabaseSync;

  constructor(databasePath = process.env.CODEPROOF_DB_PATH ?? path.join(process.cwd(), ".data", "codeproof.db")) {
    if (databasePath !== ":memory:") mkdirSync(path.dirname(databasePath), { recursive: true });
    this.db = new DatabaseSync(databasePath);
    this.db.exec(`CREATE TABLE IF NOT EXISTS company_requirements (
      id TEXT PRIMARY KEY, owner_user_id TEXT, requirement TEXT NOT NULL, importance TEXT NOT NULL,
      category TEXT NOT NULL, position INTEGER NOT NULL
    )`);
    const columns = this.db.prepare("PRAGMA table_info(company_requirements)").all() as unknown as Array<{ name: string }>;
    if (!columns.some((column) => column.name === "owner_user_id")) {
      this.db.exec("ALTER TABLE company_requirements ADD COLUMN owner_user_id TEXT");
    }
    this.db.exec("CREATE INDEX IF NOT EXISTS idx_company_requirements_owner ON company_requirements(owner_user_id, position)");
    const hasUsers = this.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'").get();
    if (hasUsers) {
      const users = this.db.prepare("SELECT id FROM users ORDER BY created_at LIMIT 2").all() as unknown as Array<{ id: string }>;
      if (users.length === 1) this.db.prepare("UPDATE company_requirements SET owner_user_id = ? WHERE owner_user_id IS NULL").run(users[0].id);
    }
  }

  async list(ownerUserId: string): Promise<CompanyRequirement[]> {
    const rows = this.db.prepare("SELECT * FROM company_requirements WHERE owner_user_id = ? ORDER BY position ASC").all(ownerUserId) as unknown as RequirementRow[];
    return rows.map(mapRequirement);
  }

  async replaceAll(ownerUserId: string, requirements: CompanyRequirement[]): Promise<CompanyRequirement[]> {
    this.db.exec("BEGIN");
    try {
      this.db.prepare("DELETE FROM company_requirements WHERE owner_user_id = ?").run(ownerUserId);
      const insert = this.db.prepare("INSERT INTO company_requirements (id, owner_user_id, requirement, importance, category, position) VALUES (?, ?, ?, ?, ?, ?)");
      requirements.forEach((item, index) => insert.run(item.id, ownerUserId, item.requirement.trim(), item.importance, item.category, index));
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return this.list(ownerUserId);
  }
}

class PostgresRequirementsStore implements RequirementsPersistence {
  private initialized: Promise<void> | null = null;

  constructor(private readonly pool: Pool) {}

  private initialize(): Promise<void> {
    this.initialized ??= this.pool.query(`CREATE TABLE IF NOT EXISTS codeproof_company_requirements (
      id TEXT NOT NULL, owner_user_id TEXT NOT NULL, requirement TEXT NOT NULL, importance TEXT NOT NULL,
      category TEXT NOT NULL, position INTEGER NOT NULL, PRIMARY KEY(owner_user_id, id)
    )`).then(() => undefined);
    return this.initialized;
  }

  async list(ownerUserId: string): Promise<CompanyRequirement[]> {
    await this.initialize();
    const result = await this.pool.query<RequirementRow>("SELECT id, requirement, importance, category, position FROM codeproof_company_requirements WHERE owner_user_id=$1 ORDER BY position", [ownerUserId]);
    return result.rows.map(mapRequirement);
  }

  async replaceAll(ownerUserId: string, requirements: CompanyRequirement[]): Promise<CompanyRequirement[]> {
    await this.initialize();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM codeproof_company_requirements WHERE owner_user_id=$1", [ownerUserId]);
      for (const [index, item] of requirements.entries()) {
        await client.query("INSERT INTO codeproof_company_requirements (id,owner_user_id,requirement,importance,category,position) VALUES ($1,$2,$3,$4,$5,$6)", [item.id, ownerUserId, item.requirement.trim(), item.importance, item.category, index]);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    return this.list(ownerUserId);
  }
}

let cached: RequirementsPersistence | null = null;

export function getRequirementsStore(): RequirementsPersistence {
  if (cached) return cached;
  const pool = getPostgresPool();
  cached = pool ? new PostgresRequirementsStore(pool) : new RequirementsStore();
  return cached;
}

export function toExtractedRequirements(requirements: CompanyRequirement[]): ExtractedJobRequirement[] {
  return requirements.map(({ requirement, importance, category }) => ({ requirement, importance, category, source: "Job Requirement" as const }));
}

export function toJobDescriptionText(requirements: CompanyRequirement[]): string {
  if (requirements.length === 0) return "";
  const line = (item: CompanyRequirement) => `- ${item.requirement}${item.importance === "required" ? " (required)" : item.importance === "preferred" ? " (preferred)" : ""}`;
  return ["Company requirements:", ...requirements.map(line)].join("\n");
}
