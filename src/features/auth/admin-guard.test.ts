import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSessionToken, SESSION_COOKIE } from "./session";
import type { AuthUser } from "./store";
import {
  AdminAccessDenied,
  adminApiDenial,
  rejectPrivilegeClaimKeys,
  requireAdmin,
  type AdminGuardDependencies,
} from "./admin-guard";
import {
  adminAuthorizationRateLimited,
  clearAdminAuthorizationAttempts,
  resetAdminAuthorizationAttemptsForTests,
} from "@/features/admin/rate-limit";

const USER_ID = "11111111-1111-4111-8111-111111111111";

function user(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: USER_ID,
    email: "operator@example.invalid",
    createdAt: "2026-09-23T00:00:00.000Z",
    role: "ADMIN",
    lifecycleState: "active",
    isDemo: false,
    demoLabel: null,
    companyName: null,
    planTierId: "pilot-free",
    lastActivityAt: null,
    ...overrides,
  };
}

function request(options: {
  path?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signedIn?: boolean;
} = {}): Request {
  const headers = new Headers(options.headers);
  if (options.signedIn !== false) {
    headers.append("cookie", `${SESSION_COOKIE}=${encodeURIComponent(createSessionToken(USER_ID))}`);
  }
  return new Request(`http://localhost${options.path ?? "/api/admin/audit"}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body,
  });
}

function dependencies(account: AuthUser | null = user()): AdminGuardDependencies {
  return {
    findUser: vi.fn(async () => account),
    rateLimited: vi.fn(async () => false),
    clearAttempts: vi.fn(async () => undefined),
    impersonationActive: vi.fn(async () => false),
    recordDeniedAttempt: vi.fn(async () => undefined),
  };
}

beforeEach(() => {
  vi.stubEnv("CODEPROOF_SESSION_SECRET", "test-only-session-secret-with-at-least-32-characters");
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("POSTGRES_URL", "");
  resetAdminAuthorizationAttemptsForTests();
});

afterEach(() => vi.unstubAllEnvs());

describe("persisted-state-only administrative authority", () => {
  it("authorizes only a persisted active ADMIN and clears its denial window", async () => {
    const deps = dependencies();
    await expect(requireAdmin(request(), deps)).resolves.toMatchObject({ userId: USER_ID, role: "ADMIN" });
    expect(deps.findUser).toHaveBeenCalledWith(USER_ID);
    expect(deps.clearAttempts).toHaveBeenCalledOnce();
  });

  it.each([
    ["no session", null, false],
    ["missing account", null, true],
    ["recruiter", user({ role: "RECRUITER" }), true],
    ["suspended", user({ lifecycleState: "suspended" }), true],
    ["soft deleted", user({ lifecycleState: "soft_deleted" }), true],
  ])("uses the same unavailable surface for %s", async (_label, account, signedIn) => {
    const deps = dependencies(account);
    await expect(requireAdmin(request({ signedIn }), deps)).rejects.toBeInstanceOf(AdminAccessDenied);
    const response = adminApiDenial();
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: { code: "RESOURCE_UNAVAILABLE" } });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it.each([
    () => request({ path: "/api/admin/audit?role=ADMIN" }),
    () => request({ headers: { "x-is-admin": "true" } }),
    () => request({ headers: { cookie: "adminToken=forged" } }),
    () => request({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ permissions: ["admin"] }) }),
    () => request({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ formState: { isAdmin: true } }) }),
  ])("rejects injected privilege claims before authority validation", async (createInjectedRequest) => {
    const deps = dependencies();
    await expect(requireAdmin(createInjectedRequest(), deps)).rejects.toBeInstanceOf(AdminAccessDenied);
    expect(deps.findUser).toHaveBeenCalledOnce();
    expect(deps.clearAttempts).not.toHaveBeenCalled();
  });

  it("denies an admin while impersonation is active", async () => {
    const deps: AdminGuardDependencies = {
      ...dependencies(),
      impersonationActive: vi.fn(async () => true),
    };
    await expect(requireAdmin(request(), deps)).rejects.toMatchObject({ reason: "impersonation_active" });
    expect(deps.recordDeniedAttempt).toHaveBeenCalledOnce();
  });

  it("fails closed when the durable limiter is unavailable", async () => {
    const deps: AdminGuardDependencies = {
      ...dependencies(),
      rateLimited: vi.fn(async () => { throw new Error("database unavailable"); }),
    };
    await expect(requireAdmin(request(), deps)).rejects.toMatchObject({ reason: "rate_limited" });
    expect(deps.findUser).not.toHaveBeenCalled();
  });
});

describe("privilege-claim scanner and denial limiter", () => {
  it("allows ordinary strict input fields", async () => {
    const ordinary = request({
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "search", query: "example" }),
    });
    await expect(rejectPrivilegeClaimKeys(ordinary)).resolves.toBe(false);
  });

  it("blocks past the configured threshold and clears on success", async () => {
    vi.stubEnv("CODEPROOF_ADMIN_DENIAL_THRESHOLD", "2");
    const attempt = request({ signedIn: false, headers: { "x-forwarded-for": "192.0.2.10" } });
    await expect(adminAuthorizationRateLimited(attempt, null, 1_000)).resolves.toBe(false);
    await expect(adminAuthorizationRateLimited(attempt, null, 1_001)).resolves.toBe(false);
    await expect(adminAuthorizationRateLimited(attempt, null, 1_002)).resolves.toBe(true);
    await clearAdminAuthorizationAttempts(attempt, "different-subject");
  });
});
