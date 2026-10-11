import { describe, expect, it } from "vitest";
import { googleClient, signInFormOptions, signInOptions } from "./options";

const MAIL = { CODEPROOF_MAIL_FROM: "CodeProof <no-reply@example.test>", RESEND_API_KEY: "test-key" };
const TWILIO = { TWILIO_ACCOUNT_SID: "AC-test", TWILIO_AUTH_TOKEN: "test-token", TWILIO_FROM: "+15550000000" };

describe("which ways of signing in a deployment offers", () => {
  it("keeps the password and nothing else when nothing is configured", () => {
    expect(signInOptions({ NODE_ENV: "production" })).toMatchObject({ emailCode: false, emailCodeMode: "off", google: false, sms: false, password: true });
  });

  it("offers codes and drops the password once a mail provider can deliver them", () => {
    expect(signInOptions({ NODE_ENV: "production", ...MAIL })).toMatchObject({ emailCode: true, emailCodeMode: "provider", password: false });
    expect(signInOptions({ NODE_ENV: "production", CODEPROOF_MAIL_FROM: "no-reply@example.test", BREVO_API_KEY: "test-key" })).toMatchObject({ emailCodeMode: "provider", password: false });
  });

  it("needs both a sender and a key before it counts a mail provider", () => {
    expect(signInOptions({ NODE_ENV: "production", RESEND_API_KEY: "test-key" })).toMatchObject({ emailCodeMode: "off", password: true });
    expect(signInOptions({ NODE_ENV: "production", CODEPROOF_MAIL_FROM: "not an address", RESEND_API_KEY: "test-key" })).toMatchObject({ emailCodeMode: "off", password: true });
  });

  it("shows codes on screen in local development and keeps the password beside them", () => {
    expect(signInOptions({ NODE_ENV: "development" })).toMatchObject({ emailCode: true, emailCodeMode: "development", password: true });
    expect(signInFormOptions({ NODE_ENV: "development" })).toMatchObject({ emailCode: true, development: true, password: true });
    // A code is never shown on screen outside development.
    expect(signInFormOptions({ NODE_ENV: "production" }).development).toBe(false);
    expect(signInFormOptions({ NODE_ENV: "test" }).development).toBe(false);
  });

  it("lets an operator force the password on or off", () => {
    expect(signInOptions({ NODE_ENV: "production", ...MAIL, CODEPROOF_PASSWORD_SIGN_IN: " TRUE " }).password).toBe(true);
    expect(signInOptions({ NODE_ENV: "development", CODEPROOF_PASSWORD_SIGN_IN: "false" }).password).toBe(false);
    expect(signInOptions({ NODE_ENV: "production", ...MAIL, CODEPROOF_PASSWORD_SIGN_IN: "sometimes" }).password).toBe(false);
  });

  it("adds Google only with both halves of its client", () => {
    expect(googleClient({ GOOGLE_CLIENT_ID: "id" })).toBeNull();
    expect(signInOptions({ NODE_ENV: "production", GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: " " }).google).toBe(false);
    expect(signInOptions({ NODE_ENV: "production", GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret" })).toMatchObject({ google: true, password: true });
  });

  it("offers text messages only when codes are on and all three Twilio values are set", () => {
    expect(signInOptions({ NODE_ENV: "production", ...MAIL, ...TWILIO }).sms).toBe(true);
    expect(signInOptions({ NODE_ENV: "production", ...TWILIO }).sms).toBe(false);
    expect(signInOptions({ NODE_ENV: "production", ...MAIL, ...TWILIO, TWILIO_FROM: "" }).sms).toBe(false);
  });
});
