import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Pool } from "pg";
import { getPostgresPool } from "@/features/persistence/postgres";

export interface AuthUser {
  id: string;
  email: string;
  createdAt: string;
}

export interface AuthUserWithPassword extends AuthUser {
  passwordHash: string;
}

export interface AuthPersistence {
  findByEmail(email: string): Promise<AuthUserWithPassword | null>;
  findById(id: string): Promise<AuthUser | null>;
  createUser(email: string, password: string): Promise<AuthUser>;
}

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  created_at: string;
}

const SCRYPT_KEY_LENGTH = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$${salt}$${scryptSync(password, salt, SCRYPT_KEY_LENGTH).toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, expected] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !expected) return false;
  const derived = scryptSync(password, salt, SCRYPT_KEY_LENGTH);
  const expectedBytes = Buffer.from(expected, "hex");
  if (expectedBytes.length !== derived.length) return false;
  return timingSafeEqual(derived, expectedBytes);
}

/** SQLite persistence for zero-configuration local development and tests. */
export class AuthStore implements AuthPersistence {
  readonly db: DatabaseSync;

  constructor(databasePath = process.env.CODEPROOF_DB_PATH ?? path.join(process.cwd(), ".data", "codeproof.db")) {
    if (databasePath !== ":memory:") mkdirSync(path.dirname(databasePath), { recursive: true });
    this.db = new DatabaseSync(databasePath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id            TEXT PRIMARY KEY,
        email         TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at    TEXT NOT NULL
      );
    `);
  }

  async findByEmail(email: string): Promise<AuthUserWithPassword | null> {
    const row = this.db.prepare("SELECT * FROM users WHERE email = ?").get(email.trim().toLowerCase()) as UserRow | undefined;
    return row ? mapUserWithPassword(row) : null;
  }

  async findById(id: string): Promise<AuthUser | null> {
    const row = this.db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
    return row ? mapUser(row) : null;
  }

  async createUser(email: string, password: string): Promise<AuthUser> {
    const user: AuthUser = { id: randomUUID(), email: email.trim().toLowerCase(), createdAt: new Date().toISOString() };
    this.db.prepare("INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)")
      .run(user.id, user.email, hashPassword(password), user.createdAt);
    return user;
  }
}

class PostgresAuthStore implements AuthPersistence {
  private initialized: Promise<void> | null = null;

  constructor(private readonly pool: Pool) {}

  private initialize(): Promise<void> {
    this.initialized ??= this.pool.query(`
      CREATE TABLE IF NOT EXISTS codeproof_users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL
      )
    `).then(() => undefined);
    return this.initialized;
  }

  async findByEmail(email: string): Promise<AuthUserWithPassword | null> {
    await this.initialize();
    const result = await this.pool.query<UserRow>(
      "SELECT id, email, password_hash, created_at::text FROM codeproof_users WHERE email = $1",
      [email.trim().toLowerCase()],
    );
    return result.rows[0] ? mapUserWithPassword(result.rows[0]) : null;
  }

  async findById(id: string): Promise<AuthUser | null> {
    await this.initialize();
    const result = await this.pool.query<UserRow>(
      "SELECT id, email, password_hash, created_at::text FROM codeproof_users WHERE id = $1",
      [id],
    );
    return result.rows[0] ? mapUser(result.rows[0]) : null;
  }

  async createUser(email: string, password: string): Promise<AuthUser> {
    await this.initialize();
    const user: AuthUser = { id: randomUUID(), email: email.trim().toLowerCase(), createdAt: new Date().toISOString() };
    await this.pool.query(
      "INSERT INTO codeproof_users (id, email, password_hash, created_at) VALUES ($1, $2, $3, $4)",
      [user.id, user.email, hashPassword(password), user.createdAt],
    );
    return user;
  }
}

function mapUser(row: UserRow): AuthUser {
  return { id: row.id, email: row.email, createdAt: new Date(row.created_at).toISOString() };
}

function mapUserWithPassword(row: UserRow): AuthUserWithPassword {
  return { ...mapUser(row), passwordHash: row.password_hash };
}

let cached: AuthPersistence | null = null;

export function getAuthStore(): AuthPersistence {
  if (cached) return cached;
  const pool = getPostgresPool();
  cached = pool ? new PostgresAuthStore(pool) : new AuthStore();
  return cached;
}

/** Public CodeProof accounts are open by default; operators can explicitly close registration. */
export function signupAllowed(): boolean {
  return process.env.CODEPROOF_ALLOW_SIGNUP?.trim().toLowerCase() !== "false";
}
