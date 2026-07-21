import { Pool } from "pg";

const globalDatabase = globalThis as typeof globalThis & {
  codeproofPostgresPool?: Pool;
};

/**
 * One small shared pool for serverless and long-running Node runtimes.
 * Local development intentionally stays on SQLite when DATABASE_URL is absent.
 */
export function getPostgresPool(): Pool | null {
  const connectionString = process.env.DATABASE_URL?.trim() || process.env.POSTGRES_URL?.trim();
  if (!connectionString) return null;

  globalDatabase.codeproofPostgresPool ??= new Pool({
    connectionString,
    max: 3,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
  });
  return globalDatabase.codeproofPostgresPool;
}
