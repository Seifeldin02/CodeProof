import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

/**
 * The Replit deployment health check depends on this exact contract (see the
 * "Replit" section of README.md): a healthy instance must report `status: "ok"`
 * and `paidApisRequired: false`. Changing either field silently breaks
 * deployment monitoring, so the shape is pinned here.
 */
describe("GET /api/health", () => {
  afterEach(() => {
    delete process.env.VERCEL;
    delete process.env.DATABASE_URL;
    delete process.env.POSTGRES_URL;
    vi.unstubAllEnvs();
  });
  it("reports the documented healthy deployment contract", async () => {
    const response = GET();
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.status).toBe("ok");
    expect(body.paidApisRequired).toBe(false);
    expect(typeof body.engineVersion).toBe("string");
    expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
  });

  it("reports which ways of signing in are switched on, and needs none of them", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect((await GET().json()).signIn).toEqual({ emailCode: false, google: false, textMessage: false, password: true });

    vi.stubEnv("CODEPROOF_MAIL_FROM", "CodeProof <no-reply@example.test>");
    vi.stubEnv("RESEND_API_KEY", "test-key");
    vi.stubEnv("GOOGLE_CLIENT_ID", "client-id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "client-secret");
    const configured = await GET().json();
    expect(configured.signIn).toEqual({ emailCode: true, google: true, textMessage: false, password: false });
    expect(configured.paidApisRequired).toBe(false);
    expect(JSON.stringify(configured)).not.toContain("test-key");
  });

  it("surfaces a Vercel deployment without durable account storage", async () => {
    process.env.VERCEL = "1";
    const response = GET();
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ status: "degraded", durablePersistence: false });
  });
});
