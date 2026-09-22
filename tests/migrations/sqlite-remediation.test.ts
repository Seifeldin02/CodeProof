import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { AuthStore } from "@/features/auth/store";
import { CandidateStore } from "@/features/candidates/store";
import {
  ensureRemediationSchema,
  SQLITE_REMEDIATION_MIGRATIONS,
  SQLiteSchemaUpgradeError,
} from "@/features/persistence/sqlite-migrations";
import { RequirementsStore } from "@/features/requirements/store";

const temporaryDirectories: string[] = [];
const timestamp = "2025-01-02T03:04:05.000Z";

interface SchemaRow {
  type: string;
  name: string;
  tbl_name: string;
  sql: string | null;
}

async function temporaryDatabasePath(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "codeproof-sqlite-migration-"));
  temporaryDirectories.push(directory);
  return path.join(directory, "legacy.db");
}

function tableNames(db: DatabaseSync): string[] {
  return (db.prepare(`SELECT name FROM sqlite_schema
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`).all() as unknown as Array<{ name: string }>)
    .map((row) => row.name);
}

function schemaFingerprint(db: DatabaseSync): SchemaRow[] {
  return db.prepare(`SELECT type, name, tbl_name, sql FROM sqlite_schema
    WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name`).all() as unknown as SchemaRow[];
}

function dataFingerprint(db: DatabaseSync): Record<string, unknown[]> {
  return Object.fromEntries(tableNames(db).map((table) => {
    const escaped = table.replaceAll('"', '""');
    return [table, db.prepare(`SELECT * FROM "${escaped}" ORDER BY rowid`).all() as unknown[]];
  }));
}

function selectedLegacyData(db: DatabaseSync) {
  return {
    users: db.prepare("SELECT id, email, password_hash, created_at FROM users ORDER BY id").all(),
    candidates: db.prepare(`SELECT id, owner_user_id, name, role, source, evidence_index, applied_at,
      outcome, furthest_stage, is_demo, repository_count, verified_claim_count FROM candidates ORDER BY id`).all(),
    stages: db.prepare("SELECT id, candidate_id, stage, entered_at FROM stage_events ORDER BY id").all(),
    analyses: db.prepare(`SELECT id, candidate_id, repository_url, repository_name, primary_language,
      project_type, evidence_index, summary, analyzed_at, analysis_json FROM candidate_analyses ORDER BY id`).all(),
    outcomes: db.prepare(`SELECT id, candidate_id, repository_url, repository_name, status, code, message,
      updated_at FROM candidate_repository_outcomes ORDER BY id`).all(),
    requirements: db.prepare(`SELECT id, owner_user_id, requirement, importance, category, position
      FROM company_requirements ORDER BY id`).all(),
    comparisons: db.prepare("SELECT id, owner_user_id, result_json FROM legacy_saved_comparisons ORDER BY id").all(),
  };
}

function createSupportedLegacyFixture(databasePath: string): DatabaseSync {
  const db = new DatabaseSync(databasePath);
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE candidates (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT,
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
    CREATE TABLE stage_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
      stage TEXT NOT NULL,
      entered_at TEXT NOT NULL
    );
    CREATE TABLE candidate_analyses (
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
    CREATE TABLE candidate_repository_outcomes (
      id TEXT PRIMARY KEY,
      candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
      repository_url TEXT NOT NULL,
      repository_name TEXT NOT NULL,
      status TEXT NOT NULL,
      code TEXT,
      message TEXT,
      updated_at TEXT NOT NULL,
      UNIQUE(candidate_id, repository_url)
    );
    CREATE TABLE company_requirements (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT,
      requirement TEXT NOT NULL,
      importance TEXT NOT NULL,
      category TEXT NOT NULL,
      position INTEGER NOT NULL
    );
    CREATE TABLE legacy_saved_comparisons (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL,
      result_json TEXT NOT NULL
    );
  `);

  db.prepare("INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)")
    .run("owner-1", "owner@example.test", "scrypt$legacy-salt$legacy-hash", timestamp);
  db.prepare(`INSERT INTO candidates
    (id, owner_user_id, name, role, source, evidence_index, applied_at, outcome, furthest_stage,
     is_demo, repository_count, verified_claim_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run("candidate-1", "owner-1", "Legacy Candidate", "Developer", "CodeProof", 72, timestamp, "in_progress", "code_review", 1, 2, 1);
  db.prepare("INSERT INTO stage_events (candidate_id, stage, entered_at) VALUES (?, ?, ?)")
    .run("candidate-1", "applied", timestamp);

  const legacyAnalysis = JSON.stringify({
    metadata: { analyzedAt: timestamp },
    skills: [{ name: "TypeScript", level: "Strong Evidence" }],
    legacyConclusion: "preserve this JSON exactly",
  });
  db.prepare(`INSERT INTO candidate_analyses
    (id, candidate_id, repository_url, repository_name, primary_language, project_type,
     evidence_index, summary, analyzed_at, analysis_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      "analysis-1",
      "candidate-1",
      "https://github.com/example/legacy-one",
      "example/legacy-one",
      "TypeScript",
      "Web application",
      72,
      "Legacy summary",
      timestamp,
      legacyAnalysis,
    );
  const insertOutcome = db.prepare(`INSERT INTO candidate_repository_outcomes
    (id, candidate_id, repository_url, repository_name, status, code, message, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  insertOutcome.run(
    "outcome-1",
    "candidate-1",
    "https://github.com/example/legacy-one",
    "example/legacy-one",
    "analyzed",
    null,
    null,
    timestamp,
  );
  insertOutcome.run(
    "outcome-2",
    "candidate-1",
    "https://github.com/example/unavailable",
    "example/unavailable",
    "failed",
    "DOWNLOAD_FAILED",
    "Unavailable fixture",
    timestamp,
  );
  db.prepare(`INSERT INTO company_requirements
    (id, owner_user_id, requirement, importance, category, position) VALUES (?, ?, ?, ?, ?, ?)`)
    .run("requirement-1", "owner-1", "TypeScript", "required", "skill", 0);
  db.prepare("INSERT INTO legacy_saved_comparisons (id, owner_user_id, result_json) VALUES (?, ?, ?)")
    .run("comparison-1", "owner-1", JSON.stringify({ candidateIds: ["candidate-1"], score: 72 }));
  return db;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("SQLite remediation inline migrations", () => {
  it("creates the fresh schema through existing store initialization in any established path", async () => {
    const databasePath = await temporaryDatabasePath();

    const auth = new AuthStore(databasePath);
    auth.db.close();
    const candidates = new CandidateStore(databasePath);
    candidates.db.close();
    const requirements = new RequirementsStore(databasePath);
    requirements.db.close();

    const db = new DatabaseSync(databasePath);
    const tables = new Set(tableNames(db));
    for (const expected of [
      "schema_versions",
      "candidate_repositories",
      "contribution_verification_events",
      "analysis_versions",
      "detector_findings",
      "evidence_citations",
      "requisition_versions",
      "saved_comparisons",
      "review_orders",
      "ai_telemetry",
      "pricing_registry",
      "usage_reservations",
      "external_shares",
      "share_access_log",
      "admin_audit_log",
      "impersonation_grants",
      "verification_cycles",
      "release_gate_passes",
      "release_verifications",
      "release_disclosures",
    ]) expect(tables.has(expected), expected).toBe(true);

    const accountColumns = new Set((db.prepare("PRAGMA table_info(users)").all() as unknown as Array<{ name: string }>).map((row) => row.name));
    for (const expected of [
      "role",
      "lifecycle_state",
      "is_demo",
      "demo_label",
      "company_name",
      "plan_tier_id",
      "last_activity_at",
      "suspended_at",
      "soft_deleted_at",
    ]) expect(accountColumns.has(expected), expected).toBe(true);

    const ledger = db.prepare("SELECT version, name, checksum FROM schema_versions ORDER BY version").all();
    expect(ledger).toEqual(SQLITE_REMEDIATION_MIGRATIONS);
    expect((ledger as unknown as Array<{ checksum: string }>).every((row) => /^[a-f0-9]{64}$/.test(row.checksum))).toBe(true);
    db.close();
  });

  it("upgrades supported legacy data conservatively without changing source rows or ownership", async () => {
    const databasePath = await temporaryDatabasePath();
    const db = createSupportedLegacyFixture(databasePath);
    const before = selectedLegacyData(db);

    ensureRemediationSchema(db, { backfillBatchSize: 1 });

    expect(selectedLegacyData(db)).toEqual(before);
    expect(db.prepare(`SELECT role, lifecycle_state, is_demo, demo_label, company_name, plan_tier_id,
      last_activity_at, suspended_at, soft_deleted_at FROM users WHERE id = 'owner-1'`).get()).toEqual({
      role: "RECRUITER",
      lifecycle_state: "active",
      is_demo: 0,
      demo_label: null,
      company_name: null,
      plan_tier_id: null,
      last_activity_at: null,
      suspended_at: null,
      soft_deleted_at: null,
    });

    expect(db.prepare(`SELECT owner_user_id, candidate_id, repository_url, discovery_origin,
      attribution_status, origin_confirmation_required, legacy_marker
      FROM candidate_repositories ORDER BY repository_url`).all()).toEqual([
      {
        owner_user_id: "owner-1",
        candidate_id: "candidate-1",
        repository_url: "https://github.com/example/legacy-one",
        discovery_origin: null,
        attribution_status: "unverified",
        origin_confirmation_required: 1,
        legacy_marker: "pre_remediation",
      },
      {
        owner_user_id: "owner-1",
        candidate_id: "candidate-1",
        repository_url: "https://github.com/example/unavailable",
        discovery_origin: null,
        attribution_status: "unverified",
        origin_confirmation_required: 1,
        legacy_marker: "pre_remediation",
      },
    ]);
    expect(db.prepare("SELECT from_status, to_status, reason FROM contribution_verification_events ORDER BY id").all()).toEqual([
      { from_status: "unverified", to_status: "unverified", reason: "legacy_backfill" },
      { from_status: "unverified", to_status: "unverified", reason: "legacy_backfill" },
    ]);

    expect(db.prepare(`SELECT owner_user_id, candidate_id, legacy_analysis_id,
      deterministic_engine_version, taxonomy_version, is_demo, recompute_required, legacy_marker
      FROM analysis_versions`).get()).toEqual({
      owner_user_id: "owner-1",
      candidate_id: "candidate-1",
      legacy_analysis_id: "analysis-1",
      deterministic_engine_version: "legacy",
      taxonomy_version: "legacy",
      is_demo: 1,
      recompute_required: 1,
      legacy_marker: "pre_remediation",
    });
    const requisitionVersion = db.prepare(`SELECT owner_user_id, criteria_json, legacy_source_json,
      recompute_required, legacy_marker FROM requisition_versions`).get() as {
      owner_user_id: string;
      criteria_json: string;
      legacy_source_json: string;
      recompute_required: number;
      legacy_marker: string;
    };
    expect(requisitionVersion.owner_user_id).toBe("owner-1");
    expect(requisitionVersion.criteria_json).toBe("[]");
    expect(JSON.parse(requisitionVersion.legacy_source_json)).toEqual([
      { id: "requirement-1", requirement: "TypeScript", importance: "required", category: "skill", position: 0 },
    ]);
    expect(requisitionVersion.recompute_required).toBe(1);
    expect(requisitionVersion.legacy_marker).toBe("pre_remediation");

    const markers = db.prepare("SELECT status, legacy_marker FROM legacy_migration_markers").all() as unknown as Array<{ status: string; legacy_marker: string }>;
    expect(markers.length).toBeGreaterThanOrEqual(5);
    expect(markers.every((item) => item.legacy_marker === "pre_remediation")).toBe(true);
    expect(markers.some((item) => item.status === "recompute_required")).toBe(true);
    db.close();
  });

  it("is idempotent across repeated runs and preserves a stable schema/data fingerprint", async () => {
    const databasePath = await temporaryDatabasePath();
    const db = createSupportedLegacyFixture(databasePath);
    ensureRemediationSchema(db, { backfillBatchSize: 1 });
    const first = { schema: schemaFingerprint(db), data: dataFingerprint(db) };

    for (const backfillBatchSize of [1, 2, 17]) {
      ensureRemediationSchema(db, { backfillBatchSize });
      expect({ schema: schemaFingerprint(db), data: dataFingerprint(db) }).toEqual(first);
    }
    expect(db.prepare("SELECT COUNT(*) AS count FROM schema_versions").get()).toEqual({ count: SQLITE_REMEDIATION_MIGRATIONS.length });
    db.close();
  });

  it("rolls back every schema and backfill write when a later migration fails", async () => {
    const databasePath = await temporaryDatabasePath();
    const db = createSupportedLegacyFixture(databasePath);
    const before = { schema: schemaFingerprint(db), data: dataFingerprint(db) };

    let thrown: unknown;
    try {
      ensureRemediationSchema(db, {
        backfillBatchSize: 1,
        beforeMigration(migration) {
          if (migration.version === 3) throw new Error("injected migration failure");
        },
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(SQLiteSchemaUpgradeError);
    expect((thrown as SQLiteSchemaUpgradeError).code).toBe("SCHEMA_UPGRADE_FAILED");
    expect((thrown as SQLiteSchemaUpgradeError).migrationVersion).toBe(3);
    expect({ schema: schemaFingerprint(db), data: dataFingerprint(db) }).toEqual(before);
    expect(tableNames(db)).not.toContain("schema_versions");
    db.close();
  });
});

describe("Feature: codeproof-audit-remediation, Property 30: Inline upgrades are idempotent, atomic, and conservative", () => {
  // **Validates: Requirements 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7, 14.8, 14.9, 14.10, 14.11, 15.13, 15.14**
  it("holds for 128 deterministic fresh, legacy, repeated, and injected-failure SQLite cases", () => {
    const generatedCaseCount = 128;

    for (let index = 0; index < generatedCaseCount; index += 1) {
      const isLegacy = index % 2 === 0 || index % 11 === 0;
      const db = isLegacy ? createSupportedLegacyFixture(":memory:") : new DatabaseSync(":memory:");
      const legacyBefore = isLegacy ? selectedLegacyData(db) : null;
      const before = { schema: schemaFingerprint(db), data: dataFingerprint(db) };
      const batchSize = (index % 31) + 1;
      const injectFailure = index % 11 === 0;

      if (injectFailure) {
        const failureVersion = (index % SQLITE_REMEDIATION_MIGRATIONS.length) + 1;
        expect(() => ensureRemediationSchema(db, {
          backfillBatchSize: batchSize,
          beforeMigration(migration) {
            if (migration.version === failureVersion) throw new Error(`injected property failure ${index}`);
          },
        })).toThrow(SQLiteSchemaUpgradeError);
        expect({ schema: schemaFingerprint(db), data: dataFingerprint(db) }).toEqual(before);
        expect(tableNames(db)).not.toContain("schema_versions");
        if (legacyBefore) expect(selectedLegacyData(db)).toEqual(legacyBefore);
        db.close();
        continue;
      }

      ensureRemediationSchema(db, { backfillBatchSize: batchSize });
      const migrated = { schema: schemaFingerprint(db), data: dataFingerprint(db) };
      ensureRemediationSchema(db, { backfillBatchSize: ((index * 17) % 47) + 1 });
      expect({ schema: schemaFingerprint(db), data: dataFingerprint(db) }).toEqual(migrated);

      const ledger = db.prepare("SELECT version, name, checksum FROM schema_versions ORDER BY version").all();
      const expectedMigrations = isLegacy
        ? SQLITE_REMEDIATION_MIGRATIONS
        : SQLITE_REMEDIATION_MIGRATIONS.filter((migration) => migration.version <= 2);
      expect(ledger).toEqual(expectedMigrations);
      if (legacyBefore) {
        expect(selectedLegacyData(db)).toEqual(legacyBefore);
        const repositories = db.prepare(`SELECT owner_user_id, discovery_origin, attribution_status,
          origin_confirmation_required FROM candidate_repositories ORDER BY repository_url`).all();
        expect(repositories).toHaveLength(2);
        expect(repositories).toEqual(expect.arrayContaining([
          expect.objectContaining({
            owner_user_id: "owner-1",
            discovery_origin: null,
            attribution_status: "unverified",
            origin_confirmation_required: 1,
          }),
        ]));
      }
      db.close();
    }
  });
});
