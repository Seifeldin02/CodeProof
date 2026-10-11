import { createHash, generateKeyPairSync, sign as signData, type KeyObject } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  beginGoogleFlow,
  exchangeGoogleCode,
  GOOGLE_ENDPOINTS,
  googleRedirectUri,
  openGoogleFlow,
  resetGoogleKeyCache,
  sameState,
  sealGoogleFlow,
  verifyGoogleIdToken,
} from "./google";

const CLIENT_ID = "client-123.apps.googleusercontent.com";
const NOW = Date.parse("2026-10-12T09:00:00.000Z");
const SECONDS = Math.floor(NOW / 1000);

const google = generateKeyPairSync("rsa", { modulusLength: 2048 });
const stranger = generateKeyPairSync("rsa", { modulusLength: 2048 });
const publicJwk = (key: KeyObject, kid: string) => ({ ...key.export({ format: "jwk" }), kid, alg: "RS256", use: "sig" });

function jwt(claims: Record<string, unknown>, options: { key?: KeyObject; kid?: string; alg?: string } = {}): string {
  const header = Buffer.from(JSON.stringify({ alg: options.alg ?? "RS256", kid: options.kid ?? "key-1", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature = signData("RSA-SHA256", Buffer.from(`${header}.${payload}`), options.key ?? google.privateKey).toString("base64url");
  return `${header}.${payload}.${signature}`;
}

const validClaims = (overrides: Record<string, unknown> = {}) => ({
  iss: "https://accounts.google.com",
  aud: CLIENT_ID,
  sub: "1087654321",
  email: "Amina@Example.test",
  email_verified: true,
  name: "  Amina   Hassan ",
  nonce: "nonce-1",
  iat: SECONDS - 5,
  exp: SECONDS + 3600,
  ...overrides,
});

const keysResponse = (...keys: unknown[]) => new Response(JSON.stringify({ keys }), { status: 200, headers: { "content-type": "application/json" } });
const keyServer = () => vi.fn(async () => keysResponse(publicJwk(google.publicKey, "key-1")));
const check = (token: string, fetchImpl: typeof fetch = keyServer(), nonce = "nonce-1") => verifyGoogleIdToken(token, { clientId: CLIENT_ID, nonce, now: NOW }, fetchImpl);

beforeEach(() => resetGoogleKeyCache());

describe("starting the Google flow", () => {
  it("sends the browser to Google with a state, a nonce and a PKCE challenge", () => {
    const { url, flow } = beginGoogleFlow({ clientId: CLIENT_ID, redirectUri: googleRedirectUri("https://codeproof.example"), next: "/review", invite: null, now: NOW });
    const target = new URL(url);
    expect(`${target.origin}${target.pathname}`).toBe(GOOGLE_ENDPOINTS.authorize);
    expect(Object.fromEntries(target.searchParams)).toEqual({
      client_id: CLIENT_ID,
      redirect_uri: "https://codeproof.example/api/auth/google/callback",
      response_type: "code",
      scope: "openid email profile",
      state: flow.state,
      nonce: flow.nonce,
      code_challenge: createHash("sha256").update(flow.verifier).digest("base64url"),
      code_challenge_method: "S256",
      prompt: "select_account",
    });
    expect(url).not.toContain(flow.verifier);
    expect(new Set([flow.state, flow.nonce, flow.verifier]).size).toBe(3);
  });

  it("keeps the flow in a cookie the browser cannot change or keep for long", () => {
    const { flow } = beginGoogleFlow({ clientId: CLIENT_ID, redirectUri: "https://x/cb", next: "/review", invite: "invite-token", now: NOW });
    const sealed = sealGoogleFlow(flow, "secret");
    expect(openGoogleFlow(sealed, "secret", NOW + 60_000)).toEqual(flow);
    expect(openGoogleFlow(sealed, "another-secret", NOW)).toBeNull();
    expect(openGoogleFlow(sealed, "secret", NOW + 10 * 60_000 + 1)).toBeNull();
    expect(openGoogleFlow(sealed, "secret", NOW - 5 * 60_000)).toBeNull();
    expect(openGoogleFlow(undefined, "secret", NOW)).toBeNull();

    const [payload, signature] = sealed.split(".");
    const changed = Buffer.from(JSON.stringify({ ...flow, next: "https://evil.example" })).toString("base64url");
    expect(openGoogleFlow(`${changed}.${signature}`, "secret", NOW)).toBeNull();
    expect(openGoogleFlow(`${payload}.${signature}.extra`, "secret", NOW)).toBeNull();
    expect(sameState(flow.state, flow.state)).toBe(true);
    expect(sameState(flow.state, `${flow.state}x`)).toBe(false);
    expect(sameState(flow.state, null)).toBe(false);
  });
});

describe("exchanging the code", () => {
  it("posts the code with the PKCE verifier and returns the ID token", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id_token: "header.payload.signature" }), { status: 200 }));
    const idToken = await exchangeGoogleCode({ code: "code-1", verifier: "verifier-1", clientId: CLIENT_ID, clientSecret: "s3cret", redirectUri: "https://x/cb" }, fetchImpl as unknown as typeof fetch);
    expect(idToken).toBe("header.payload.signature");
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(GOOGLE_ENDPOINTS.token);
    expect(Object.fromEntries(new URLSearchParams(String(init.body)))).toEqual({
      grant_type: "authorization_code", code: "code-1", code_verifier: "verifier-1", client_id: CLIENT_ID, client_secret: "s3cret", redirect_uri: "https://x/cb",
    });
  });

  it("returns nothing when Google refuses or cannot be reached", async () => {
    const input = { code: "c", verifier: "v", clientId: CLIENT_ID, clientSecret: "s", redirectUri: "https://x/cb" };
    expect(await exchangeGoogleCode(input, (async () => new Response("{}", { status: 400 })) as unknown as typeof fetch)).toBeNull();
    expect(await exchangeGoogleCode(input, (async () => new Response("{}", { status: 200 })) as unknown as typeof fetch)).toBeNull();
    expect(await exchangeGoogleCode(input, (async () => { throw new Error("offline"); }) as unknown as typeof fetch)).toBeNull();
  });
});

describe("accepting an ID token", () => {
  it("returns the verified identity", async () => {
    expect(await check(jwt(validClaims()))).toEqual({ subject: "1087654321", email: "amina@example.test", name: "Amina Hassan" });
    expect(await check(jwt(validClaims({ iss: "accounts.google.com", email_verified: "true", name: undefined })))).toEqual({ subject: "1087654321", email: "amina@example.test", name: null });
  });

  it("refuses a token that fails any check", async () => {
    const refused: Array<[string, string]> = [
      ["another audience", jwt(validClaims({ aud: "someone-else.apps.googleusercontent.com" }))],
      ["several audiences", jwt(validClaims({ aud: [CLIENT_ID, "someone-else"] }))],
      ["another issuer", jwt(validClaims({ iss: "https://accounts.example.com" }))],
      ["expired", jwt(validClaims({ exp: SECONDS - 3600 }))],
      ["issued in the future", jwt(validClaims({ iat: SECONDS + 3600 }))],
      ["another nonce", jwt(validClaims({ nonce: "nonce-2" }))],
      ["unverified address", jwt(validClaims({ email_verified: false }))],
      ["no address", jwt(validClaims({ email: undefined }))],
      ["no subject", jwt(validClaims({ sub: "" }))],
      ["signed by someone else", jwt(validClaims(), { key: stranger.privateKey })],
      ["another algorithm", jwt(validClaims(), { alg: "HS256" })],
      ["unsigned", `${jwt(validClaims()).split(".").slice(0, 2).join(".")}.`],
      ["not a token", "not-a-token"],
    ];
    for (const [reason, token] of refused) expect(await check(token), reason).toBeNull();

    const [header, , signature] = jwt(validClaims()).split(".");
    const forgedPayload = Buffer.from(JSON.stringify(validClaims({ email: "attacker@example.test" }))).toString("base64url");
    expect(await check(`${header}.${forgedPayload}.${signature}`)).toBeNull();
  });

  it("looks the key up again when Google has rotated it, and gives up if it is still unknown", async () => {
    const rotated = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(keysResponse(publicJwk(google.publicKey, "key-1")))
      .mockResolvedValueOnce(keysResponse(publicJwk(rotated.publicKey, "key-2")));
    expect(await check(jwt(validClaims(), { key: rotated.privateKey, kid: "key-2" }), fetchImpl as unknown as typeof fetch)).toMatchObject({ email: "amina@example.test" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    resetGoogleKeyCache();
    expect(await check(jwt(validClaims(), { kid: "key-9" }))).toBeNull();
    resetGoogleKeyCache();
    expect(await check(jwt(validClaims()), (async () => new Response("", { status: 503 })) as unknown as typeof fetch)).toBeNull();
  });

  it("reuses the signing keys for an hour", async () => {
    const fetchImpl = keyServer();
    await check(jwt(validClaims()), fetchImpl);
    await check(jwt(validClaims()), fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await verifyGoogleIdToken(jwt(validClaims({ exp: SECONDS + 3 * 3600 })), { clientId: CLIENT_ID, nonce: "nonce-1", now: NOW + 61 * 60_000 }, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
