import type { AdminAuditTransaction, AdminMutationResult } from "./audit";

type ManagedState = "active" | "suspended";
interface LifecycleRow { id: string; role: string; lifecycle_state: string }

export class AccountLifecycleError extends Error {
  constructor(readonly code: "ACCOUNT_NOT_FOUND" | "ACCOUNT_NOT_MANAGEABLE" | "ACCOUNT_UNCHANGED") {
    super(code);
  }
}

/** Runs inside the same transaction as the append-only admin audit entry. */
export async function changeAccountLifecycle(
  transaction: AdminAuditTransaction,
  actorId: string,
  targetId: string,
  state: ManagedState,
): Promise<AdminMutationResult<{ id: string; lifecycleState: ManagedState }>> {
  const row = transaction.engine === "sqlite"
    ? transaction.db.prepare("SELECT id, role, lifecycle_state FROM users WHERE id = ?").get(targetId) as LifecycleRow | undefined
    : (await transaction.client.query<LifecycleRow>(
      "SELECT id, role, lifecycle_state FROM codeproof_users WHERE id = $1 FOR UPDATE", [targetId],
    )).rows[0];
  if (!row) throw new AccountLifecycleError("ACCOUNT_NOT_FOUND");
  if (targetId === actorId || row.role !== "RECRUITER" || row.lifecycle_state === "soft_deleted") {
    throw new AccountLifecycleError("ACCOUNT_NOT_MANAGEABLE");
  }
  if (row.lifecycle_state === state) throw new AccountLifecycleError("ACCOUNT_UNCHANGED");
  const changedAt = new Date().toISOString();
  if (transaction.engine === "sqlite") {
    transaction.db.prepare(`UPDATE users SET lifecycle_state = ?, suspended_at = ? WHERE id = ?`)
      .run(state, state === "suspended" ? changedAt : null, targetId);
  } else {
    await transaction.client.query(`UPDATE codeproof_users SET lifecycle_state = $1, suspended_at = $2 WHERE id = $3`,
      [state, state === "suspended" ? changedAt : null, targetId]);
  }
  return {
    value: { id: targetId, lifecycleState: state },
    before: { lifecycleState: row.lifecycle_state },
    after: { lifecycleState: state },
  };
}
