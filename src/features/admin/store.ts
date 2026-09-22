import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { getPostgresPool } from "@/features/persistence/postgres";
import { ensureRemediationSchema } from "@/features/persistence/sqlite-migrations";
import { PostgreSQLAdminAuditStore, SQLiteAdminAuditStore, type AdminAuditPersistence } from "./audit";

let cached: AdminAuditPersistence | null = null;

export function getAdminAuditStore(): AdminAuditPersistence {
  if (cached) return cached;
  const pool = getPostgresPool();
  if (pool) {
    cached = new PostgreSQLAdminAuditStore(pool);
    return cached;
  }

  const databasePath = process.env.CODEPROOF_DB_PATH ?? path.join(process.cwd(), ".data", "codeproof.db");
  if (databasePath !== ":memory:") mkdirSync(path.dirname(databasePath), { recursive: true });
  const db = new DatabaseSync(databasePath);
  ensureRemediationSchema(db);
  cached = new SQLiteAdminAuditStore(db);
  return cached;
}
