import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

/**
 * Recruiter accounts for CodeProof.
 *
 * Passwords are hashed with scrypt from `node:crypto`, so authentication adds
 * no dependency and no paid service, keeping the zero-paid-API contract intact.
 */

export interface AuthUser {
  id: string;
  email: string;
  createdAt: string;
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

export class AuthStore {
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
      CREATE TABLE IF NOT EXISTS auth_settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }

  userCount(): number {
    return (this.db.prepare("SELECT COUNT(*) AS total FROM users").get() as { total: number }).total;
  }

  findByEmail(email: string): (AuthUser & { passwordHash: string }) | null {
    const row = this.db.prepare("SELECT * FROM users WHERE email = ?").get(email.trim().toLowerCase()) as UserRow | undefined;
    if (!row) return null;
    return { id: row.id, email: row.email, createdAt: row.created_at, passwordHash: row.password_hash };
  }

  findById(id: string): AuthUser | null {
    const row = this.db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
    return row ? { id: row.id, email: row.email, createdAt: row.created_at } : null;
  }

  createUser(email: string, password: string): AuthUser {
    const user: AuthUser = {
      id: randomUUID(),
      email: email.trim().toLowerCase(),
      createdAt: new Date().toISOString(),
    };
    this.db
      .prepare("INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)")
      .run(user.id, user.email, hashPassword(password), user.createdAt);
    return user;
  }

  /**
   * Session signing key. `CODEPROOF_SESSION_SECRET` wins so multi-instance
   * deployments share one key; otherwise a per-install random value is
   * persisted, which keeps local development zero-configuration.
   */
  sessionSecret(): string {
    const fromEnvironment = process.env.CODEPROOF_SESSION_SECRET?.trim();
    if (fromEnvironment) return fromEnvironment;

    const row = this.db.prepare("SELECT value FROM auth_settings WHERE key = 'session_secret'").get() as
      | { value: string }
      | undefined;
    if (row) return row.value;

    const generated = randomBytes(32).toString("hex");
    this.db.prepare("INSERT INTO auth_settings (key, value) VALUES ('session_secret', ?)").run(generated);
    return generated;
  }
}

let cached: AuthStore | null = null;

export function getAuthStore(): AuthStore {
  cached ??= new AuthStore();
  return cached;
}

/**
 * Registration is open only until the first account claims the workspace, so a
 * fresh public deployment cannot be taken over by a stranger. Set
 * `CODEPROOF_ALLOW_SIGNUP=true` to keep it open for teammates.
 */
export function signupAllowed(store = getAuthStore()): boolean {
  if (process.env.CODEPROOF_ALLOW_SIGNUP?.trim().toLowerCase() === "true") return true;
  return store.userCount() === 0;
}
