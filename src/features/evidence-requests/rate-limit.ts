import { createHash } from "node:crypto";

/**
 * The answer endpoint is public, so attempts are limited per client address.
 * The limiter lives in instance memory, like the sign-in limiter: it slows a
 * single client down and is not a substitute for an edge limiter under load.
 */

interface AttemptWindow {
  count: number;
  resetsAt: number;
}

const state = globalThis as typeof globalThis & { codeproofEvidenceAttempts?: Map<string, AttemptWindow> };
state.codeproofEvidenceAttempts ??= new Map();

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 20;
const MAX_TRACKED_KEYS = 5_000;

function keyFor(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  return createHash("sha256").update(forwarded).digest("hex");
}

export function evidenceAnswerRateLimited(request: Request, now = Date.now()): boolean {
  const attempts = state.codeproofEvidenceAttempts as Map<string, AttemptWindow>;
  const key = keyFor(request);
  const current = attempts.get(key);
  if (!current || current.resetsAt <= now) {
    if (attempts.size >= MAX_TRACKED_KEYS) {
      for (const [trackedKey, window] of attempts) if (window.resetsAt <= now) attempts.delete(trackedKey);
      if (attempts.size >= MAX_TRACKED_KEYS) {
        const oldestKey = attempts.keys().next().value as string | undefined;
        if (oldestKey) attempts.delete(oldestKey);
      }
    }
    attempts.set(key, { count: 1, resetsAt: now + WINDOW_MS });
    return false;
  }
  current.count += 1;
  return current.count > MAX_ATTEMPTS;
}

export function resetEvidenceAnswerAttemptsForTests(): void {
  state.codeproofEvidenceAttempts?.clear();
}
