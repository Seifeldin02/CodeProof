import { AuthStore } from "@/features/auth/store";
import { sqliteDatabase, type SqlDatabase } from "@/features/persistence/sql";
import { ensureAccountsSchema } from "./schema";

/**
 * An in-memory database with the accounts table, its remediation columns and
 * the tables in `schema.ts`, all on one connection. For tests only.
 */
export async function openTestAccounts(): Promise<{ auth: AuthStore; database: SqlDatabase; close: () => void }> {
  const auth = new AuthStore(":memory:");
  const database = sqliteDatabase(auth.db);
  await ensureAccountsSchema(database.runner);
  return { auth, database, close: () => auth.db.close() };
}
