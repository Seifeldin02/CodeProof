import { describe, expect, it } from "vitest";
import { assertCanonicalAccountAuthority, ensureAccountSchema } from "./account-schema";

describe("canonical account writes", () => {
  it("accepts only canonical persisted authority values", () => {
    expect(assertCanonicalAccountAuthority({ role: "ADMIN", lifecycleState: "active" })).toEqual({
      role: "ADMIN",
      lifecycleState: "active",
    });
    expect(() => assertCanonicalAccountAuthority({ role: "admin", lifecycleState: "active" })).toThrow();
    expect(() => assertCanonicalAccountAuthority({ role: "ADMIN", lifecycleState: "disabled" })).toThrow();
  });

  it("validates the complete additive account projection", () => {
    expect(ensureAccountSchema({
      role: "RECRUITER",
      lifecycleState: "active",
      isDemo: false,
      demoLabel: null,
      companyName: null,
      planTierId: null,
      lastActivityAt: null,
      softDeletedAt: null,
      suspendedAt: null,
    }).role).toBe("RECRUITER");
  });
});
