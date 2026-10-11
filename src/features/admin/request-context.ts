import { createHash, randomUUID } from "node:crypto";
import type { AdminAuditRequestContext } from "./audit";

/**
 * What the audit log records about the request behind an administrative
 * change. The address is stored only as a digest, in the same form the
 * authorization guard uses for denied attempts, so the two can be matched.
 */
export function adminAuditContext(request: Request): AdminAuditRequestContext {
  const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? request.headers.get("x-real-ip")?.trim()
    ?? "unknown";
  const userAgent = request.headers.get("user-agent")?.trim();
  return {
    requestCorrelationId: request.headers.get("x-request-id")?.slice(0, 200) || randomUUID(),
    requestMethod: request.method,
    route: new URL(request.url).pathname.slice(0, 1_000),
    ipFingerprint: createHash("sha256").update(address, "utf8").digest("hex"),
    userAgentFamily: (userAgent ? userAgent.split(/[\s/]/u)[0]?.slice(0, 200) : null) || null,
  };
}
