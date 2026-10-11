import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { getAuthStore } from "@/features/auth/store";
import { getPostgresPool } from "@/features/persistence/postgres";
import { postgresDatabase, sqliteDatabase, type SqlDatabase } from "@/features/persistence/sql";
import { ensureAccountsSchema } from "./schema";

const state = globalThis as typeof globalThis & { codeproofAccountsDatabase?: Promise<SqlDatabase> };

async function open(): Promise<SqlDatabase> {
  // The accounts table and its remediation columns are created by the auth
  // store. Touch it first so the tables below can reference it.
  await getAuthStore().findById("accounts-schema-initialization");

  const pool = getPostgresPool();
  if (pool) {
    const database = postgresDatabase(pool);
    await ensureAccountsSchema(database.runner);
    return database;
  }

  const databasePath = process.env.CODEPROOF_DB_PATH ?? path.join(process.cwd(), ".data", "codeproof.db");
  if (databasePath !== ":memory:") mkdirSync(path.dirname(databasePath), { recursive: true });
  const db = new DatabaseSync(databasePath);
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");
  const database = sqliteDatabase(db);
  await ensureAccountsSchema(database.runner);
  return database;
}

/** The database behind sign-in codes, profiles and organisations. Opened once per process. */
export function getAccountsDatabase(): Promise<SqlDatabase> {
  state.codeproofAccountsDatabase ??= open().catch((error) => {
    // A failed start must not be remembered, or every later request would fail too.
    state.codeproofAccountsDatabase = undefined;
    throw error;
  });
  return state.codeproofAccountsDatabase;
}

/** Lets a test supply its own database. */
export function setAccountsDatabaseForTests(database: SqlDatabase | null): void {
  state.codeproofAccountsDatabase = database ? Promise.resolve(database) : undefined;
}
