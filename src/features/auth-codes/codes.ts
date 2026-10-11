import { createHash, createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { toCount, type SqlDatabase, type SqlRunner } from "@/features/persistence/sql";

/**
 * One-time codes that prove someone can read an email address or a phone.
 *
 * A code is six digits, lives ten minutes, works once, and allows five guesses.
 * Only a keyed digest is stored, so a database reader cannot learn a live code,
 * and the address it was issued for is stored as a digest too. Limits are
 * counted in the database, so they hold across server instances.
 */
export const CODE_RULES = {
  digits: 6,
  lifetimeMs: 10 * 60_000,
  maxAttempts: 5,
  /** A new code cannot be requested for the same address sooner than this. */
  resendAfterMs: 60_000,
  /** At most `maxPerWindow` codes per address in this window. */
  windowMs: 30 * 60_000,
  maxPerWindow: 5,
  /** Rows older than this are removed whenever a code is issued. */
  retentionMs: 24 * 60 * 60_000,
} as const;

export type CodePurpose = "sign_in" | "phone_verification";
export type CodeChannel = "email" | "sms";

export function generateCode(): string {
  return String(randomInt(0, 10 ** CODE_RULES.digits)).padStart(CODE_RULES.digits, "0");
}

/** Accepts what people type or paste: spaces and dashes are ignored. */
export function normalizeCode(input: string): string | null {
  const digits = input.replace(/[\s-]/g, "");
  return new RegExp(`^\\d{${CODE_RULES.digits}}$`).test(digits) ? digits : null;
}

/** Identifies who a code is for without storing the address itself. */
export function subjectDigest(purpose: CodePurpose, subject: string): string {
  return createHash("sha256").update(`${purpose}\0${subject.trim().toLowerCase()}`, "utf8").digest("hex");
}

function codeDigest(secret: string, id: string, code: string): string {
  return createHmac("sha256", secret).update(`${id}\0${code}`, "utf8").digest("hex");
}

export type IssueCodeResult =
  | { ok: true; id: string; code: string; expiresAt: string }
  | { ok: false; reason: "too_soon" | "too_many"; retryAfterSeconds: number };

interface IssueInput {
  purpose: CodePurpose;
  channel: CodeChannel;
  subject: string;
  /** Server secret that keys the stored digest. */
  secret: string;
  now?: number;
}

export async function issueCode(runner: SqlRunner, input: IssueInput): Promise<IssueCodeResult> {
  const now = input.now ?? Date.now();
  const digest = subjectDigest(input.purpose, input.subject);
  await runner.run("DELETE FROM {auth_codes} WHERE created_at < ?", [new Date(now - CODE_RULES.retentionMs).toISOString()]);

  const recent = await runner.all<{ created_at: string }>(
    "SELECT created_at FROM {auth_codes} WHERE subject_digest = ? AND purpose = ? AND created_at > ? ORDER BY created_at DESC",
    [digest, input.purpose, new Date(now - CODE_RULES.windowMs).toISOString()],
  );
  const latest = recent[0] ? Date.parse(recent[0].created_at) : null;
  if (latest !== null && now - latest < CODE_RULES.resendAfterMs) {
    return { ok: false, reason: "too_soon", retryAfterSeconds: Math.ceil((CODE_RULES.resendAfterMs - (now - latest)) / 1000) };
  }
  if (recent.length >= CODE_RULES.maxPerWindow) {
    const oldest = Date.parse(recent[recent.length - 1].created_at);
    return { ok: false, reason: "too_many", retryAfterSeconds: Math.max(1, Math.ceil((oldest + CODE_RULES.windowMs - now) / 1000)) };
  }

  const id = randomUUID();
  const code = generateCode();
  const expiresAt = new Date(now + CODE_RULES.lifetimeMs).toISOString();
  await runner.run(
    `INSERT INTO {auth_codes} (id, purpose, channel, subject_digest, code_digest, delivered, attempts, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)`,
    [id, input.purpose, input.channel, digest, codeDigest(input.secret, id, code), new Date(now).toISOString(), expiresAt],
  );
  return { ok: true, id, code, expiresAt };
}

export async function markCodeDelivered(runner: SqlRunner, id: string): Promise<void> {
  await runner.run("UPDATE {auth_codes} SET delivered = 1 WHERE id = ?", [id]);
}

/** Withdraws a code that could not be delivered, so it does not count against the sender's limits. */
export async function discardCode(runner: SqlRunner, id: string): Promise<void> {
  await runner.run("DELETE FROM {auth_codes} WHERE id = ?", [id]);
}

interface VerifyInput {
  purpose: CodePurpose;
  subject: string;
  code: string;
  secret: string;
  now?: number;
}

interface CodeRow {
  id: string;
  code_digest: string;
  attempts: number;
  channel: CodeChannel;
}

export type VerifyCodeResult = { valid: true; channel: CodeChannel } | { valid: false };

/**
 * Checks a code against the newest live code for the subject. Every wrong
 * guess is counted before it is compared, and a correct code is consumed in
 * the same transaction, so it cannot be used twice or guessed in parallel.
 */
export async function verifyCode(database: SqlDatabase, input: VerifyInput): Promise<VerifyCodeResult> {
  const now = new Date(input.now ?? Date.now()).toISOString();
  const code = normalizeCode(input.code);
  const digest = subjectDigest(input.purpose, input.subject);

  return database.transaction(async (tx): Promise<VerifyCodeResult> => {
    const row = await tx.get<CodeRow>(
      `SELECT id, code_digest, attempts, channel FROM {auth_codes}
       WHERE subject_digest = ? AND purpose = ? AND consumed_at IS NULL AND expires_at > ?
       ORDER BY created_at DESC LIMIT 1`,
      [digest, input.purpose, now],
    );
    if (!row || !code) return { valid: false };

    const counted = await tx.run(
      "UPDATE {auth_codes} SET attempts = attempts + 1 WHERE id = ? AND consumed_at IS NULL AND attempts < ?",
      [row.id, CODE_RULES.maxAttempts],
    );
    if (counted !== 1) return { valid: false };

    const expected = Buffer.from(row.code_digest, "hex");
    const provided = Buffer.from(codeDigest(input.secret, row.id, code), "hex");
    if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) return { valid: false };

    const consumed = await tx.run("UPDATE {auth_codes} SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL", [now, row.id]);
    return consumed === 1 ? { valid: true, channel: row.channel } : { valid: false };
  });
}

/** How many live codes a subject holds. Used by tests and diagnostics. */
export async function liveCodeCount(runner: SqlRunner, purpose: CodePurpose, subject: string, now = Date.now()): Promise<number> {
  const row = await runner.get<{ total: number }>(
    "SELECT CAST(COUNT(*) AS INTEGER) AS total FROM {auth_codes} WHERE subject_digest = ? AND purpose = ? AND consumed_at IS NULL AND expires_at > ?",
    [subjectDigest(purpose, subject), purpose, new Date(now).toISOString()],
  );
  return toCount(row?.total);
}
