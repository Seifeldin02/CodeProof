import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openTestAccounts } from "@/features/accounts/test-support";
import type { SqlDatabase } from "@/features/persistence/sql";
import { CODE_RULES, generateCode, issueCode, liveCodeCount, normalizeCode, verifyCode } from "./codes";

const SECRET = "test-secret";
const EMAIL = "amina@example.test";
const START = Date.parse("2026-10-12T09:00:00.000Z");

let database: SqlDatabase;
let close: () => void;

beforeEach(async () => {
  ({ database, close } = await openTestAccounts());
});
afterEach(() => close());

async function issue(now = START, subject = EMAIL) {
  const issued = await issueCode(database.runner, { purpose: "sign_in", channel: "email", subject, secret: SECRET, now });
  if (!issued.ok) throw new Error(`expected a code, got ${issued.reason}`);
  return issued;
}

const check = (code: string, now = START + 1_000, subject = EMAIL) =>
  verifyCode(database, { purpose: "sign_in", subject, code, secret: SECRET, now });

const wrongFor = (code: string) => (code === "000000" ? "111111" : "000000");

describe("one-time codes", () => {
  it("are six digits and tolerate the spaces and dashes people type", () => {
    for (let index = 0; index < 50; index += 1) expect(generateCode()).toMatch(/^\d{6}$/);
    expect(normalizeCode("123 456")).toBe("123456");
    expect(normalizeCode("123-456")).toBe("123456");
    expect(normalizeCode("12345")).toBeNull();
    expect(normalizeCode("12345a")).toBeNull();
    expect(normalizeCode("1234567")).toBeNull();
  });

  it("store neither the code nor the address", async () => {
    const issued = await issue();
    const rows = await database.runner.all<Record<string, unknown>>("SELECT * FROM {auth_codes}");
    expect(rows).toHaveLength(1);
    const stored = JSON.stringify(rows);
    expect(stored).not.toContain(issued.code);
    expect(stored).not.toContain(EMAIL);
    expect(Date.parse(issued.expiresAt) - START).toBe(CODE_RULES.lifetimeMs);
  });

  it("work once", async () => {
    const issued = await issue();
    expect(await check(issued.code)).toEqual({ valid: true, channel: "email" });
    expect(await check(issued.code)).toEqual({ valid: false });
    expect(await liveCodeCount(database.runner, "sign_in", EMAIL, START + 2_000)).toBe(0);
  });

  it("are tied to the address and the purpose they were issued for", async () => {
    const issued = await issue();
    expect(await check(issued.code, START + 1_000, "someone-else@example.test")).toEqual({ valid: false });
    expect(await verifyCode(database, { purpose: "phone_verification", subject: EMAIL, code: issued.code, secret: SECRET, now: START + 1_000 })).toEqual({ valid: false });
    // A different server secret cannot confirm the code either.
    expect(await verifyCode(database, { purpose: "sign_in", subject: EMAIL, code: issued.code, secret: "another-secret", now: START + 1_000 })).toEqual({ valid: false });
    expect(await check(issued.code, START + 2_000, "  AMINA@example.test ")).toEqual({ valid: true, channel: "email" });
  });

  it("stop working after ten minutes", async () => {
    const issued = await issue();
    expect(await check(issued.code, START + CODE_RULES.lifetimeMs)).toEqual({ valid: false });
  });

  it("allow five guesses, then refuse even the right code", async () => {
    const issued = await issue();
    for (let attempt = 0; attempt < CODE_RULES.maxAttempts; attempt += 1) {
      expect(await check(wrongFor(issued.code))).toEqual({ valid: false });
    }
    expect(await check(issued.code)).toEqual({ valid: false });
  });

  it("do not count input that could never be a code", async () => {
    const issued = await issue();
    for (let attempt = 0; attempt < 20; attempt += 1) expect(await check("not a code")).toEqual({ valid: false });
    expect(await check(issued.code)).toEqual({ valid: true, channel: "email" });
  });

  it("are replaced by a newer code for the same address", async () => {
    const first = await issue(START);
    const second = await issue(START + CODE_RULES.resendAfterMs);
    if (first.code !== second.code) expect(await check(first.code, START + CODE_RULES.resendAfterMs + 1_000)).toEqual({ valid: false });
    // The guess above was counted against the newer code, which still has guesses left.
    expect(await check(second.code, START + CODE_RULES.resendAfterMs + 2_000)).toEqual({ valid: true, channel: "email" });
  });

  it("cannot be requested again within a minute", async () => {
    await issue(START);
    expect(await issueCode(database.runner, { purpose: "sign_in", channel: "email", subject: EMAIL, secret: SECRET, now: START + 20_000 }))
      .toEqual({ ok: false, reason: "too_soon", retryAfterSeconds: 40 });
    // Another address is not affected.
    await issue(START + 20_000, "omar@example.test");
  });

  it("are limited to five per address in half an hour", async () => {
    for (let index = 0; index < CODE_RULES.maxPerWindow; index += 1) await issue(START + index * CODE_RULES.resendAfterMs);
    const blockedAt = START + CODE_RULES.maxPerWindow * CODE_RULES.resendAfterMs;
    const blocked = await issueCode(database.runner, { purpose: "sign_in", channel: "email", subject: EMAIL, secret: SECRET, now: blockedAt });
    expect(blocked).toEqual({ ok: false, reason: "too_many", retryAfterSeconds: (START + CODE_RULES.windowMs - blockedAt) / 1000 });
    // Once the oldest request leaves the window, a code can be issued again.
    await issue(START + CODE_RULES.windowMs + 1_000);
  });

  it("remove day-old rows whenever a code is issued", async () => {
    await issue(START);
    await issue(START + CODE_RULES.retentionMs + 60_000, "omar@example.test");
    const rows = await database.runner.all("SELECT id FROM {auth_codes}");
    expect(rows).toHaveLength(1);
  });
});
