import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { Pool, PoolClient } from "pg";
import {
  AdminAuditEntrySchema,
  type AdminActor,
  type AdminAuditEntry,
} from "@/types/remediation";

const GENESIS_HASH = "0".repeat(64);
const POSTGRES_AUDIT_LOCK_KEY = 1_128_348_674;
const HIGH_ENTROPY_LENGTH = 40;
const DENIED_KEYS = new Set([
  "password",
  "newpassword",
  "passwordhash",
  "hash",
  "token",
  "sharetoken",
  "tokendigest",
  "passcode",
  "passcodedigest",
  "secret",
  "resettoken",
  "verificationcode",
  "apikey",
  "authorization",
  "cookie",
  "sessiontoken",
]);

type JsonObject = Record<string, unknown>;

export interface AdminAuditRequestContext {
  readonly requestCorrelationId: string;
  readonly requestMethod: string;
  readonly route: string;
  readonly ipFingerprint: string;
  readonly userAgentFamily: string | null;
}

export interface AdminAuditDescriptor {
  readonly action: string;
  readonly actionCategory: string;
  readonly targetKind: AdminAuditEntry["targetKind"];
  readonly targetId: string | null;
  readonly parameters?: JsonObject;
  readonly impersonatedUserId?: string | null;
}

export type AdminAuditTransaction =
  | { readonly engine: "sqlite"; readonly db: DatabaseSync }
  | { readonly engine: "postgresql"; readonly client: PoolClient };

export interface AdminMutationResult<T> {
  readonly value: T;
  readonly before: JsonObject | null;
  readonly after: JsonObject | null;
}

export interface AdminAuditPersistence {
  withAdminAudit<T>(
    actor: AdminActor,
    descriptor: AdminAuditDescriptor,
    context: AdminAuditRequestContext,
    mutate: (transaction: AdminAuditTransaction) => Promise<AdminMutationResult<T>> | AdminMutationResult<T>,
  ): Promise<T>;
  appendDeniedAttempt(
    actor: AdminActor,
    descriptor: AdminAuditDescriptor,
    context: AdminAuditRequestContext,
    denialReason: string,
  ): Promise<AdminAuditEntry>;
  list(fromSequence?: number, toSequence?: number): Promise<readonly AdminAuditEntry[]>;
  verifyAdminAuditChain(fromSequence?: number, toSequence?: number): Promise<AdminAuditChainVerification>;
}

export interface AdminAuditChainVerification {
  readonly valid: boolean;
  readonly checkedEntries: number;
  readonly firstInvalidSequence: number | null;
}

export class AdminAuditAppendError extends Error {
  readonly code = "ADMIN_AUDIT_APPEND_FAILED";

  constructor(options?: ErrorOptions) {
    super("The administrative action could not be recorded and was rolled back.", options);
    this.name = "AdminAuditAppendError";
  }
}

function normalizedKey(key: string): string {
  return key.replace(/[^a-z0-9]/giu, "").toLowerCase();
}

function looksSecret(value: string): boolean {
  if (/^scrypt\$/u.test(value)) return true;
  if (/^bearer\s+\S+/iu.test(value)) return true;
  if (/^[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$/u.test(value)) return true;
  if (value.length < HIGH_ENTROPY_LENGTH || /\s/u.test(value)) return false;
  const classes = [/[a-z]/u, /[A-Z]/u, /\d/u, /[^A-Za-z0-9]/u]
    .filter((pattern) => pattern.test(value)).length;
  return classes >= 3;
}

/** Redacts nested administrative values before storage, hashing, response, or export. */
export function redactAdministrativeValue(value: unknown, key = ""): unknown {
  if (DENIED_KEYS.has(normalizedKey(key))) return "[redacted]";
  if (value === undefined) return null;
  if (typeof value === "string") return looksSecret(value) ? "[redacted]" : value;
  if (Array.isArray(value)) return value.map((item) => redactAdministrativeValue(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([nestedKey, nestedValue]) => (
      [nestedKey, redactAdministrativeValue(nestedValue, nestedKey)]
    )));
  }
  return value;
}

export function canonicalAdministrativeJson(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalAdministrativeJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => (
    `${JSON.stringify(key)}:${canonicalAdministrativeJson(record[key])}`
  )).join(",")}}`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function entryHash(entry: Omit<AdminAuditEntry, "entryHash">): string {
  return sha256(canonicalAdministrativeJson(entry));
}

function createEntry(input: {
  sequence: number;
  previousEntryHash: string;
  actor: AdminActor;
  descriptor: AdminAuditDescriptor;
  context: AdminAuditRequestContext;
  outcome: AdminAuditEntry["outcome"];
  denialReason: string | null;
  before: JsonObject | null;
  after: JsonObject | null;
}): AdminAuditEntry {
  const withoutHash: Omit<AdminAuditEntry, "entryHash"> = {
    id: randomUUID(),
    sequence: input.sequence,
    occurredAt: new Date().toISOString(),
    actorUserId: input.actor.userId,
    actorRole: input.actor.role,
    impersonatedUserId: input.descriptor.impersonatedUserId ?? null,
    action: input.descriptor.action,
    actionCategory: input.descriptor.actionCategory,
    targetKind: input.descriptor.targetKind,
    targetId: input.descriptor.targetId,
    outcome: input.outcome,
    denialReason: input.denialReason,
    parameters: redactAdministrativeValue(input.descriptor.parameters ?? {}) as JsonObject,
    before: input.before === null ? null : redactAdministrativeValue(input.before) as JsonObject,
    after: input.after === null ? null : redactAdministrativeValue(input.after) as JsonObject,
    requestCorrelationId: input.context.requestCorrelationId,
    requestMethod: input.context.requestMethod,
    route: input.context.route,
    ipFingerprint: input.context.ipFingerprint,
    userAgentFamily: input.context.userAgentFamily,
    previousEntryHash: input.previousEntryHash,
  };
  return AdminAuditEntrySchema.parse({ ...withoutHash, entryHash: entryHash(withoutHash) });
}

function sqliteRow(row: Record<string, unknown>): AdminAuditEntry {
  return AdminAuditEntrySchema.parse({
    id: row.id,
    sequence: Number(row.sequence),
    occurredAt: row.occurred_at,
    actorUserId: row.actor_user_id,
    actorRole: row.actor_role,
    impersonatedUserId: row.impersonated_user_id,
    action: row.action,
    actionCategory: row.action_category,
    targetKind: row.target_kind,
    targetId: row.target_id,
    outcome: row.outcome,
    denialReason: row.denial_reason,
    parameters: JSON.parse(String(row.parameters_json)),
    before: row.before_json === null ? null : JSON.parse(String(row.before_json)),
    after: row.after_json === null ? null : JSON.parse(String(row.after_json)),
    requestCorrelationId: row.request_correlation_id,
    requestMethod: row.request_method,
    route: row.route,
    ipFingerprint: row.ip_fingerprint,
    userAgentFamily: row.user_agent_family,
    previousEntryHash: row.previous_entry_hash,
    entryHash: row.entry_hash,
  });
}

function postgresRow(row: Record<string, unknown>): AdminAuditEntry {
  return AdminAuditEntrySchema.parse({
    id: row.id,
    sequence: Number(row.sequence),
    occurredAt: new Date(String(row.occurred_at)).toISOString(),
    actorUserId: row.actor_user_id,
    actorRole: row.actor_role,
    impersonatedUserId: row.impersonated_user_id,
    action: row.action,
    actionCategory: row.action_category,
    targetKind: row.target_kind,
    targetId: row.target_id,
    outcome: row.outcome,
    denialReason: row.denial_reason,
    parameters: row.parameters_json,
    before: row.before_json,
    after: row.after_json,
    requestCorrelationId: row.request_correlation_id,
    requestMethod: row.request_method,
    route: row.route,
    ipFingerprint: row.ip_fingerprint,
    userAgentFamily: row.user_agent_family,
    previousEntryHash: row.previous_entry_hash,
    entryHash: row.entry_hash,
  });
}

function verifyEntries(entries: readonly AdminAuditEntry[], expectedPreviousHash: string): AdminAuditChainVerification {
  let previousHash = expectedPreviousHash;
  for (const entry of entries) {
    const { entryHash: persistedHash, ...withoutHash } = entry;
    const valid = entry.previousEntryHash === previousHash && entryHash(withoutHash) === persistedHash;
    if (!valid) return { valid: false, checkedEntries: entries.indexOf(entry) + 1, firstInvalidSequence: entry.sequence };
    previousHash = persistedHash;
  }
  return { valid: true, checkedEntries: entries.length, firstInvalidSequence: null };
}

function insertSqlite(db: DatabaseSync, entry: AdminAuditEntry): void {
  db.prepare(`INSERT INTO admin_audit_log
    (id, sequence, occurred_at, actor_user_id, actor_role, impersonated_user_id, action,
     action_category, target_kind, target_id, outcome, denial_reason, parameters_json,
     before_json, after_json, request_correlation_id, request_method, route, ip_fingerprint,
     user_agent_family, previous_entry_hash, entry_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      entry.id, entry.sequence, entry.occurredAt, entry.actorUserId, entry.actorRole,
      entry.impersonatedUserId, entry.action, entry.actionCategory, entry.targetKind,
      entry.targetId, entry.outcome, entry.denialReason, JSON.stringify(entry.parameters),
      entry.before === null ? null : JSON.stringify(entry.before),
      entry.after === null ? null : JSON.stringify(entry.after), entry.requestCorrelationId,
      entry.requestMethod, entry.route, entry.ipFingerprint, entry.userAgentFamily,
      entry.previousEntryHash, entry.entryHash,
    );
}

async function insertPostgres(client: PoolClient, entry: AdminAuditEntry): Promise<void> {
  await client.query(`INSERT INTO codeproof_admin_audit_log
    (id, sequence, occurred_at, actor_user_id, actor_role, impersonated_user_id, action,
     action_category, target_kind, target_id, outcome, denial_reason, parameters_json,
     before_json, after_json, request_correlation_id, request_method, route, ip_fingerprint,
     user_agent_family, previous_entry_hash, entry_hash)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb,$15::jsonb,$16,$17,$18,$19,$20,$21,$22)`, [
    entry.id, entry.sequence, entry.occurredAt, entry.actorUserId, entry.actorRole,
    entry.impersonatedUserId, entry.action, entry.actionCategory, entry.targetKind,
    entry.targetId, entry.outcome, entry.denialReason, JSON.stringify(entry.parameters),
    entry.before === null ? null : JSON.stringify(entry.before),
    entry.after === null ? null : JSON.stringify(entry.after), entry.requestCorrelationId,
    entry.requestMethod, entry.route, entry.ipFingerprint, entry.userAgentFamily,
    entry.previousEntryHash, entry.entryHash,
  ]);
}

export class SQLiteAdminAuditStore implements AdminAuditPersistence {
  constructor(private readonly db: DatabaseSync) {}

  async withAdminAudit<T>(
    actor: AdminActor,
    descriptor: AdminAuditDescriptor,
    context: AdminAuditRequestContext,
    mutate: (transaction: AdminAuditTransaction) => Promise<AdminMutationResult<T>> | AdminMutationResult<T>,
  ): Promise<T> {
    this.db.exec("BEGIN IMMEDIATE");
    let appendPhase = false;
    try {
      const result = await mutate({ engine: "sqlite", db: this.db });
      appendPhase = true;
      const entry = this.nextEntry(actor, descriptor, context, "succeeded", null, result.before, result.after);
      insertSqlite(this.db, entry);
      this.db.exec("COMMIT");
      return result.value;
    } catch (error) {
      try { this.db.exec("ROLLBACK"); } catch { /* Preserve the original failure. */ }
      if (appendPhase) throw new AdminAuditAppendError({ cause: error });
      throw error;
    }
  }

  async appendDeniedAttempt(
    actor: AdminActor,
    descriptor: AdminAuditDescriptor,
    context: AdminAuditRequestContext,
    denialReason: string,
  ): Promise<AdminAuditEntry> {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const entry = this.nextEntry(actor, descriptor, context, "denied", denialReason, null, null);
      insertSqlite(this.db, entry);
      this.db.exec("COMMIT");
      return entry;
    } catch (error) {
      try { this.db.exec("ROLLBACK"); } catch { /* Preserve the append failure. */ }
      throw new AdminAuditAppendError({ cause: error });
    }
  }

  async list(fromSequence = 1, toSequence = Number.MAX_SAFE_INTEGER): Promise<readonly AdminAuditEntry[]> {
    const rows = this.db.prepare(`SELECT * FROM admin_audit_log
      WHERE sequence >= ? AND sequence <= ? ORDER BY sequence`).all(fromSequence, toSequence) as unknown as Record<string, unknown>[];
    return rows.map(sqliteRow);
  }

  async verifyAdminAuditChain(fromSequence = 1, toSequence = Number.MAX_SAFE_INTEGER): Promise<AdminAuditChainVerification> {
    const entries = await this.list(fromSequence, toSequence);
    const previous = fromSequence <= 1
      ? GENESIS_HASH
      : (this.db.prepare("SELECT entry_hash FROM admin_audit_log WHERE sequence < ? ORDER BY sequence DESC LIMIT 1").get(fromSequence) as { entry_hash?: string } | undefined)?.entry_hash ?? GENESIS_HASH;
    return verifyEntries(entries, previous);
  }

  private nextEntry(
    actor: AdminActor,
    descriptor: AdminAuditDescriptor,
    context: AdminAuditRequestContext,
    outcome: AdminAuditEntry["outcome"],
    denialReason: string | null,
    before: JsonObject | null,
    after: JsonObject | null,
  ): AdminAuditEntry {
    const head = this.db.prepare("SELECT sequence, entry_hash FROM admin_audit_log ORDER BY sequence DESC LIMIT 1").get() as { sequence: number; entry_hash: string } | undefined;
    return createEntry({
      sequence: head ? Number(head.sequence) + 1 : 1,
      previousEntryHash: head?.entry_hash ?? GENESIS_HASH,
      actor,
      descriptor,
      context,
      outcome,
      denialReason,
      before,
      after,
    });
  }
}

export class PostgreSQLAdminAuditStore implements AdminAuditPersistence {
  constructor(private readonly pool: Pool) {}

  async withAdminAudit<T>(
    actor: AdminActor,
    descriptor: AdminAuditDescriptor,
    context: AdminAuditRequestContext,
    mutate: (transaction: AdminAuditTransaction) => Promise<AdminMutationResult<T>> | AdminMutationResult<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    let appendPhase = false;
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock($1)", [POSTGRES_AUDIT_LOCK_KEY]);
      await client.query("SELECT sequence FROM codeproof_admin_audit_log ORDER BY sequence DESC LIMIT 1 FOR UPDATE");
      const result = await mutate({ engine: "postgresql", client });
      appendPhase = true;
      const entry = await this.nextEntry(client, actor, descriptor, context, "succeeded", null, result.before, result.after);
      await insertPostgres(client, entry);
      await client.query("COMMIT");
      return result.value;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* Preserve the original failure. */ }
      if (appendPhase) throw new AdminAuditAppendError({ cause: error });
      throw error;
    } finally {
      client.release();
    }
  }

  async appendDeniedAttempt(
    actor: AdminActor,
    descriptor: AdminAuditDescriptor,
    context: AdminAuditRequestContext,
    denialReason: string,
  ): Promise<AdminAuditEntry> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock($1)", [POSTGRES_AUDIT_LOCK_KEY]);
      const entry = await this.nextEntry(client, actor, descriptor, context, "denied", denialReason, null, null);
      await insertPostgres(client, entry);
      await client.query("COMMIT");
      return entry;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* Preserve the append failure. */ }
      throw new AdminAuditAppendError({ cause: error });
    } finally {
      client.release();
    }
  }

  async list(fromSequence = 1, toSequence = Number.MAX_SAFE_INTEGER): Promise<readonly AdminAuditEntry[]> {
    const result = await this.pool.query(`SELECT * FROM codeproof_admin_audit_log
      WHERE sequence >= $1 AND sequence <= $2 ORDER BY sequence`, [fromSequence, toSequence]);
    return result.rows.map((row) => postgresRow(row as Record<string, unknown>));
  }

  async verifyAdminAuditChain(fromSequence = 1, toSequence = Number.MAX_SAFE_INTEGER): Promise<AdminAuditChainVerification> {
    const entries = await this.list(fromSequence, toSequence);
    const previous = fromSequence <= 1
      ? GENESIS_HASH
      : (await this.pool.query<{ entry_hash: string }>(
          "SELECT entry_hash FROM codeproof_admin_audit_log WHERE sequence < $1 ORDER BY sequence DESC LIMIT 1",
          [fromSequence],
        )).rows[0]?.entry_hash ?? GENESIS_HASH;
    return verifyEntries(entries, previous);
  }

  private async nextEntry(
    client: PoolClient,
    actor: AdminActor,
    descriptor: AdminAuditDescriptor,
    context: AdminAuditRequestContext,
    outcome: AdminAuditEntry["outcome"],
    denialReason: string | null,
    before: JsonObject | null,
    after: JsonObject | null,
  ): Promise<AdminAuditEntry> {
    const result = await client.query<{ sequence: string | number; entry_hash: string }>(
      "SELECT sequence, entry_hash FROM codeproof_admin_audit_log ORDER BY sequence DESC LIMIT 1 FOR UPDATE",
    );
    const head = result.rows[0];
    return createEntry({
      sequence: head ? Number(head.sequence) + 1 : 1,
      previousEntryHash: head?.entry_hash ?? GENESIS_HASH,
      actor,
      descriptor,
      context,
      outcome,
      denialReason,
      before,
      after,
    });
  }
}
