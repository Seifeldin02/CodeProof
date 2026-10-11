import { randomUUID } from "node:crypto";
import { isoOrNull, type SqlRunner } from "@/features/persistence/sql";

/**
 * Sign-in providers linked to an account. A provider's own identifier for the
 * person is what is matched, because an address at the provider can change.
 */

export type IdentityProvider = "google";

export interface LinkedIdentity {
  userId: string;
  provider: IdentityProvider;
  /** The address the provider reported the last time it was used. */
  email: string;
  createdAt: string;
  lastUsedAt: string;
}

interface IdentityRow {
  user_id: string;
  provider: string;
  email: string;
  created_at: string;
  last_used_at: string;
}

const mapIdentity = (row: IdentityRow): LinkedIdentity => ({
  userId: row.user_id,
  provider: row.provider as IdentityProvider,
  email: row.email,
  createdAt: isoOrNull(row.created_at) ?? row.created_at,
  lastUsedAt: isoOrNull(row.last_used_at) ?? row.last_used_at,
});

export async function findIdentity(runner: SqlRunner, provider: IdentityProvider, subject: string): Promise<LinkedIdentity | null> {
  const row = await runner.get<IdentityRow>("SELECT * FROM {auth_identities} WHERE provider = ? AND subject = ?", [provider, subject]);
  return row ? mapIdentity(row) : null;
}

export async function listIdentities(runner: SqlRunner, userId: string): Promise<LinkedIdentity[]> {
  const rows = await runner.all<IdentityRow>("SELECT * FROM {auth_identities} WHERE user_id = ? ORDER BY created_at, provider", [userId]);
  return rows.map(mapIdentity);
}

/** Links the provider identity to the account, or records that it was used again. */
export async function linkIdentity(
  runner: SqlRunner,
  identity: { userId: string; provider: IdentityProvider; subject: string; email: string },
  now = new Date().toISOString(),
): Promise<void> {
  const updated = await runner.run(
    "UPDATE {auth_identities} SET email = ?, last_used_at = ? WHERE provider = ? AND subject = ? AND user_id = ?",
    [identity.email, now, identity.provider, identity.subject, identity.userId],
  );
  if (updated === 1) return;
  await runner.run(
    `INSERT INTO {auth_identities} (id, user_id, provider, subject, email, created_at, last_used_at)
     VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(provider, subject) DO NOTHING`,
    [randomUUID(), identity.userId, identity.provider, identity.subject, identity.email, now, now],
  );
}
