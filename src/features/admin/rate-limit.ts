import { createHash } from "node:crypto";
import { getPostgresPool } from "@/features/persistence/postgres";

interface AttemptWindow {
  count: number;
  resetsAt: number;
}

const WINDOW_MS = 15 * 60 * 1_000;
const DEFAULT_THRESHOLD = 10;
const MAX_TRACKED_KEYS = 5_000;
const state = globalThis as typeof globalThis & {
  codeproofAdminAuthorizationAttempts?: Map<string, AttemptWindow>;
};
state.codeproofAdminAuthorizationAttempts ??= new Map();

function threshold(): number {
  const configured = Number.parseInt(process.env.CODEPROOF_ADMIN_DENIAL_THRESHOLD ?? "", 10);
  return Number.isSafeInteger(configured) && configured > 0 ? configured : DEFAULT_THRESHOLD;
}

function forwardedIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? request.headers.get("x-real-ip")?.trim()
    ?? "unknown";
}

export function adminAuthorizationSubject(request: Request, sessionUserId: string | null): string {
  return createHash("sha256")
    .update(`${forwardedIp(request)}:${sessionUserId ?? "anonymous"}:admin`, "utf8")
    .digest("hex");
}

function boundedMemoryWindow(key: string, now: number): boolean {
  const attempts = state.codeproofAdminAuthorizationAttempts as Map<string, AttemptWindow>;
  const current = attempts.get(key);
  if (!current || current.resetsAt <= now) {
    if (attempts.size >= MAX_TRACKED_KEYS) {
      for (const [trackedKey, window] of attempts) {
        if (window.resetsAt <= now) attempts.delete(trackedKey);
      }
      if (attempts.size >= MAX_TRACKED_KEYS) {
        const oldest = attempts.keys().next().value as string | undefined;
        if (oldest) attempts.delete(oldest);
      }
    }
    attempts.set(key, { count: 1, resetsAt: now + WINDOW_MS });
    return false;
  }
  current.count += 1;
  return current.count > threshold();
}

/** Increments the bounded denial window. A successful guard clears it. */
export async function adminAuthorizationRateLimited(
  request: Request,
  sessionUserId: string | null,
  now = Date.now(),
): Promise<boolean> {
  const key = adminAuthorizationSubject(request, sessionUserId);
  const pool = getPostgresPool();
  if (!pool) return boundedMemoryWindow(key, now);

  const windowStartedAt = new Date(now).toISOString();
  const expiresAt = new Date(now + WINDOW_MS).toISOString();
  await pool.query(`CREATE TABLE IF NOT EXISTS codeproof_admin_authorization_attempts (
    key_digest TEXT PRIMARY KEY,
    window_started_at TIMESTAMPTZ NOT NULL,
    attempt_count INTEGER NOT NULL CHECK(attempt_count >= 0),
    expires_at TIMESTAMPTZ NOT NULL
  )`);
  const result = await pool.query<{ attempt_count: number | string }>(`INSERT INTO codeproof_admin_authorization_attempts
    (key_digest, window_started_at, attempt_count, expires_at)
    VALUES ($1, $2, 1, $3)
    ON CONFLICT (key_digest) DO UPDATE SET
      window_started_at = CASE WHEN codeproof_admin_authorization_attempts.expires_at <= $2 THEN $2 ELSE codeproof_admin_authorization_attempts.window_started_at END,
      attempt_count = CASE WHEN codeproof_admin_authorization_attempts.expires_at <= $2 THEN 1 ELSE codeproof_admin_authorization_attempts.attempt_count + 1 END,
      expires_at = CASE WHEN codeproof_admin_authorization_attempts.expires_at <= $2 THEN $3 ELSE codeproof_admin_authorization_attempts.expires_at END
    RETURNING attempt_count`, [key, windowStartedAt, expiresAt]);
  return Number(result.rows[0]?.attempt_count ?? 1) > threshold();
}

export async function clearAdminAuthorizationAttempts(
  request: Request,
  sessionUserId: string,
): Promise<void> {
  const key = adminAuthorizationSubject(request, sessionUserId);
  const pool = getPostgresPool();
  if (pool) {
    await pool.query("DELETE FROM codeproof_admin_authorization_attempts WHERE key_digest = $1", [key]);
    return;
  }
  state.codeproofAdminAuthorizationAttempts?.delete(key);
}

export function resetAdminAuthorizationAttemptsForTests(): void {
  state.codeproofAdminAuthorizationAttempts?.clear();
}
