import { createHash } from "node:crypto";

/**
 * Counts requests per client address for one named action. It lives in
 * instance memory, like the sign-in limiter: it slows a single client down and
 * is not a substitute for an edge limiter under load. The limits that matter
 * for one-time codes are counted in the database instead.
 */

interface Window {
  count: number;
  resetsAt: number;
}

const state = globalThis as typeof globalThis & { codeproofRequestLimits?: Map<string, Window> };
state.codeproofRequestLimits ??= new Map();

const MAX_TRACKED_KEYS = 10_000;

export function clientAddressLimited(
  request: Request,
  action: string,
  limit: { max: number; windowMs: number },
  now = Date.now(),
): boolean {
  const windows = state.codeproofRequestLimits as Map<string, Window>;
  const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const key = createHash("sha256").update(`${action}\0${address}`).digest("hex");
  const current = windows.get(key);
  if (!current || current.resetsAt <= now) {
    if (windows.size >= MAX_TRACKED_KEYS) {
      for (const [tracked, window] of windows) if (window.resetsAt <= now) windows.delete(tracked);
      if (windows.size >= MAX_TRACKED_KEYS) {
        const oldest = windows.keys().next().value as string | undefined;
        if (oldest) windows.delete(oldest);
      }
    }
    windows.set(key, { count: 1, resetsAt: now + limit.windowMs });
    return false;
  }
  current.count += 1;
  return current.count > limit.max;
}

export function resetClientAddressLimitsForTests(): void {
  state.codeproofRequestLimits?.clear();
}
