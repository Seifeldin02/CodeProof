import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { AdminBootstrapDiagnostic } from "./bootstrap";
import { ensureRemediationSchema, SQLiteSchemaUpgradeError } from "@/features/persistence/sqlite-migrations";

interface AccountSnapshot {
  id: string;
  email: string;
  password_hash: string;
  created_at: string;
  role: string;
}

function legacyAccounts(count: number): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`);
  const insert = db.prepare("INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)");
  for (let index = 0; index < count; index += 1) {
    insert.run(
      `account-${index}`,
      `recruiter-${index}@example.test`,
      `scrypt$salt-${index}$hash-${index}`,
      `2026-01-${String((index % 28) + 1).padStart(2, "0")}T00:00:00.000Z`,
    );
  }
  return db;
}

function snapshots(db: DatabaseSync): AccountSnapshot[] {
  return db.prepare("SELECT id, email, password_hash, created_at, role FROM users ORDER BY id").all() as unknown as AccountSnapshot[];
}

describe("Feature: codeproof-audit-remediation, Property 34: Administrative bootstrap only elevates an already-registered account", () => {
  // **Validates: Requirements 19.2, 19.3, 19.4, 19.5**
  it("preserves account identity and credentials across 256 generated bootstrap cases", () => {
    const generatedCaseCount = 256;
    const inputs = [undefined, "", "   ", "missing@example.test"] as const;

    for (let index = 0; index < generatedCaseCount; index += 1) {
      const accountCount = (index % 5) + 1;
      const db = legacyAccounts(accountCount);
      const target = index % accountCount;
      const shouldMatch = index % 3 === 0;
      const rawValue = shouldMatch
        ? `  RECRUITER-${target}@EXAMPLE.TEST  `
        : inputs[index % inputs.length];
      const diagnostics: AdminBootstrapDiagnostic[] = [];
      const before = db.prepare("SELECT id, email, password_hash, created_at FROM users ORDER BY id").all();

      for (let repeat = 0; repeat < 3; repeat += 1) {
        ensureRemediationSchema(db, {
          initializeAccounts: true,
          adminEmail: rawValue,
          backfillBatchSize: (index % 17) + 1,
          onAdminBootstrapDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
        });
      }

      expect(db.prepare("SELECT id, email, password_hash, created_at FROM users ORDER BY id").all()).toEqual(before);
      expect(db.prepare("SELECT COUNT(*) AS count FROM users").get()).toEqual({ count: accountCount });
      const accounts = snapshots(db);
      const admins = accounts.filter((account) => account.role === "ADMIN");
      if (shouldMatch) {
        expect(admins).toEqual([expect.objectContaining({ id: `account-${target}` })]);
        expect(diagnostics).toEqual([]);
      } else {
        expect(admins).toEqual([]);
        expect(diagnostics).toHaveLength(3);
        expect(JSON.stringify(diagnostics)).not.toContain("missing@example.test");
        if (rawValue === undefined) expect(diagnostics[0].reason).toBe("variable_absent");
        else if (!rawValue.trim()) expect(diagnostics[0].reason).toBe("variable_empty");
        else expect(diagnostics[0]).toMatchObject({
          reason: "no_matching_account",
          emailDigestPrefix: expect.stringMatching(/^[a-f0-9]{8}$/),
        });
      }
      db.close();
    }
  });

  it("reports divergence without demoting an admin or elevating a second account", () => {
    const db = legacyAccounts(2);
    ensureRemediationSchema(db, { initializeAccounts: true, adminEmail: "recruiter-0@example.test" });
    const diagnostics: AdminBootstrapDiagnostic[] = [];
    ensureRemediationSchema(db, {
      initializeAccounts: true,
      adminEmail: "recruiter-1@example.test",
      onAdminBootstrapDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    });
    expect(snapshots(db).filter((account) => account.role === "ADMIN").map((account) => account.id)).toEqual(["account-0"]);
    expect(diagnostics).toEqual([expect.objectContaining({
      event: "admin_bootstrap_divergence",
      reason: "admin_bootstrap_divergence",
    })]);
    db.close();
  });

  it("fails readiness when persisted account authority is non-canonical", () => {
    const db = legacyAccounts(1);
    ensureRemediationSchema(db);
    db.prepare("UPDATE users SET role = 'OWNER' WHERE id = 'account-0'").run();
    expect(() => ensureRemediationSchema(db, { initializeAccounts: true }))
      .toThrow(SQLiteSchemaUpgradeError);
    expect(snapshots(db)[0].role).toBe("OWNER");
    db.close();
  });
});
