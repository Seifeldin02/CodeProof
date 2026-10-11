import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setVerifiedPhone } from "@/features/accounts/profiles";
import { openTestAccounts } from "@/features/accounts/test-support";
import { CODE_RULES, issueCode } from "@/features/auth-codes/codes";
import type { SqlDatabase } from "@/features/persistence/sql";
import type { MailMessage, MailProvider } from "@/services/messaging/mail";
import type { SmsProvider } from "@/services/messaging/sms";
import { accountForVerifiedEmail, normalizeEmail, requestSignInCode, verifySignInCode, type CodeSignInDependencies } from "./code-sign-in";
import { type AuthStore, verifyPassword } from "./store";

const SECRET = "test-secret";
const NOW = Date.parse("2026-10-12T09:00:00.000Z");

let auth: AuthStore;
let database: SqlDatabase;
let close: () => void;

beforeEach(async () => {
  ({ auth, database, close } = await openTestAccounts());
});
afterEach(() => close());

function mailbox(): { provider: MailProvider; sent: MailMessage[] } {
  const sent: MailMessage[] = [];
  return { sent, provider: { name: "resend", send: async (message) => { sent.push(message); } } };
}

function deps(overrides: Partial<CodeSignInDependencies> = {}): CodeSignInDependencies {
  return { database, auth, mail: null, sms: null, development: false, secret: SECRET, signupAllowed: true, now: NOW, ...overrides };
}

const codeIn = (message: MailMessage) => message.subject.match(/\d{6}/)?.[0] ?? "";

describe("asking for a sign-in code", () => {
  it("accepts an address in any letter case and rejects what is not an address", () => {
    expect(normalizeEmail("  Amina@Example.Test ")).toBe("amina@example.test");
    expect(normalizeEmail("amina")).toBeNull();
    expect(normalizeEmail("amina@example")).toBeNull();
    expect(normalizeEmail(`${"a".repeat(250)}@example.test`)).toBeNull();
  });

  it("is unavailable until a mail provider is configured", async () => {
    expect(await requestSignInCode({ email: "amina@example.test", locale: "en" }, deps())).toEqual({ ok: false, code: "CODE_SIGN_IN_UNAVAILABLE" });
    expect(await requestSignInCode({ email: "not an address", locale: "en" }, deps())).toEqual({ ok: false, code: "INVALID_EMAIL" });
  });

  it("sends the code in the reader's language and never returns it to the browser", async () => {
    const { provider, sent } = mailbox();
    const english = await requestSignInCode({ email: "Amina@example.test", locale: "en" }, deps({ mail: provider }));
    expect(english).toEqual({ ok: true, channel: "email", expiresInSeconds: 600, resendAfterSeconds: 60 });
    expect(sent[0].to).toBe("amina@example.test");
    expect(sent[0].subject).toMatch(/^\d{6} is your CodeProof sign-in code$/);
    expect(sent[0].text).toContain("10 minutes");
    expect(sent[0].html).toContain('dir="ltr"');

    await requestSignInCode({ email: "omar@example.test", locale: "ar" }, deps({ mail: provider }));
    expect(sent[1].subject).toContain("رمز الدخول");
    expect(sent[1].html).toContain('<html lang="ar" dir="rtl">');
    expect(sent[1].text).toContain(codeIn(sent[1]));
  });

  it("hands the code back only in development, when nothing can send it", async () => {
    const result = await requestSignInCode({ email: "amina@example.test", locale: "en" }, deps({ development: true }));
    expect(result).toMatchObject({ ok: true, channel: "email" });
    expect(result.ok && result.developmentCode).toMatch(/^\d{6}$/);

    const { provider } = mailbox();
    const real = await requestSignInCode({ email: "omar@example.test", locale: "en" }, deps({ development: true, mail: provider }));
    expect(real.ok && "developmentCode" in real).toBe(false);
  });

  it("answers the same way for an address that cannot sign in, and sends nothing", async () => {
    const { provider, sent } = mailbox();
    const closed = deps({ mail: provider, signupAllowed: false });
    expect(await requestSignInCode({ email: "stranger@example.test", locale: "en" }, closed))
      .toEqual({ ok: true, channel: "email", expiresInSeconds: 600, resendAfterSeconds: 60 });

    const suspended = await auth.createUser("suspended@example.test", "a-long-enough-password");
    auth.db.prepare("UPDATE users SET lifecycle_state = 'suspended' WHERE id = ?").run(suspended.id);
    expect(await requestSignInCode({ email: "suspended@example.test", locale: "en" }, deps({ mail: provider, development: true })))
      .toEqual({ ok: true, channel: "email", expiresInSeconds: 600, resendAfterSeconds: 60 });
    expect(sent).toEqual([]);
  });

  it("limits how often a code can be requested, whoever asks", async () => {
    const { provider, sent } = mailbox();
    await requestSignInCode({ email: "amina@example.test", locale: "en" }, deps({ mail: provider }));
    expect(await requestSignInCode({ email: "amina@example.test", locale: "en" }, deps({ mail: provider, now: NOW + 10_000 })))
      .toEqual({ ok: false, code: "CODE_RECENTLY_SENT", retryAfterSeconds: 50 });
    expect(sent).toHaveLength(1);
  });

  it("withdraws the code when the provider refuses the message", async () => {
    const failing: MailProvider = { name: "resend", send: vi.fn(async () => { throw new Error("provider down"); }) };
    expect(await requestSignInCode({ email: "amina@example.test", locale: "en" }, deps({ mail: failing }))).toEqual({ ok: false, code: "DELIVERY_FAILED" });
    // Nothing was delivered, so the address can ask again at once.
    const { provider, sent } = mailbox();
    expect(await requestSignInCode({ email: "amina@example.test", locale: "en" }, deps({ mail: provider, now: NOW + 1_000 }))).toMatchObject({ ok: true });
    expect(sent).toHaveLength(1);
  });

  it("texts the code only to a number the account has verified", async () => {
    const texts: Array<{ to: string; body: string }> = [];
    const sms: SmsProvider = { name: "twilio", send: async (to, body) => { texts.push({ to, body }); } };
    expect(await requestSignInCode({ email: "amina@example.test", channel: "sms", locale: "en" }, deps())).toEqual({ ok: false, code: "CODE_SIGN_IN_UNAVAILABLE" });

    const user = await auth.createUser("amina@example.test", "a-long-enough-password");
    expect(await requestSignInCode({ email: "amina@example.test", channel: "sms", locale: "en" }, deps({ sms }))).toMatchObject({ ok: true, channel: "sms" });
    expect(texts).toEqual([]);

    await setVerifiedPhone(database.runner, user.id, "+966500000001");
    expect(await requestSignInCode({ email: "amina@example.test", channel: "sms", locale: "ar" }, deps({ sms, now: NOW + CODE_RULES.resendAfterMs })))
      .toMatchObject({ ok: true, channel: "sms" });
    expect(texts).toHaveLength(1);
    expect(texts[0].to).toBe("+966500000001");
    expect(texts[0].body).toMatch(/رمز CodeProof: \d{6}/);

    const code = texts[0].body.match(/\d{6}/)?.[0] ?? "";
    expect(await verifySignInCode({ email: "amina@example.test", code }, deps({ sms, now: NOW + CODE_RULES.resendAfterMs + 1_000 })))
      .toMatchObject({ ok: true, created: false, method: "sms_code" });
  });
});

describe("entering the code", () => {
  it("creates the account the first time and signs in to it afterwards", async () => {
    const { provider, sent } = mailbox();
    await requestSignInCode({ email: "amina@example.test", locale: "en" }, deps({ mail: provider }));
    const first = await verifySignInCode({ email: " AMINA@example.test", code: codeIn(sent[0]) }, deps({ mail: provider, now: NOW + 5_000 }));
    expect(first).toMatchObject({ ok: true, created: true, method: "email_code" });
    if (!first.ok) return;
    expect(first.user.email).toBe("amina@example.test");

    // The account has a password nobody knows, so only a code or a linked provider opens it.
    const stored = await auth.findByEmail("amina@example.test");
    expect(stored?.passwordHash.startsWith("scrypt$")).toBe(true);
    expect(verifyPassword("", stored?.passwordHash ?? "")).toBe(false);
    expect(verifyPassword(codeIn(sent[0]), stored?.passwordHash ?? "")).toBe(false);

    await requestSignInCode({ email: "amina@example.test", locale: "en" }, deps({ mail: provider, now: NOW + CODE_RULES.resendAfterMs }));
    const second = await verifySignInCode({ email: "amina@example.test", code: codeIn(sent[1]) }, deps({ mail: provider, now: NOW + CODE_RULES.resendAfterMs + 5_000 }));
    expect(second).toMatchObject({ ok: true, created: false });
    expect(second.ok && second.user.id).toBe(first.user.id);
  });

  it("refuses a wrong code, and a right code used twice", async () => {
    const { provider, sent } = mailbox();
    await requestSignInCode({ email: "amina@example.test", locale: "en" }, deps({ mail: provider }));
    const code = codeIn(sent[0]);
    expect(await verifySignInCode({ email: "amina@example.test", code: code === "000000" ? "111111" : "000000" }, deps())).toEqual({ ok: false, code: "INVALID_CODE" });
    expect(await verifySignInCode({ email: "amina@example.test", code }, deps())).toMatchObject({ ok: true });
    expect(await verifySignInCode({ email: "amina@example.test", code }, deps())).toEqual({ ok: false, code: "INVALID_CODE" });
    expect(await verifySignInCode({ email: "nobody", code }, deps())).toEqual({ ok: false, code: "INVALID_EMAIL" });
  });

  it("does not open a closed workspace or an unavailable account, even with a correct code", async () => {
    const issued = await issueCode(database.runner, { purpose: "sign_in", channel: "email", subject: "stranger@example.test", secret: SECRET, now: NOW });
    expect(issued.ok && await verifySignInCode({ email: "stranger@example.test", code: issued.code }, deps({ signupAllowed: false })))
      .toEqual({ ok: false, code: "REGISTRATION_CLOSED" });
    expect(await auth.findByEmail("stranger@example.test")).toBeNull();

    const user = await auth.createUser("gone@example.test", "a-long-enough-password");
    for (const state of ["suspended", "soft_deleted"]) {
      auth.db.prepare("UPDATE users SET lifecycle_state = ? WHERE id = ?").run(state, user.id);
      expect(await accountForVerifiedEmail("gone@example.test", { auth, signupAllowed: true })).toEqual({ ok: false, code: "ACCOUNT_UNAVAILABLE" });
    }
  });
});
