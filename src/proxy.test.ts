import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

function request(path: string, options: { method?: string; accessCode?: string } = {}): NextRequest {
  const headers = new Headers();
  if (options.accessCode !== undefined) {
    headers.set("authorization", `Basic ${btoa(`recruiter:${options.accessCode}`)}`);
  }
  return new NextRequest(new URL(`http://localhost:3000${path}`), {
    method: options.method ?? "GET",
    headers,
  });
}

afterEach(() => {
  delete process.env.CODEPROOF_ACCESS_CODE;
  delete process.env.CODEPROOF_PROTECT_ALL;
});

describe("access gate: disabled by default", () => {
  it("is a no-op when no access code is configured", () => {
    expect(proxy(request("/analyze")).status).toBe(200);
    expect(proxy(request("/api/cv/discover", { method: "POST" })).status).toBe(200);
  });
});

describe("access gate: protects the upload path", () => {
  const code = "open-sesame";

  it("keeps browsing open so a public demo still works", () => {
    process.env.CODEPROOF_ACCESS_CODE = code;
    expect(proxy(request("/")).status).toBe(200);
    expect(proxy(request("/candidates")).status).toBe(200);
    expect(proxy(request("/insights")).status).toBe(200);
    expect(proxy(request("/api/candidates")).status).toBe(200);
  });

  it("challenges the upload page so credentials exist before it posts", () => {
    process.env.CODEPROOF_ACCESS_CODE = code;
    const response = proxy(request("/analyze"));
    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toContain("Basic");
  });

  it("challenges every mutating request", () => {
    process.env.CODEPROOF_ACCESS_CODE = code;
    for (const path of ["/api/cv/discover", "/api/candidates/analyze", "/api/analyze"]) {
      expect(proxy(request(path, { method: "POST" })).status).toBe(401);
    }
  });

  it("rejects an incorrect access code", () => {
    process.env.CODEPROOF_ACCESS_CODE = code;
    expect(proxy(request("/api/cv/discover", { method: "POST", accessCode: "wrong" })).status).toBe(401);
  });

  it("admits the correct access code for uploads and the upload page", () => {
    process.env.CODEPROOF_ACCESS_CODE = code;
    expect(proxy(request("/analyze", { accessCode: code })).status).toBe(200);
    expect(proxy(request("/api/cv/discover", { method: "POST", accessCode: code })).status).toBe(200);
  });

  it("keeps /api/health reachable so the Replit health check still passes", () => {
    process.env.CODEPROOF_ACCESS_CODE = code;
    expect(proxy(request("/api/health")).status).toBe(200);
  });
});

describe("access gate: full lockdown", () => {
  const code = "open-sesame";

  it("also closes read access when CODEPROOF_PROTECT_ALL is enabled", () => {
    process.env.CODEPROOF_ACCESS_CODE = code;
    process.env.CODEPROOF_PROTECT_ALL = "true";
    expect(proxy(request("/candidates")).status).toBe(401);
    expect(proxy(request("/api/candidates")).status).toBe(401);
    expect(proxy(request("/api/candidates", { accessCode: code })).status).toBe(200);
  });

  it("still exempts the deployment health check", () => {
    process.env.CODEPROOF_ACCESS_CODE = code;
    process.env.CODEPROOF_PROTECT_ALL = "true";
    expect(proxy(request("/api/health")).status).toBe(200);
  });
});
