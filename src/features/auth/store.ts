import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Pool } from "pg";
import { assertCanonicalAccountAuthority } from "@/features/admin/account-schema";
import { ensurePostgreSQLRemediationSchema } from "@/features/persistence/postgres-migrations";
import { getPostgresPool } from "@/features/persistence/postgres";
import { ensureRemediationSchema } from "@/features/persistence/sqlite-migrations";
import { logger } from "@/services/observability/logger";
import {
  type AccountLifecycleState,
  type AccountRole,
} from "@/types/remediation";

export const DEFAULT_PILOT_TIER_ID = "pilot-free";

export interface AuthUser {
  id: string;
  email: string;
  createdAt: string;
  role: AccountRole;
  lifecycleState: AccountLifecycleState;
  isDemo: boolean;
  demoLabel: string | null;
  companyName: string | null;
  planTierId: string;
  lastActivityAt: string | null;
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
  role: string;
  lifecycle_state: string;
  is_demo: number | boolean;
  demo_label: string | null;
  company_name: string | null;
  plan_tier_id: string | null;
  last_activity_at: string | null;
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
    this.db.exec("PRAGMA busy_timeout = 5000");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id            TEXT PRIMARY KEY,
        email         TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at    TEXT NOT NULL
      );
    `);
    ensureRemediationSchema(this.db, {
      initializeAccounts: true,
      adminEmail: process.env.ADMIN_EMAIL,
      onAdminBootstrapDiagnostic: (diagnostic) => logger.warn(diagnostic.event, {
        reason: diagnostic.reason,
        emailDigestPrefix: diagnostic.emailDigestPrefix,
      }),
    });
  }

  async findByEmail(email: string): Promise<AuthUserWithPassword | null> {
    const row = this.db.prepare("SELECT * FROM users WHERE email = ?").get(email.trim().toLowerCase()) as UserRow | undefined;
    return row ? mapUserWithPassword(row) : null;
  }

  async findById(id: string): Promise<AuthUser | null> {
    const row = this.db.prepare(`SELECT id, email, created_at, role, lifecycle_state, is_demo,
      demo_label, company_name, plan_tier_id, last_activity_at FROM users WHERE id = ?`).get(id) as UserRow | undefined;
    return row ? mapUser(row) : null;
  }

  async createUser(email: string, password: string): Promise<AuthUser> {
    const user = newAccount(randomUUID(), email, new Date().toISOString());
    this.db.prepare("INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)")
      .run(user.id, user.email, hashPassword(password), user.createdAt);
    return user;
  }
}

class PostgresAuthStore implements AuthPersistence {
  private initialized: Promise<void> | null = null;

  constructor(private readonly pool: Pool) {}

  private initialize(): Promise<void> {
    this.initialized ??= (async () => {
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS codeproof_users (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL
        )
      `);
      await ensurePostgreSQLRemediationSchema(this.pool, {
        initializeAccounts: true,
        adminEmail: process.env.ADMIN_EMAIL,
        onAdminBootstrapDiagnostic: (diagnostic) => logger.warn(diagnostic.event, {
          reason: diagnostic.reason,
          emailDigestPrefix: diagnostic.emailDigestPrefix,
        }),
      });
    })();
    return this.initialized;
  }

  async findByEmail(email: string): Promise<AuthUserWithPassword | null> {
    await this.initialize();
    const result = await this.pool.query<UserRow>(
      `SELECT id, email, password_hash, created_at::text, role, lifecycle_state, is_demo,
        demo_label, company_name, plan_tier_id, last_activity_at::text
       FROM codeproof_users WHERE email = $1`,
      [email.trim().toLowerCase()],
    );
    return result.rows[0] ? mapUserWithPassword(result.rows[0]) : null;
  }

  async findById(id: string): Promise<AuthUser | null> {
    await this.initialize();
    const result = await this.pool.query<UserRow>(
      `SELECT id, email, created_at::text, role, lifecycle_state, is_demo,
        demo_label, company_name, plan_tier_id, last_activity_at::text
       FROM codeproof_users WHERE id = $1`,
      [id],
    );
    return result.rows[0] ? mapUser(result.rows[0]) : null;
  }

  async createUser(email: string, password: string): Promise<AuthUser> {
    await this.initialize();
    const user = newAccount(randomUUID(), email, new Date().toISOString());
    await this.pool.query(
      "INSERT INTO codeproof_users (id, email, password_hash, created_at) VALUES ($1, $2, $3, $4)",
      [user.id, user.email, hashPassword(password), user.createdAt],
    );
    return user;
  }
}

function mapUser(row: UserRow): AuthUser {
  const authority = assertCanonicalAccountAuthority({
    role: row.role,
    lifecycleState: row.lifecycle_state,
  });
  return {
    id: row.id,
    email: row.email,
    createdAt: new Date(row.created_at).toISOString(),
    role: authority.role,
    lifecycleState: authority.lifecycleState,
    isDemo: Boolean(row.is_demo),
    demoLabel: row.demo_label,
    companyName: row.company_name,
    planTierId: row.plan_tier_id ?? DEFAULT_PILOT_TIER_ID,
    lastActivityAt: row.last_activity_at ? new Date(row.last_activity_at).toISOString() : null,
  };
}

function mapUserWithPassword(row: UserRow): AuthUserWithPassword {
  return { ...mapUser(row), passwordHash: row.password_hash };
}

function newAccount(id: string, email: string, createdAt: string): AuthUser {
  const authority = assertCanonicalAccountAuthority({ role: "RECRUITER", lifecycleState: "active" });
  return {
    id,
    email: email.trim().toLowerCase(),
    createdAt,
    role: authority.role,
    lifecycleState: authority.lifecycleState,
    isDemo: false,
    demoLabel: null,
    companyName: null,
    planTierId: DEFAULT_PILOT_TIER_ID,
    lastActivityAt: null,
  };
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
