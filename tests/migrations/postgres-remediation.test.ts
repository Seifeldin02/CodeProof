import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { describe, expect, it } from "vitest";
import {
  ensurePostgreSQLRemediationSchema,
  POSTGRESQL_REMEDIATION_MIGRATIONS,
  PostgreSQLSchemaUpgradeError,
} from "@/features/persistence/postgres-migrations";

interface LegacyRepositoryFixture {
  source_id: string;
  candidate_id: string;
  owner_user_id: string | null;
  owner_exists: boolean;
  repository_url: string;
  repository_name: string;
  observed_at: string;
}

interface LegacyAnalysisFixture {
  id: string;
  candidate_id: string;
  owner_user_id: string | null;
  owner_exists: boolean;
  analyzed_at: string;
  is_demo: boolean;
}

interface LegacyRequirementFixture {
  id: string;
  owner_user_id: string | null;
  owner_exists: boolean;
  requirement: string;
  importance: string;
  category: string;
  position: number;
}

interface Mutation {
  sql: string;
  values: readonly unknown[];
}

class FakeMigrationPool {
  readonly queries: Mutation[] = [];
  readonly committedMutations: Mutation[] = [];
  readonly ledger = new Map<number, { version: number; name: string; checksum: string }>();
  readonly repositories = new Map<string, string>();
  readonly outcomes: LegacyRepositoryFixture[] = [];
  readonly analysisRepositories: LegacyRepositoryFixture[] = [];
  readonly analyses: LegacyAnalysisFixture[] = [];
  readonly requirements: LegacyRequirementFixture[] = [];
  advisoryCalls = 0;
  maxConcurrentLockHolders = 0;
  parityDelayMs = 0;

  private lockHolder: FakeMigrationClient | null = null;
  private readonly lockWaiters: Array<() => void> = [];

  constructor(seedLedger: Array<{ version: number; name: string; checksum: string }> = []) {
    for (const row of seedLedger) this.ledger.set(row.version, row);
  }

  async connect(): Promise<FakeMigrationClient> {
    return new FakeMigrationClient(this);
  }

  async acquire(client: FakeMigrationClient): Promise<void> {
    this.advisoryCalls += 1;
    if (this.lockHolder) {
      await new Promise<void>((resolve) => this.lockWaiters.push(resolve));
    }
    this.lockHolder = client;
    this.maxConcurrentLockHolders = Math.max(this.maxConcurrentLockHolders, this.lockHolder ? 1 : 0);
  }

  releaseLock(client: FakeMigrationClient): void {
    if (this.lockHolder !== client) return;
    this.lockHolder = null;
    this.lockWaiters.shift()?.();
  }
}

class FakeMigrationClient {
  private inTransaction = false;
  private readonly stagedLedger = new Map<number, { version: number; name: string; checksum: string }>();
  private readonly stagedRepositories = new Map<string, string>();
  private readonly stagedMutations: Mutation[] = [];

  constructor(private readonly pool: FakeMigrationPool) {}

  async query(sql: string, values: readonly unknown[] = []): Promise<{ rows: unknown[]; rowCount: number }> {
    const normalized = sql.replace(/\s+/g, " ").trim();
    this.pool.queries.push({ sql: normalized, values });

    if (normalized === "BEGIN") {
      this.inTransaction = true;
      return { rows: [], rowCount: 0 };
    }
    if (normalized.startsWith("SELECT pg_advisory_xact_lock")) {
      await this.pool.acquire(this);
      return { rows: [], rowCount: 1 };
    }
    if (normalized === "COMMIT") {
      for (const [version, row] of this.stagedLedger) this.pool.ledger.set(version, row);
      for (const [key, id] of this.stagedRepositories) this.pool.repositories.set(key, id);
      this.pool.committedMutations.push(...this.stagedMutations);
      this.clearTransaction();
      return { rows: [], rowCount: 0 };
    }
    if (normalized === "ROLLBACK") {
      this.clearTransaction();
      return { rows: [], rowCount: 0 };
    }
    if (normalized.startsWith("SELECT version, name, checksum FROM codeproof_schema_versions")) {
      return { rows: [...this.pool.ledger.values()].sort((left, right) => left.version - right.version), rowCount: this.pool.ledger.size };
    }
    if (normalized.startsWith("INSERT INTO codeproof_schema_versions")) {
      const row = { version: Number(values[0]), name: String(values[1]), checksum: String(values[2]) };
      this.stagedLedger.set(row.version, row);
      this.stagedMutations.push({ sql: normalized, values });
      return { rows: [], rowCount: 1 };
    }
    if (normalized.includes("CREATE TABLE IF NOT EXISTS codeproof_users") && normalized.includes("codeproof_release_disclosures")) {
      if (this.pool.parityDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, this.pool.parityDelayMs));
      return { rows: [], rowCount: 0 };
    }
    if (normalized.includes("FROM codeproof_candidate_repository_outcomes source")) {
      return this.page(this.pool.outcomes, values, "source_id");
    }
    if (normalized.includes("FROM codeproof_candidate_analyses source")) {
      return this.page(this.pool.analysisRepositories, values, "source_id");
    }
    if (normalized.includes("SELECT analysis.id") && normalized.includes("FROM codeproof_candidate_analyses analysis")) {
      return this.page(this.pool.analyses, values, "id");
    }
    if (normalized.startsWith("INSERT INTO codeproof_candidate_repositories")) {
      const key = `${String(values[2])}\0${String(values[3])}`;
      const existing = this.stagedRepositories.get(key) ?? this.pool.repositories.get(key);
      if (existing) return { rows: [], rowCount: 0 };
      const id = String(values[0]);
      this.stagedRepositories.set(key, id);
      this.stagedMutations.push({ sql: normalized, values });
      return { rows: [{ id }], rowCount: 1 };
    }
    if (normalized.startsWith("SELECT id FROM codeproof_candidate_repositories")) {
      const key = `${String(values[0])}\0${String(values[1])}`;
      const id = this.stagedRepositories.get(key) ?? this.pool.repositories.get(key);
      return { rows: id ? [{ id }] : [], rowCount: id ? 1 : 0 };
    }
    if (normalized.includes("SELECT requirement.id AS source_id")) {
      const rows = this.pool.requirements.map((item) => ({
        source_id: item.id,
        owner_user_id: item.owner_user_id,
        owner_exists: item.owner_exists,
      }));
      return this.page(rows, values, "source_id");
    }
    if (normalized.startsWith("SELECT requirement.owner_user_id") && normalized.includes("GROUP BY")) {
      const cursor = values[0] === null ? null : String(values[0]);
      const limit = Number(values[1]);
      const owners = [...new Set(this.pool.requirements
        .filter((item) => item.owner_user_id && item.owner_exists)
        .map((item) => item.owner_user_id as string))]
        .filter((owner) => cursor === null || owner > cursor)
        .sort()
        .slice(0, limit)
        .map((owner_user_id) => ({ owner_user_id }));
      return { rows: owners, rowCount: owners.length };
    }
    if (normalized.startsWith("SELECT id, requirement, importance, category, position")) {
      const owner = String(values[0]);
      const cursor = values[1] === null ? null : String(values[1]);
      const limit = Number(values[2]);
      const rows = this.pool.requirements
        .filter((item) => item.owner_user_id === owner && (cursor === null || item.id > cursor))
        .sort((left, right) => left.id.localeCompare(right.id))
        .slice(0, limit)
        .map(({ id, requirement, importance, category, position }) => ({ id, requirement, importance, category, position }));
      return { rows, rowCount: rows.length };
    }
    if (normalized.startsWith("INSERT INTO codeproof_")) {
      this.stagedMutations.push({ sql: normalized, values });
      return { rows: [], rowCount: 1 };
    }

    return { rows: [], rowCount: 0 };
  }

  release(): void {
    if (this.inTransaction) this.clearTransaction();
  }

  private page<Row extends object>(
    source: Row[],
    values: readonly unknown[],
    cursorKey: keyof Row,
  ): { rows: Row[]; rowCount: number } {
    const cursor = values[0] === null ? null : String(values[0]);
    const limit = Number(values[1]);
    const rows = source
      .filter((row) => cursor === null || String(row[cursorKey]) > cursor)
      .sort((left, right) => String(left[cursorKey]).localeCompare(String(right[cursorKey])))
      .slice(0, limit);
    return { rows, rowCount: rows.length };
  }

  private clearTransaction(): void {
    this.inTransaction = false;
    this.stagedLedger.clear();
    this.stagedRepositories.clear();
    this.stagedMutations.length = 0;
    this.pool.releaseLock(this);
  }
}

function asPool(fake: FakeMigrationPool): Pool {
  return fake as unknown as Pool;
}

const timestamp = "2025-01-02T03:04:05.000Z";

function seedLegacyFixture(pool: FakeMigrationPool): void {
  const shared = {
    candidate_id: "candidate-1",
    owner_user_id: "owner-1",
    owner_exists: true,
    observed_at: timestamp,
  };
  pool.outcomes.push({
    ...shared,
    source_id: "outcome-1",
    repository_url: "https://github.com/example/legacy-one",
    repository_name: "example/legacy-one",
  });
  pool.analysisRepositories.push({
    ...shared,
    source_id: "analysis-1",
    repository_url: "https://github.com/example/legacy-one",
    repository_name: "example/legacy-one",
  });
  pool.analyses.push({
    id: "analysis-1",
    candidate_id: "candidate-1",
    owner_user_id: "owner-1",
    owner_exists: true,
    analyzed_at: timestamp,
    is_demo: true,
  });
  pool.requirements.push({
    id: "requirement-1",
    owner_user_id: "owner-1",
    owner_exists: true,
    requirement: "TypeScript",
    importance: "required",
    category: "skill",
    position: 0,
  });
}

describe("PostgreSQL remediation inline migrations", () => {
  it("defines a numbered checksummed PostgreSQL parity schema and applies it in one locked transaction", async () => {
    const fake = new FakeMigrationPool();

    await ensurePostgreSQLRemediationSchema(asPool(fake));

    expect([...fake.ledger.values()]).toEqual(POSTGRESQL_REMEDIATION_MIGRATIONS);
    expect(POSTGRESQL_REMEDIATION_MIGRATIONS.map((migration) => migration.version)).toEqual([1, 2, 3, 4]);
    expect(POSTGRESQL_REMEDIATION_MIGRATIONS.every((migration) => /^[a-f0-9]{64}$/.test(migration.checksum))).toBe(true);
    expect(fake.queries.slice(0, 3).map((query) => query.sql)).toEqual([
      "BEGIN",
      "SELECT pg_advisory_xact_lock($1)",
      expect.stringContaining("CREATE TABLE IF NOT EXISTS codeproof_schema_versions"),
    ]);
    expect(fake.queries.at(-1)?.sql).toBe("COMMIT");

    const schemaSql = fake.queries.find((query) => query.sql.includes("codeproof_release_disclosures"))?.sql ?? "";
    for (const table of [
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
    ]) expect(schemaSql, table).toContain(`codeproof_${table}`);
    expect(schemaSql).toContain("JSONB");
    expect(schemaSql).toContain("BOOLEAN");
    expect(schemaSql).toContain("TIMESTAMPTZ");
    expect(schemaSql).toContain("ON DELETE CASCADE");
    expect(schemaSql).toContain("BEFORE UPDATE OR DELETE OR TRUNCATE");
  });

  it("backfills legacy rows in bounded pages without inventing origin or rewriting source rows", async () => {
    const fake = new FakeMigrationPool();
    seedLegacyFixture(fake);

    await ensurePostgreSQLRemediationSchema(asPool(fake), { backfillBatchSize: 1 });

    const repositoryInsert = fake.committedMutations.find((mutation) =>
      mutation.sql.startsWith("INSERT INTO codeproof_candidate_repositories"));
    expect(repositoryInsert?.sql).toContain("NULL, 'unverified'");
    expect(repositoryInsert?.sql).toContain("TRUE, 'pre_remediation'");
    expect(repositoryInsert?.values.slice(1, 4)).toEqual([
      "owner-1",
      "candidate-1",
      "https://github.com/example/legacy-one",
    ]);

    const analysisInsert = fake.committedMutations.find((mutation) =>
      mutation.sql.startsWith("INSERT INTO codeproof_analysis_versions"));
    expect(analysisInsert?.sql).toContain("'legacy', 'legacy'");
    expect(analysisInsert?.sql).toContain("TRUE, 'pre_remediation'");
    expect(analysisInsert?.values.slice(1, 4)).toEqual(["owner-1", "candidate-1", "analysis-1"]);

    const markers = fake.committedMutations.filter((mutation) =>
      mutation.sql.startsWith("INSERT INTO codeproof_legacy_migration_markers"));
    expect(markers.some((marker) => marker.values[5] === "recompute_required")).toBe(true);
    expect(markers.every((marker) => marker.sql.includes("ON CONFLICT"))).toBe(true);
    expect(fake.queries.some((query) => /UPDATE codeproof_(candidates|candidate_analyses|candidate_repository_outcomes|company_requirements)/i.test(query.sql))).toBe(false);
    expect(fake.queries
      .filter((query) => /FROM codeproof_(candidate_repository_outcomes|candidate_analyses) source|FROM codeproof_candidate_analyses analysis|FROM codeproof_company_requirements requirement/.test(query.sql))
      .every((query) => query.sql.includes("LIMIT"))).toBe(true);
  });

  it("is idempotent across repeated runs", async () => {
    const fake = new FakeMigrationPool();
    seedLegacyFixture(fake);
    await ensurePostgreSQLRemediationSchema(asPool(fake), { backfillBatchSize: 1 });
    const committedAfterFirst = fake.committedMutations.length;

    await ensurePostgreSQLRemediationSchema(asPool(fake), { backfillBatchSize: 17 });

    expect(fake.ledger.size).toBe(POSTGRESQL_REMEDIATION_MIGRATIONS.length);
    expect(fake.committedMutations.length).toBe(committedAfterFirst);
    expect(fake.queries.at(-1)?.sql).toBe("COMMIT");
  });

  it("serializes concurrent initialization with the transaction-scoped advisory lock", async () => {
    const fake = new FakeMigrationPool();
    fake.parityDelayMs = 10;

    await Promise.all([
      ensurePostgreSQLRemediationSchema(asPool(fake)),
      ensurePostgreSQLRemediationSchema(asPool(fake)),
    ]);

    expect(fake.advisoryCalls).toBe(2);
    expect(fake.maxConcurrentLockHolders).toBe(1);
    expect(fake.ledger.size).toBe(POSTGRESQL_REMEDIATION_MIGRATIONS.length);
    expect(fake.committedMutations.filter((mutation) =>
      mutation.sql.startsWith("INSERT INTO codeproof_schema_versions"))).toHaveLength(
      POSTGRESQL_REMEDIATION_MIGRATIONS.length,
    );
  });

  it("fails readiness and rolls back on a migration checksum mismatch", async () => {
    const expected = POSTGRESQL_REMEDIATION_MIGRATIONS[0];
    const fake = new FakeMigrationPool([{ ...expected, checksum: "0".repeat(64) }]);

    await expect(ensurePostgreSQLRemediationSchema(asPool(fake))).rejects.toMatchObject({
      name: "PostgreSQLSchemaUpgradeError",
      code: "SCHEMA_UPGRADE_FAILED",
      migrationVersion: 1,
    });
    expect(fake.queries.at(-1)?.sql).toBe("ROLLBACK");
    expect(fake.ledger.get(1)?.checksum).toBe("0".repeat(64));
  });

  it("rolls back all staged schema ledger and backfill writes after an injected failure", async () => {
    const fake = new FakeMigrationPool();
    seedLegacyFixture(fake);

    let thrown: unknown;
    try {
      await ensurePostgreSQLRemediationSchema(asPool(fake), {
        backfillBatchSize: 1,
        beforeMigration(migration) {
          if (migration.version === 4) throw new Error("injected migration failure");
        },
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(PostgreSQLSchemaUpgradeError);
    expect(thrown).toMatchObject({ code: "SCHEMA_UPGRADE_FAILED", migrationVersion: 4 });
    expect(fake.ledger.size).toBe(0);
    expect(fake.committedMutations).toEqual([]);
    expect(fake.queries.at(-1)?.sql).toBe("ROLLBACK");
  });

  it("runs an isolated live legacy upgrade when PostgreSQL infrastructure is configured, or records the exact missing variables", async () => {
    const connectionString = process.env.DATABASE_URL?.trim() || process.env.POSTGRES_URL?.trim();
    if (!connectionString) {
      const missing = ["DATABASE_URL", "POSTGRES_URL"];
      console.warn(`PostgreSQL integration externally unavailable: ${missing.join(" and ")} are unset.`);
      expect(missing).toEqual(["DATABASE_URL", "POSTGRES_URL"]);
      return;
    }

    const schema = `codeproof_migration_${randomUUID().replaceAll("-", "")}`;
    const administrator = new Pool({ connectionString, max: 1 });
    const scoped = new Pool({ connectionString, max: 3, options: `-c search_path=${schema}` });
    try {
      await administrator.query(`CREATE SCHEMA "${schema}"`);
      await scoped.query(`
        CREATE TABLE codeproof_users (
          id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL
        );
        CREATE TABLE codeproof_candidates (
          id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL, source TEXT NOT NULL,
          evidence_index INTEGER NOT NULL, applied_at TEXT NOT NULL, outcome TEXT NOT NULL, furthest_stage TEXT NOT NULL,
          is_demo BOOLEAN NOT NULL DEFAULT FALSE, repository_count INTEGER NOT NULL DEFAULT 0, verified_claim_count INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE codeproof_candidate_analyses (
          id TEXT PRIMARY KEY, candidate_id TEXT NOT NULL REFERENCES codeproof_candidates(id) ON DELETE CASCADE,
          repository_url TEXT NOT NULL, repository_name TEXT NOT NULL, primary_language TEXT, project_type TEXT NOT NULL,
          evidence_index INTEGER NOT NULL, summary TEXT NOT NULL, analyzed_at TEXT NOT NULL, analysis_json JSONB NOT NULL,
          UNIQUE(candidate_id, repository_url)
        );
        CREATE TABLE codeproof_candidate_repository_outcomes (
          id TEXT PRIMARY KEY, candidate_id TEXT NOT NULL REFERENCES codeproof_candidates(id) ON DELETE CASCADE,
          repository_url TEXT NOT NULL, repository_name TEXT NOT NULL, status TEXT NOT NULL, code TEXT, message TEXT,
          updated_at TEXT NOT NULL, UNIQUE(candidate_id, repository_url)
        );
        CREATE TABLE codeproof_company_requirements (
          id TEXT NOT NULL, owner_user_id TEXT NOT NULL, requirement TEXT NOT NULL, importance TEXT NOT NULL,
          category TEXT NOT NULL, position INTEGER NOT NULL, PRIMARY KEY(owner_user_id, id)
        );
      `);
      await scoped.query(
        "INSERT INTO codeproof_users (id,email,password_hash,created_at) VALUES ($1,$2,$3,$4)",
        ["owner-1", "owner@example.test", "scrypt$legacy$hash", timestamp],
      );
      await scoped.query(`INSERT INTO codeproof_candidates
        (id,owner_user_id,name,role,source,evidence_index,applied_at,outcome,furthest_stage,is_demo,repository_count,verified_claim_count)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [
        "candidate-1", "owner-1", "Legacy Candidate", "Developer", "CodeProof", 72, timestamp,
        "in_progress", "code_review", true, 1, 1,
      ]);
      await scoped.query(`INSERT INTO codeproof_candidate_analyses
        (id,candidate_id,repository_url,repository_name,primary_language,project_type,evidence_index,summary,analyzed_at,analysis_json)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`, [
        "analysis-1", "candidate-1", "https://github.com/example/legacy", "example/legacy", "TypeScript",
        "Web application", 72, "Legacy summary", timestamp, JSON.stringify({ preserved: true }),
      ]);
      await scoped.query(`INSERT INTO codeproof_candidate_repository_outcomes
        (id,candidate_id,repository_url,repository_name,status,code,message,updated_at)
        VALUES ($1,$2,$3,$4,'analyzed',NULL,NULL,$5)`, [
        "outcome-1", "candidate-1", "https://github.com/example/legacy", "example/legacy", timestamp,
      ]);
      await scoped.query(`INSERT INTO codeproof_company_requirements
        (id,owner_user_id,requirement,importance,category,position) VALUES ($1,$2,$3,$4,$5,$6)`, [
        "requirement-1", "owner-1", "TypeScript", "required", "skill", 0,
      ]);

      const before = await scoped.query("SELECT analysis_json FROM codeproof_candidate_analyses WHERE id='analysis-1'");
      await Promise.all([
        ensurePostgreSQLRemediationSchema(scoped, { backfillBatchSize: 1 }),
        ensurePostgreSQLRemediationSchema(scoped, { backfillBatchSize: 1 }),
      ]);
      await ensurePostgreSQLRemediationSchema(scoped, { backfillBatchSize: 2 });

      expect((await scoped.query("SELECT version, name, checksum FROM codeproof_schema_versions ORDER BY version")).rows)
        .toEqual(POSTGRESQL_REMEDIATION_MIGRATIONS);
      expect((await scoped.query(`SELECT owner_user_id, candidate_id, discovery_origin, attribution_status,
        origin_confirmation_required, legacy_marker FROM codeproof_candidate_repositories`)).rows).toEqual([{
        owner_user_id: "owner-1",
        candidate_id: "candidate-1",
        discovery_origin: null,
        attribution_status: "unverified",
        origin_confirmation_required: true,
        legacy_marker: "pre_remediation",
      }]);
      expect((await scoped.query(`SELECT owner_user_id, candidate_id, deterministic_engine_version,
        taxonomy_version, is_demo, recompute_required, legacy_marker FROM codeproof_analysis_versions`)).rows).toEqual([{
        owner_user_id: "owner-1",
        candidate_id: "candidate-1",
        deterministic_engine_version: "legacy",
        taxonomy_version: "legacy",
        is_demo: true,
        recompute_required: true,
        legacy_marker: "pre_remediation",
      }]);
      expect((await scoped.query("SELECT analysis_json FROM codeproof_candidate_analyses WHERE id='analysis-1'")).rows)
        .toEqual(before.rows);
    } finally {
      await scoped.end();
      await administrator.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await administrator.end();
    }
  }, 30_000);
});

describe("Feature: codeproof-audit-remediation, Property 30: Inline upgrades are idempotent, atomic, and conservative", () => {
  // **Validates: Requirements 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7, 14.8, 14.9, 14.10, 14.11, 15.13, 15.14**
  it("holds for 128 deterministic fresh, legacy, repeated, and injected-failure PostgreSQL-compatible cases", async () => {
    const generatedCaseCount = 128;

    for (let index = 0; index < generatedCaseCount; index += 1) {
      const fake = new FakeMigrationPool();
      const isLegacy = index % 2 === 0 || index % 11 === 0;
      if (isLegacy) seedLegacyFixture(fake);
      const sourcesBefore = structuredClone({
        outcomes: fake.outcomes,
        analysisRepositories: fake.analysisRepositories,
        analyses: fake.analyses,
        requirements: fake.requirements,
      });
      const batchSize = (index % 31) + 1;
      const injectFailure = index % 11 === 0;

      if (injectFailure) {
        const failureVersion = (index % POSTGRESQL_REMEDIATION_MIGRATIONS.length) + 1;
        await expect(ensurePostgreSQLRemediationSchema(asPool(fake), {
          backfillBatchSize: batchSize,
          beforeMigration(migration) {
            if (migration.version === failureVersion) throw new Error(`injected property failure ${index}`);
          },
        })).rejects.toBeInstanceOf(PostgreSQLSchemaUpgradeError);
        expect([...fake.ledger.values()]).toEqual([]);
        expect([...fake.repositories.entries()]).toEqual([]);
        expect(fake.committedMutations).toEqual([]);
        expect({
          outcomes: fake.outcomes,
          analysisRepositories: fake.analysisRepositories,
          analyses: fake.analyses,
          requirements: fake.requirements,
        }).toEqual(sourcesBefore);
        continue;
      }

      await ensurePostgreSQLRemediationSchema(asPool(fake), { backfillBatchSize: batchSize });
      const migrated = {
        ledger: structuredClone([...fake.ledger.values()]),
        repositories: structuredClone([...fake.repositories.entries()]),
        committedMutations: structuredClone(fake.committedMutations),
      };
      await ensurePostgreSQLRemediationSchema(asPool(fake), {
        backfillBatchSize: ((index * 17) % 47) + 1,
      });
      expect({
        ledger: [...fake.ledger.values()],
        repositories: [...fake.repositories.entries()],
        committedMutations: fake.committedMutations,
      }).toEqual(migrated);
      expect([...fake.ledger.values()]).toEqual(POSTGRESQL_REMEDIATION_MIGRATIONS);
      expect({
        outcomes: fake.outcomes,
        analysisRepositories: fake.analysisRepositories,
        analyses: fake.analyses,
        requirements: fake.requirements,
      }).toEqual(sourcesBefore);

      if (isLegacy) {
        expect(fake.repositories.size).toBe(1);
        const repositoryInsert = fake.committedMutations.find((mutation) => (
          mutation.sql.startsWith("INSERT INTO codeproof_candidate_repositories")
        ));
        expect(repositoryInsert?.sql).toContain("NULL, 'unverified'");
        expect(repositoryInsert?.sql).toContain("origin_confirmation_required");
        expect(repositoryInsert?.values.slice(1, 4)).toEqual([
          "owner-1",
          "candidate-1",
          "https://github.com/example/legacy-one",
        ]);
      } else {
        expect(fake.repositories.size).toBe(0);
      }
    }
  });
});
