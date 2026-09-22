import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  AdminAuditAppendError,
  SQLiteAdminAuditStore,
  canonicalAdministrativeJson,
  redactAdministrativeValue,
  type AdminAuditRequestContext,
} from "./audit";
import { ensureRemediationSchema } from "@/features/persistence/sqlite-migrations";
import type { AdminActor } from "@/types/remediation";

const actor: AdminActor = {
  userId: "admin-1",
  email: "admin@example.test",
  role: "ADMIN",
  lifecycleState: "active",
};

const context: AdminAuditRequestContext = {
  requestCorrelationId: "request-1",
  requestMethod: "POST",
  route: "/api/admin/accounts/account-1/lifecycle",
  ipFingerprint: "a".repeat(64),
  userAgentFamily: "test-client",
};

function database(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`);
  ensureRemediationSchema(db);
  const insert = db.prepare(`INSERT INTO users
    (id, email, password_hash, created_at, role, lifecycle_state, is_demo, company_name)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  insert.run("admin-1", actor.email, "scrypt$admin-salt$admin-hash", "2026-01-01T00:00:00.000Z", "ADMIN", "active", 0, null);
  insert.run("account-1", "recruiter@example.test", "scrypt$user-salt$user-hash", "2026-01-02T00:00:00.000Z", "RECRUITER", "active", 0, "Before");
  return db;
}

describe("administrative redaction", () => {
  it("redacts denied keys and secret shapes recursively before canonical hashing", () => {
    const opaque = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789+/=EXTRA";
    const redacted = redactAdministrativeValue({
      password: "not-safe",
      nested: [{ tokenDigest: "digest" }, { note: "safe explanation" }],
      credential: "Bearer opaque-provider-secret",
      session: "headerpart.signaturepart.payloadpart",
      opaque,
      harmlessId: "account-123",
    });
    expect(redacted).toEqual({
      password: "[redacted]",
      nested: [{ tokenDigest: "[redacted]" }, { note: "safe explanation" }],
      credential: "[redacted]",
      session: "[redacted]",
      opaque: "[redacted]",
      harmlessId: "account-123",
    });
    expect(canonicalAdministrativeJson({ z: null, a: { y: 2, x: 1 } }))
      .toBe('{"a":{"x":1,"y":2},"z":null}');
  });
});

describe("Feature: codeproof-audit-remediation, Property 35: The administrative audit log is append-only, chained, and gates its action", () => {
  // **Validates: Requirements 19.12, 19.13, 19.14, 21.3, 21.8, 21.11, 21.12, 22.1, 22.3, 22.6, 22.9**
  it("preserves a valid redacted chain across 128 generated audited mutations", async () => {
    const db = database();
    const store = new SQLiteAdminAuditStore(db);
    const generatedCaseCount = 128;

    for (let index = 0; index < generatedCaseCount; index += 1) {
      const nextCompany = `Company ${index}`;
      await store.withAdminAudit(actor, {
        action: "account_company_update",
        actionCategory: "account_profile_change",
        targetKind: "account",
        targetId: "account-1",
        parameters: {
          companyName: nextCompany,
          passwordHash: `scrypt$salt-${index}$hash-${index}`,
          nested: [{ apiKey: `provider-key-${index}` }],
        },
      }, { ...context, requestCorrelationId: `request-${index}` }, (transaction) => {
        if (transaction.engine !== "sqlite") throw new Error("Expected SQLite transaction");
        const transactionDb = transaction.db;
        const before = transactionDb.prepare("SELECT company_name FROM users WHERE id = 'account-1'").get() as { company_name: string | null };
        transactionDb.prepare("UPDATE users SET company_name = ? WHERE id = 'account-1'").run(nextCompany);
        const after = transactionDb.prepare("SELECT company_name FROM users WHERE id = 'account-1'").get() as { company_name: string | null };
        return { value: undefined, before, after };
      });
    }

    const entries = await store.list();
    expect(entries).toHaveLength(generatedCaseCount);
    expect(entries.map((entry) => entry.sequence)).toEqual(Array.from({ length: generatedCaseCount }, (_, index) => index + 1));
    expect(entries.every((entry) => entry.parameters.passwordHash === "[redacted]")).toBe(true);
    expect(entries.every((entry) => (
      (entry.parameters.nested as Array<{ apiKey: string }>)[0].apiKey === "[redacted]"
    ))).toBe(true);
    expect(await store.verifyAdminAuditChain()).toEqual({
      valid: true,
      checkedEntries: generatedCaseCount,
      firstInvalidSequence: null,
    });

    expect(() => db.prepare("UPDATE admin_audit_log SET action = 'tampered' WHERE sequence = 1").run())
      .toThrow(/admin_audit_append_only/);
    expect(() => db.prepare("DELETE FROM admin_audit_log WHERE sequence = 1").run())
      .toThrow(/admin_audit_append_only/);
    expect(await store.verifyAdminAuditChain()).toMatchObject({ valid: true });
    db.close();
  });

  it("rolls back the domain mutation byte-for-byte when the audit append fails", async () => {
    const db = database();
    const store = new SQLiteAdminAuditStore(db);
    const before = db.prepare("SELECT lifecycle_state, company_name, plan_tier_id, is_demo FROM users WHERE id = 'account-1'").get();
    db.exec(`CREATE TRIGGER fail_admin_audit_insert
      BEFORE INSERT ON admin_audit_log
      BEGIN SELECT RAISE(ABORT, 'injected_audit_failure'); END`);

    await expect(store.withAdminAudit(actor, {
      action: "account_suspend",
      actionCategory: "account_lifecycle_change",
      targetKind: "account",
      targetId: "account-1",
    }, context, (transaction) => {
      if (transaction.engine !== "sqlite") throw new Error("Expected SQLite transaction");
      const transactionDb = transaction.db;
      transactionDb.prepare(`UPDATE users SET lifecycle_state = 'suspended', suspended_at = ?,
        company_name = 'Changed', plan_tier_id = 'paid', is_demo = 1 WHERE id = 'account-1'`)
        .run("2026-02-01T00:00:00.000Z");
      return { value: undefined, before: {}, after: {} };
    })).rejects.toBeInstanceOf(AdminAuditAppendError);

    expect(db.prepare("SELECT lifecycle_state, company_name, plan_tier_id, is_demo FROM users WHERE id = 'account-1'").get())
      .toEqual(before);
    expect(db.prepare("SELECT COUNT(*) AS count FROM admin_audit_log").get()).toEqual({ count: 0 });
    db.close();
  });
});
