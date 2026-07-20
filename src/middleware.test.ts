import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";

function request(path: string, accessCode?: string): NextRequest {
  const headers = new Headers();
  if (accessCode !== undefined) headers.set("authorization", `Basic ${btoa(`recruiter:${accessCode}`)}`);
  return new NextRequest(new URL(`http://localhost:3000${path}`), { headers });
}

afterEach(() => {
  delete process.env.CODEPROOF_ACCESS_CODE;
});

describe("public deployment access gate", () => {
  it("stays a no-op when no access code is configured", () => {
    expect(middleware(request("/candidates")).status).toBe(200);
  });

  it("challenges unauthenticated requests once an access code is set", () => {
    process.env.CODEPROOF_ACCESS_CODE = "open-sesame";
    const response = middleware(request("/candidates"));
    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toContain("Basic");
  });

  it("protects candidate data endpoints, not just pages", () => {
    process.env.CODEPROOF_ACCESS_CODE = "open-sesame";
    expect(middleware(request("/api/candidates")).status).toBe(401);
  });

  it("rejects an incorrect access code", () => {
    process.env.CODEPROOF_ACCESS_CODE = "open-sesame";
    expect(middleware(request("/api/candidates", "wrong")).status).toBe(401);
  });

  it("admits the correct access code", () => {
    process.env.CODEPROOF_ACCESS_CODE = "open-sesame";
    expect(middleware(request("/api/candidates", "open-sesame")).status).toBe(200);
  });

  it("keeps /api/health reachable so the Replit health check still passes", () => {
    process.env.CODEPROOF_ACCESS_CODE = "open-sesame";
    expect(middleware(request("/api/health")).status).toBe(200);
  });
});
