import { createHash } from "node:crypto";

interface AttemptWindow {
  count: number;
  resetsAt: number;
}

const state = globalThis as typeof globalThis & { codeproofAuthAttempts?: Map<string, AttemptWindow> };
state.codeproofAuthAttempts ??= new Map();

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;
const MAX_TRACKED_KEYS = 5_000;

function keyFor(request: Request, email: string): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  return createHash("sha256").update(`${forwarded}:${email.trim().toLowerCase()}`).digest("hex");
}

export function authRateLimited(request: Request, email: string, now = Date.now()): boolean {
  const key = keyFor(request, email);
  const current = state.codeproofAuthAttempts?.get(key);
  if (!current || current.resetsAt <= now) {
    if ((state.codeproofAuthAttempts?.size ?? 0) >= MAX_TRACKED_KEYS) {
      for (const [trackedKey, window] of state.codeproofAuthAttempts ?? []) {
        if (window.resetsAt <= now) state.codeproofAuthAttempts?.delete(trackedKey);
      }
      if ((state.codeproofAuthAttempts?.size ?? 0) >= MAX_TRACKED_KEYS) {
        const oldestKey = state.codeproofAuthAttempts?.keys().next().value as string | undefined;
        if (oldestKey) state.codeproofAuthAttempts?.delete(oldestKey);
      }
    }
    state.codeproofAuthAttempts?.set(key, { count: 1, resetsAt: now + WINDOW_MS });
    return false;
  }
  current.count += 1;
  return current.count > MAX_ATTEMPTS;
}

export function clearAuthAttempts(request: Request, email: string): void {
  state.codeproofAuthAttempts?.delete(keyFor(request, email));
}
