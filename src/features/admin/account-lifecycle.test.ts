import { describe, expect, it } from "vitest";
import { CandidateStore } from "@/features/candidates/store";
import { SQLiteAdminAuditStore } from "./audit";
import { AccountLifecycleError, changeAccountLifecycle } from "./account-lifecycle";

describe("audited owner account controls", () => {
  it("suspends and reactivates a recruiter, but never modifies an owner", async () => {
    const db = new CandidateStore(":memory:").db;
    try {
      const insert = db.prepare("INSERT INTO users (id, email, password_hash, created_at, role) VALUES (?, ?, 'hash', '2026-01-01T00:00:00.000Z', ?)");
      insert.run("owner", "owner@example.test", "ADMIN");
      insert.run("recruiter", "recruiter@example.test", "RECRUITER");
      const audit = new SQLiteAdminAuditStore(db);
      const actor = { userId: "owner", email: "owner@example.test", role: "ADMIN" as const, lifecycleState: "active" as const };
      const context = {
        requestCorrelationId: "test", requestMethod: "PATCH", route: "/api/admin/accounts/recruiter/lifecycle",
        ipFingerprint: "0".repeat(64), userAgentFamily: "vitest",
      };
      const change = (id: string, state: "active" | "suspended") => audit.withAdminAudit(actor, {
        action: state === "suspended" ? "account_suspend" : "account_reactivate",
        actionCategory: "account_lifecycle_change", targetKind: "account", targetId: id,
      }, context, (transaction) => changeAccountLifecycle(transaction, actor.userId, id, state));

      await expect(change("recruiter", "suspended")).resolves.toEqual({ id: "recruiter", lifecycleState: "suspended" });
      expect(db.prepare("SELECT lifecycle_state FROM users WHERE id = 'recruiter'").get()).toEqual({ lifecycle_state: "suspended" });
      await expect(change("recruiter", "active")).resolves.toEqual({ id: "recruiter", lifecycleState: "active" });
      await expect(change("owner", "suspended")).rejects.toMatchObject({ code: "ACCOUNT_NOT_MANAGEABLE" });
      expect(db.prepare("SELECT lifecycle_state FROM users WHERE id = 'owner'").get()).toEqual({ lifecycle_state: "active" });
      expect((await audit.list()).map((entry) => entry.action)).toEqual(["account_suspend", "account_reactivate"]);
      expect((await audit.verifyAdminAuditChain()).valid).toBe(true);
      await expect(change("missing", "suspended")).rejects.toBeInstanceOf(AccountLifecycleError);
    } finally {
      db.close();
    }
  });
});
