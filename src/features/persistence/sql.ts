import type { DatabaseSync } from "node:sqlite";
import type { Pool, PoolClient } from "pg";

/**
 * One way to write a query for both databases.
 *
 * SQLite backs local development and PostgreSQL backs production. They differ
 * in placeholder syntax and in table names: PostgreSQL tables carry the
 * `codeproof_` prefix. A query is written once with `?` placeholders and
 * `{table}` names, and the runner adapts it. Values are stored in types both
 * engines share: text, integers, and ISO-8601 timestamps as text.
 */

export type SqlValue = string | number | null;

export interface SqlRunner {
  readonly engine: "sqlite" | "postgresql";
  all<Row>(sql: string, params?: readonly SqlValue[]): Promise<Row[]>;
  get<Row>(sql: string, params?: readonly SqlValue[]): Promise<Row | undefined>;
  /** Runs a statement and returns how many rows it changed. */
  run(sql: string, params?: readonly SqlValue[]): Promise<number>;
  /** Runs schema statements. Takes no parameters and may hold several statements. */
  exec(sql: string): Promise<void>;
  /** A boolean literal for a column that is BOOLEAN in PostgreSQL and 0/1 in SQLite. */
  bool(value: boolean): string;
}

export interface SqlDatabase {
  /** Runs each statement on its own. */
  readonly runner: SqlRunner;
  /**
   * Runs the work in one transaction. Keep network calls out of it: SQLite
   * shares a single connection, so anything that waits on the outside world
   * would hold every other request's statements inside this transaction.
   */
  transaction<T>(work: (tx: SqlRunner) => Promise<T>): Promise<T>;
}

const POSTGRES_PREFIX = "codeproof_";

/** Rewrites `{table}` names and, for PostgreSQL, `?` placeholders. */
export function renderSql(sql: string, engine: SqlRunner["engine"]): string {
  const named = sql.replace(/\{([a-z_]+)\}/g, (_match, table: string) => (engine === "postgresql" ? `${POSTGRES_PREFIX}${table}` : table));
  if (engine === "sqlite") return named;
  let index = 0;
  return named.replace(/\?/g, () => `$${++index}`);
}

export function sqliteRunner(db: DatabaseSync): SqlRunner {
  return {
    engine: "sqlite",
    async all<Row>(sql: string, params: readonly SqlValue[] = []) {
      return db.prepare(renderSql(sql, "sqlite")).all(...params) as unknown as Row[];
    },
    async get<Row>(sql: string, params: readonly SqlValue[] = []) {
      return db.prepare(renderSql(sql, "sqlite")).get(...params) as Row | undefined;
    },
    async run(sql: string, params: readonly SqlValue[] = []) {
      return Number(db.prepare(renderSql(sql, "sqlite")).run(...params).changes);
    },
    async exec(sql: string) {
      db.exec(renderSql(sql, "sqlite"));
    },
    bool: (value) => (value ? "1" : "0"),
  };
}

type PostgresQueryable = Pick<Pool | PoolClient, "query">;

export function postgresRunner(client: PostgresQueryable): SqlRunner {
  return {
    engine: "postgresql",
    async all<Row>(sql: string, params: readonly SqlValue[] = []) {
      return (await client.query(renderSql(sql, "postgresql"), [...params])).rows as Row[];
    },
    async get<Row>(sql: string, params: readonly SqlValue[] = []) {
      return (await client.query(renderSql(sql, "postgresql"), [...params])).rows[0] as Row | undefined;
    },
    async run(sql: string, params: readonly SqlValue[] = []) {
      return (await client.query(renderSql(sql, "postgresql"), [...params])).rowCount ?? 0;
    },
    async exec(sql: string) {
      await client.query(renderSql(sql, "postgresql"));
    },
    bool: (value) => (value ? "TRUE" : "FALSE"),
  };
}

export function sqliteDatabase(db: DatabaseSync): SqlDatabase {
  const runner = sqliteRunner(db);
  // One connection, so transactions run one after another.
  let queue: Promise<unknown> = Promise.resolve();
  return {
    runner,
    transaction<T>(work: (tx: SqlRunner) => Promise<T>): Promise<T> {
      const next = queue.then(async () => {
        db.exec("BEGIN IMMEDIATE");
        try {
          const value = await work(runner);
          db.exec("COMMIT");
          return value;
        } catch (error) {
          try { db.exec("ROLLBACK"); } catch { /* Keep the original failure. */ }
          throw error;
        }
      });
      queue = next.catch(() => undefined);
      return next;
    },
  };
}

export function postgresDatabase(pool: Pool): SqlDatabase {
  return {
    runner: postgresRunner(pool),
    async transaction<T>(work: (tx: SqlRunner) => Promise<T>): Promise<T> {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const value = await work(postgresRunner(client));
        await client.query("COMMIT");
        return value;
      } catch (error) {
        try { await client.query("ROLLBACK"); } catch { /* Keep the original failure. */ }
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

/** Timestamps arrive as text from SQLite and as text or `Date` from PostgreSQL. */
export function isoOrNull(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** `COUNT(*)` is a number in SQLite and may be a string in PostgreSQL. */
export function toCount(value: unknown): number {
  const count = Number(value ?? 0);
  return Number.isFinite(count) ? count : 0;
}
