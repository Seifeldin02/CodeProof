// Keep the singleton store off the real database file.
process.env.CODEPROOF_DB_PATH = ":memory:";
process.env.CODEPROOF_SESSION_SECRET = "test-secret-value";

import { afterEach, describe, expect, it } from "vitest";
import { AuthStore, hashPassword, signupAllowed, verifyPassword } from "./store";
import { createSessionToken, readSessionToken, SESSION_MAX_AGE_SECONDS } from "./session";

afterEach(() => {
  delete process.env.CODEPROOF_ALLOW_SIGNUP;
});

describe("password hashing", () => {
  it("accepts the correct password and rejects a wrong one", () => {
    const stored = hashPassword("correct horse battery");
    expect(verifyPassword("correct horse battery", stored)).toBe(true);
    expect(verifyPassword("wrong password entirely", stored)).toBe(false);
  });

  it("salts each hash so identical passwords do not collide", () => {
    expect(hashPassword("same-password")).not.toBe(hashPassword("same-password"));
  });

  it("never stores the password in the hash", () => {
    expect(hashPassword("plaintext-secret")).not.toContain("plaintext-secret");
  });

  it("rejects malformed stored hashes instead of throwing", () => {
    expect(verifyPassword("anything", "not-a-real-hash")).toBe(false);
  });
});

describe("session tokens", () => {
  it("round-trips a user id", () => {
    const token = createSessionToken("user-123");
    expect(readSessionToken(token)).toBe("user-123");
  });

  it("rejects a tampered user id", () => {
    const token = createSessionToken("user-123");
    const forged = token.replace("user-123", "user-999");
    expect(readSessionToken(forged)).toBeNull();
  });

  it("rejects an expired token", () => {
    const issuedAt = Date.now() - (SESSION_MAX_AGE_SECONDS + 60) * 1000;
    expect(readSessionToken(createSessionToken("user-123", issuedAt))).toBeNull();
  });

  it("rejects malformed or missing tokens", () => {
    expect(readSessionToken(undefined)).toBeNull();
    expect(readSessionToken("garbage")).toBeNull();
    expect(readSessionToken("a.b.c")).toBeNull();
  });
});

describe("account store", () => {
  it("creates a user that can then authenticate", () => {
    const store = new AuthStore(":memory:");
    const created = store.createUser("Recruiter@Example.com ", "a-long-password");
    expect(created.email).toBe("recruiter@example.com");

    const found = store.findByEmail("recruiter@example.com");
    expect(found?.id).toBe(created.id);
    expect(verifyPassword("a-long-password", found!.passwordHash)).toBe(true);
  });

  it("closes registration once the workspace has an owner", () => {
    const store = new AuthStore(":memory:");
    expect(signupAllowed(store)).toBe(true);

    store.createUser("owner@example.com", "a-long-password");
    expect(signupAllowed(store)).toBe(false);

    process.env.CODEPROOF_ALLOW_SIGNUP = "true";
    expect(signupAllowed(store)).toBe(true);
  });
});
