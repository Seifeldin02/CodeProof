import type { Pool, PoolClient } from "pg";
import { describe, expect, it } from "vitest";
import {
  AdminAuditAppendError,
  PostgreSQLAdminAuditStore,
  type AdminAuditRequestContext,
} from "./audit";
import type { AdminActor } from "@/types/remediation";

interface AuditRow extends Record<string, unknown> {
  sequence: number;
  entry_hash: string;
}

class FakeAuditPool {
  readonly entries: AuditRow[] = [];
  accountState = "active";
  failInsert = false;

  async connect(): Promise<PoolClient> {
    return new FakeAuditClient(this) as unknown as PoolClient;
  }

  async query(sql: string, values: readonly unknown[] = []): Promise<{ rows: Record<string, unknown>[]; rowCount: number }> {
    return new FakeAuditClient(this).query(sql, values);
  }
}

class FakeAuditClient {
  private inTransaction = false;
  private stagedEntries: AuditRow[] = [];
  private stagedAccountState: string | null = null;

  constructor(private readonly pool: FakeAuditPool) {}

  async query(sql: string, values: readonly unknown[] = []): Promise<{ rows: Record<string, unknown>[]; rowCount: number }> {
    const normalized = sql.replace(/\s+/gu, " ").trim();
    if (normalized === "BEGIN") {
      this.inTransaction = true;
      this.stagedAccountState = this.pool.accountState;
      return { rows: [], rowCount: 0 };
    }
    if (normalized === "COMMIT") {
      this.pool.entries.push(...this.stagedEntries);
      if (this.stagedAccountState !== null) this.pool.accountState = this.stagedAccountState;
      this.clear();
      return { rows: [], rowCount: 0 };
    }
    if (normalized === "ROLLBACK") {
      this.clear();
      return { rows: [], rowCount: 0 };
    }
    if (normalized.startsWith("SELECT pg_advisory_xact_lock")) return { rows: [], rowCount: 1 };
    if (/^(UPDATE|DELETE FROM|TRUNCATE) codeproof_admin_audit_log/iu.test(normalized)) {
      throw new Error("admin_audit_append_only");
    }
    if (normalized.startsWith("SELECT sequence, entry_hash FROM codeproof_admin_audit_log")) {
      const head = [...this.pool.entries, ...this.stagedEntries].at(-1);
      return { rows: head ? [head] : [], rowCount: head ? 1 : 0 };
    }
    if (normalized.startsWith("SELECT sequence FROM codeproof_admin_audit_log")) {
      const head = [...this.pool.entries, ...this.stagedEntries].at(-1);
      return { rows: head ? [head] : [], rowCount: head ? 1 : 0 };
    }
    if (normalized.startsWith("SELECT entry_hash FROM codeproof_admin_audit_log")) {
      const before = Number(values[0]);
      const head = this.pool.entries.filter((entry) => entry.sequence < before).at(-1);
      return { rows: head ? [head] : [], rowCount: head ? 1 : 0 };
    }
    if (normalized.startsWith("SELECT * FROM codeproof_admin_audit_log")) {
      const from = Number(values[0]);
      const to = Number(values[1]);
      const rows = this.pool.entries.filter((entry) => entry.sequence >= from && entry.sequence <= to);
      return { rows, rowCount: rows.length };
    }
    if (normalized.startsWith("INSERT INTO codeproof_admin_audit_log")) {
      if (this.pool.failInsert) throw new Error("injected_audit_failure");
      const row: AuditRow = {
        id: values[0],
        sequence: Number(values[1]),
        occurred_at: values[2],
        actor_user_id: values[3],
        actor_role: values[4],
        impersonated_user_id: values[5],
        action: values[6],
        action_category: values[7],
        target_kind: values[8],
        target_id: values[9],
        outcome: values[10],
        denial_reason: values[11],
        parameters_json: JSON.parse(String(values[12])),
        before_json: values[13] === null ? null : JSON.parse(String(values[13])),
        after_json: values[14] === null ? null : JSON.parse(String(values[14])),
        request_correlation_id: values[15],
        request_method: values[16],
        route: values[17],
        ip_fingerprint: values[18],
        user_agent_family: values[19],
        previous_entry_hash: values[20],
        entry_hash: String(values[21]),
      };
      this.stagedEntries.push(row);
      return { rows: [], rowCount: 1 };
    }
    if (normalized === "SELECT lifecycle_state FROM fake_account") {
      const state = this.stagedAccountState ?? this.pool.accountState;
      return { rows: [{ lifecycle_state: state }], rowCount: 1 };
    }
    if (normalized.startsWith("UPDATE fake_account SET lifecycle_state")) {
      this.stagedAccountState = String(values[0]);
      return { rows: [], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  release(): void {
    if (this.inTransaction) this.clear();
  }

  private clear(): void {
    this.inTransaction = false;
    this.stagedEntries = [];
    this.stagedAccountState = null;
  }
}

function asPool(fake: FakeAuditPool): Pool {
  return fake as unknown as Pool;
}

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
  ipFingerprint: "b".repeat(64),
  userAgentFamily: "test-client",
};

describe("PostgreSQL administrative audit contract", () => {
  it("chains 128 generated transactional mutations and denies destructive audit operations", async () => {
    const fake = new FakeAuditPool();
    const store = new PostgreSQLAdminAuditStore(asPool(fake));

    for (let index = 0; index < 128; index += 1) {
      const nextState = index % 2 === 0 ? "suspended" : "active";
      await store.withAdminAudit(actor, {
        action: "account_lifecycle_change",
        actionCategory: "account_lifecycle_change",
        targetKind: "account",
        targetId: "account-1",
        parameters: { nextState, sessionToken: `secret-${index}` },
      }, { ...context, requestCorrelationId: `request-${index}` }, async (transaction) => {
        if (transaction.engine !== "postgresql") throw new Error("Expected PostgreSQL transaction");
        const beforeResult = await transaction.client.query("SELECT lifecycle_state FROM fake_account");
        await transaction.client.query("UPDATE fake_account SET lifecycle_state = $1", [nextState]);
        const afterResult = await transaction.client.query("SELECT lifecycle_state FROM fake_account");
        return {
          value: undefined,
          before: beforeResult.rows[0] as Record<string, unknown>,
          after: afterResult.rows[0] as Record<string, unknown>,
        };
      });
    }

    expect(fake.entries).toHaveLength(128);
    expect(await store.verifyAdminAuditChain()).toEqual({ valid: true, checkedEntries: 128, firstInvalidSequence: null });
    expect((await store.list()).every((entry) => entry.parameters.sessionToken === "[redacted]")).toBe(true);
    await expect(fake.query("UPDATE codeproof_admin_audit_log SET action = 'tampered'")).rejects.toThrow(/append_only/);
    await expect(fake.query("DELETE FROM codeproof_admin_audit_log")).rejects.toThrow(/append_only/);
    await expect(fake.query("TRUNCATE codeproof_admin_audit_log")).rejects.toThrow(/append_only/);
  });

  it("rolls back the domain mutation when PostgreSQL audit insertion fails", async () => {
    const fake = new FakeAuditPool();
    fake.failInsert = true;
    const store = new PostgreSQLAdminAuditStore(asPool(fake));

    await expect(store.withAdminAudit(actor, {
      action: "account_suspend",
      actionCategory: "account_lifecycle_change",
      targetKind: "account",
      targetId: "account-1",
    }, context, async (transaction) => {
      if (transaction.engine !== "postgresql") throw new Error("Expected PostgreSQL transaction");
      await transaction.client.query("UPDATE fake_account SET lifecycle_state = $1", ["suspended"]);
      return { value: undefined, before: { lifecycleState: "active" }, after: { lifecycleState: "suspended" } };
    })).rejects.toBeInstanceOf(AdminAuditAppendError);

    expect(fake.accountState).toBe("active");
    expect(fake.entries).toEqual([]);
  });
});
