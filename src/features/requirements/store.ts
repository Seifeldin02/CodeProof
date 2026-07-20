import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { ExtractedJobRequirement } from "@/types/analysis";

/**
 * Company hiring requirements, defined once by the evaluator and reused for
 * every candidate analysis.
 *
 * Previously a recruiter had to paste a job description into each analysis, so
 * evaluations were inconsistent and easy to forget. Saving them here makes the
 * same bar apply automatically to every candidate.
 */

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

const IMPORTANCE: readonly RequirementImportance[] = ["required", "preferred", "context"];
const CATEGORY: readonly RequirementCategory[] = ["skill", "responsibility", "seniority", "experience", "domain"];

export function isImportance(value: string): value is RequirementImportance {
  return (IMPORTANCE as readonly string[]).includes(value);
}

export function isCategory(value: string): value is RequirementCategory {
  return (CATEGORY as readonly string[]).includes(value);
}

export class RequirementsStore {
  readonly db: DatabaseSync;

  constructor(databasePath = process.env.CODEPROOF_DB_PATH ?? path.join(process.cwd(), ".data", "codeproof.db")) {
    if (databasePath !== ":memory:") mkdirSync(path.dirname(databasePath), { recursive: true });
    this.db = new DatabaseSync(databasePath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS company_requirements (
        id          TEXT PRIMARY KEY,
        requirement TEXT NOT NULL,
        importance  TEXT NOT NULL,
        category    TEXT NOT NULL,
        position    INTEGER NOT NULL
      );
    `);
  }

  list(): CompanyRequirement[] {
    const rows = this.db
      .prepare("SELECT * FROM company_requirements ORDER BY position ASC")
      .all() as unknown as RequirementRow[];
    return rows.map((row) => ({
      id: row.id,
      requirement: row.requirement,
      importance: isImportance(row.importance) ? row.importance : "context",
      category: isCategory(row.category) ? row.category : "skill",
    }));
  }

  /** Replaces the whole set, so the saved list always mirrors the form. */
  replaceAll(requirements: CompanyRequirement[]): CompanyRequirement[] {
    this.db.exec("BEGIN");
    try {
      this.db.exec("DELETE FROM company_requirements");
      const insert = this.db.prepare(
        "INSERT INTO company_requirements (id, requirement, importance, category, position) VALUES (?, ?, ?, ?, ?)",
      );
      requirements.forEach((item, index) => {
        insert.run(item.id, item.requirement.trim(), item.importance, item.category, index);
      });
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return this.list();
  }
}

let cached: RequirementsStore | null = null;

export function getRequirementsStore(): RequirementsStore {
  cached ??= new RequirementsStore();
  return cached;
}

/** Shape the saved requirements for the analysis engine. */
export function toExtractedRequirements(requirements: CompanyRequirement[]): ExtractedJobRequirement[] {
  return requirements.map(({ requirement, importance, category }) => ({
    requirement,
    importance,
    category,
    source: "Job Requirement" as const,
  }));
}

/**
 * A readable rendering of the requirements, used as the analysis job-description
 * input so the existing deterministic pipeline (caching, résumé comparison,
 * interview prompts) keeps working unchanged.
 */
export function toJobDescriptionText(requirements: CompanyRequirement[]): string {
  if (requirements.length === 0) return "";
  const line = (item: CompanyRequirement) =>
    `- ${item.requirement}${item.importance === "required" ? " (required)" : item.importance === "preferred" ? " (preferred)" : ""}`;
  return ["Company requirements:", ...requirements.map(line)].join("\n");
}
