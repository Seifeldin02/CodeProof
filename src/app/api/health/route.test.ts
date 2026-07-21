import { afterEach, describe, expect, it } from "vitest";
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

  it("surfaces a Vercel deployment without durable account storage", async () => {
    process.env.VERCEL = "1";
    const response = GET();
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ status: "degraded", durablePersistence: false });
  });
});
