import { createHash, randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import { getAdminAuditStore } from "@/features/admin/store";
import {
  adminAuthorizationRateLimited,
  clearAdminAuthorizationAttempts,
} from "@/features/admin/rate-limit";
import { logger } from "@/services/observability/logger";
import {
  AdminActorSchema,
  type AdminActor,
  type AdminDenialReason,
} from "@/types/remediation";
import { readSessionToken, SESSION_COOKIE } from "./session";
import { getAuthStore, type AuthUser } from "./store";

const RESERVED_PRIVILEGE_KEYS = new Set(["role", "isadmin", "permissions", "admintoken"]);
export const IMPERSONATION_COOKIE = process.env.NODE_ENV === "production"
  ? "__Host-codeproof_impersonation"
  : "codeproof_impersonation";

export interface AdminGuardDependencies {
  readonly findUser: (id: string) => Promise<AuthUser | null>;
  readonly rateLimited: (request: Request, subject: string | null) => Promise<boolean>;
  readonly clearAttempts: (request: Request, subject: string) => Promise<void>;
  readonly impersonationActive: (request: Request) => Promise<boolean>;
  readonly recordDeniedAttempt: (
    user: AuthUser,
    reason: AdminDenialReason,
    request: Request,
  ) => Promise<void>;
}

export class AdminAccessDenied extends Error {
  constructor(readonly reason: AdminDenialReason) {
    super("Resource unavailable.");
    this.name = "AdminAccessDenied";
  }
}

function normalizedPrivilegeKey(key: string): string {
  return key.replace(/[^a-z0-9]/giu, "").toLowerCase();
}

function isPrivilegeKey(key: string): boolean {
  const normalized = normalizedPrivilegeKey(key);
  return [...RESERVED_PRIVILEGE_KEYS].some((reserved) => normalized === reserved || normalized.endsWith(reserved));
}

function containsPrivilegeClaim(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsPrivilegeClaim);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, nested]) => (
    isPrivilegeKey(key) || containsPrivilegeClaim(nested)
  ));
}

/** Refuses client-supplied authority before an administrative schema validates. */
export async function rejectPrivilegeClaimKeys(request: Request): Promise<boolean> {
  const url = new URL(request.url);
  for (const key of url.searchParams.keys()) {
    if (isPrivilegeKey(key)) return true;
  }
  for (const [key] of request.headers) {
    if (isPrivilegeKey(key)) return true;
  }
  const cookie = request.headers.get("cookie");
  if (cookie) {
    for (const part of cookie.split(";")) {
      const key = part.split("=", 1)[0]?.trim() ?? "";
      if (isPrivilegeKey(key)) return true;
    }
  }
  if (request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    try {
      if (containsPrivilegeClaim(await request.clone().json())) return true;
    } catch {
      // Input validation owns malformed JSON; this guard only removes privilege claims.
    }
  }
  return false;
}

function cookieValue(request: Request, name: string): string | undefined {
  const cookie = request.headers.get("cookie");
  if (!cookie) return undefined;
  for (const part of cookie.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName === name) {
      const value = rawValue.join("=");
      try { return decodeURIComponent(value); } catch { return value; }
    }
  }
  return undefined;
}

function ipFingerprint(request: Request): string {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? request.headers.get("x-real-ip")?.trim()
    ?? "unknown";
  return createHash("sha256").update(ip, "utf8").digest("hex");
}

function userAgentFamily(request: Request): string | null {
  const value = request.headers.get("user-agent")?.trim();
  if (!value) return null;
  return value.split(/[\s/]/u)[0]?.slice(0, 200) || null;
}

async function recordDeniedAttempt(
  user: AuthUser,
  reason: AdminDenialReason,
  request: Request,
): Promise<void> {
  try {
    await getAdminAuditStore().appendDeniedAttempt({
      userId: user.id,
      email: user.email,
      role: user.role,
      lifecycleState: user.lifecycleState,
    }, {
      action: "admin_authorization_denied",
      actionCategory: "authorization",
      targetKind: "none",
      targetId: null,
      parameters: {},
    }, {
      requestCorrelationId: request.headers.get("x-request-id")?.slice(0, 200) || randomUUID(),
      requestMethod: request.method,
      route: new URL(request.url).pathname.slice(0, 1_000),
      ipFingerprint: ipFingerprint(request),
      userAgentFamily: userAgentFamily(request),
    }, reason);
  } catch {
    logger.warn("admin_denial_audit_unavailable", { reason });
  }
}

const defaultDependencies: AdminGuardDependencies = {
  findUser: (id) => getAuthStore().findById(id),
  rateLimited: adminAuthorizationRateLimited,
  clearAttempts: clearAdminAuthorizationAttempts,
  impersonationActive: async (request) => Boolean(cookieValue(request, IMPERSONATION_COOKIE)),
  recordDeniedAttempt,
};

async function deny(
  reason: AdminDenialReason,
  user: AuthUser | null,
  request: Request,
  dependencies: AdminGuardDependencies,
): Promise<never> {
  if (user) await dependencies.recordDeniedAttempt(user, reason, request);
  logger.warn("admin_authorization_denied", { reason });
  throw new AdminAccessDenied(reason);
}

/** Resolves authority from current persisted account state on every invocation. */
export async function requireAdmin(
  request: Request,
  dependencies: AdminGuardDependencies = defaultDependencies,
): Promise<AdminActor> {
  const sessionUserId = readSessionToken(cookieValue(request, SESSION_COOKIE));
  let rateLimited = true;
  try {
    rateLimited = await dependencies.rateLimited(request, sessionUserId);
  } catch {
    logger.warn("admin_authorization_limiter_unavailable", {});
  }
  if (rateLimited) {
    return deny("rate_limited", null, request, dependencies);
  }
  const hasPrivilegeClaim = await rejectPrivilegeClaimKeys(request);
  if (!sessionUserId) return deny("no_session", null, request, dependencies);

  const user = await dependencies.findUser(sessionUserId);
  if (hasPrivilegeClaim) return deny("not_admin", user, request, dependencies);
  if (!user || user.lifecycleState !== "active") {
    return deny("account_unavailable", user, request, dependencies);
  }
  if (user.role !== "ADMIN") return deny("not_admin", user, request, dependencies);
  if (await dependencies.impersonationActive(request)) {
    return deny("impersonation_active", user, request, dependencies);
  }

  try {
    await dependencies.clearAttempts(request, sessionUserId);
  } catch {
    logger.warn("admin_authorization_limiter_clear_failed", {});
    return deny("rate_limited", user, request, dependencies);
  }
  return AdminActorSchema.parse({
    userId: user.id,
    email: user.email,
    role: user.role,
    lifecycleState: user.lifecycleState,
  });
}

export function adminApiDenial(): Response {
  return new Response(JSON.stringify({ error: { code: "RESOURCE_UNAVAILABLE" } }), {
    status: 404,
    headers: {
      "cache-control": "private, no-store",
      "content-type": "application/json; charset=utf-8",
    },
  });
}

export async function requireAdminPage(): Promise<AdminActor> {
  const requestHeaders = new Headers(await headers());
  if (!requestHeaders.has("cookie")) {
    const session = (await cookies()).get(SESSION_COOKIE)?.value;
    if (session) requestHeaders.set("cookie", `${SESSION_COOKIE}=${encodeURIComponent(session)}`);
  }
  const host = requestHeaders.get("host") ?? "localhost";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";
  try {
    return await requireAdmin(new Request(`${protocol}://${host}/admin`, { headers: requestHeaders }));
  } catch (error) {
    if (error instanceof AdminAccessDenied) notFound();
    throw error;
  }
}
