import type { Pool } from "pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminActor } from "@/types/remediation";
import { PostgreSQLAdminAuditStore, type AdminAuditRequestContext } from "./audit";

/**
 * The audit log read back the way the PostgreSQL driver hands it over: a
 * timestamp as a `Date`, a JSON column already parsed, and a big integer as
 * text. An entry's hash covers its timestamp to the millisecond, so reading it
 * back must not lose any of it.
 */

const COLUMNS = [
  "id", "sequence", "occurred_at", "actor_user_id", "actor_role", "impersonated_user_id", "action", "action_category",
  "target_kind", "target_id", "outcome", "denial_reason", "parameters_json", "before_json", "after_json",
  "request_correlation_id", "request_method", "route", "ip_fingerprint", "user_agent_family", "previous_entry_hash", "entry_hash",
] as const;

function asDriverReturns(column: string, value: unknown): unknown {
  if (column === "occurred_at") return new Date(String(value));
  if (column === "sequence") return String(value);
  if (column.endsWith("_json")) return value === null ? null : JSON.parse(String(value));
  return value;
}

class DriverLikePool {
  readonly rows: Array<Record<string, unknown>> = [];

  async connect() {
    return { query: (sql: string, values?: readonly unknown[]) => this.query(sql, values), release() {} };
  }

  async query(sql: string, values: readonly unknown[] = []): Promise<{ rows: Array<Record<string, unknown>>; rowCount: number }> {
    const text = sql.replace(/\s+/gu, " ").trim();
    if (text.startsWith("INSERT INTO codeproof_admin_audit_log")) {
      this.rows.push(Object.fromEntries(COLUMNS.map((column, index) => [column, asDriverReturns(column, values[index])])));
      return { rows: [], rowCount: 1 };
    }
    if (text.startsWith("SELECT sequence")) {
      const head = this.rows.at(-1);
      return { rows: head ? [head] : [], rowCount: head ? 1 : 0 };
    }
    if (text.startsWith("SELECT * FROM codeproof_admin_audit_log")) return { rows: this.rows, rowCount: this.rows.length };
    return { rows: [], rowCount: 0 };
  }
}

const actor: AdminActor = { userId: "admin-1", email: "admin@example.test", role: "ADMIN", lifecycleState: "active" };
const context: AdminAuditRequestContext = { requestCorrelationId: "request-1", requestMethod: "POST", route: "/api/admin/accounts/account-1", ipFingerprint: "c".repeat(64), userAgentFamily: "test-client" };

describe("the audit log as the PostgreSQL driver returns it", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("verifies its chain and keeps each entry's time to the millisecond", async () => {
    const pool = new DriverLikePool();
    const store = new PostgreSQLAdminAuditStore(pool as unknown as Pool);
    const times = ["2026-10-12T09:00:00.123Z", "2026-10-12T09:00:01.999Z", "2026-10-12T09:00:02.000Z"];
    for (const [index, time] of times.entries()) {
      vi.setSystemTime(new Date(time));
      await store.withAdminAudit(actor, {
        action: "account_suspended",
        actionCategory: "account_lifecycle",
        targetKind: "account",
        targetId: `account-${index}`,
        parameters: { action: "suspend" },
      }, context, () => ({ value: undefined, before: { lifecycleState: "active" }, after: { lifecycleState: "suspended" } }));
    }

    expect((await store.list()).map((entry) => entry.occurredAt)).toEqual(times);
    expect(await store.verifyAdminAuditChain()).toEqual({ valid: true, checkedEntries: 3, firstInvalidSequence: null });
  });
});
