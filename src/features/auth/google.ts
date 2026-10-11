import { createHash, createHmac, createPublicKey, randomBytes, timingSafeEqual, verify as verifySignature, type JsonWebKey } from "node:crypto";

/**
 * Sign in with Google, written against Google's published OpenID Connect
 * endpoints with no SDK.
 *
 * The browser is sent to Google with a one-time `state`, a `nonce` and a PKCE
 * challenge. The matching secrets travel in a signed, short-lived cookie.
 * Google returns a code, the server exchanges it for an ID token, and the
 * token is accepted only when its signature, issuer, audience, expiry and
 * nonce all check out and Google says the email address is verified.
 */

export const GOOGLE_ENDPOINTS = {
  authorize: "https://accounts.google.com/o/oauth2/v2/auth",
  token: "https://oauth2.googleapis.com/token",
  keys: "https://www.googleapis.com/oauth2/v3/certs",
} as const;

const ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);
const FLOW_LIFETIME_MS = 10 * 60_000;
const CLOCK_SKEW_SECONDS = 60;
const KEY_CACHE_MS = 60 * 60_000;
const TIMEOUT_MS = 10_000;
const MAX_TOKEN_LENGTH = 8_192;

export const GOOGLE_FLOW_COOKIE = process.env.NODE_ENV === "production" ? "__Secure-codeproof_oauth" : "codeproof_oauth";
export const GOOGLE_FLOW_COOKIE_PATH = "/api/auth/google";
export const GOOGLE_FLOW_MAX_AGE_SECONDS = FLOW_LIFETIME_MS / 1000;

export interface GoogleFlow {
  state: string;
  nonce: string;
  verifier: string;
  /** Same-site path to open after signing in. */
  next: string;
  /** An organisation invitation the person was answering, if any. */
  invite: string | null;
  issuedAt: number;
}

const token = (bytes = 32): string => randomBytes(bytes).toString("base64url");

export function beginGoogleFlow(input: { clientId: string; redirectUri: string; next: string; invite: string | null; now?: number }): { url: string; flow: GoogleFlow } {
  const flow: GoogleFlow = { state: token(), nonce: token(), verifier: token(48), next: input.next, invite: input.invite, issuedAt: input.now ?? Date.now() };
  const url = new URL(GOOGLE_ENDPOINTS.authorize);
  url.search = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state: flow.state,
    nonce: flow.nonce,
    code_challenge: createHash("sha256").update(flow.verifier).digest("base64url"),
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return { url: url.toString(), flow };
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(`google-flow\0${payload}`).digest("base64url");
}

/** Packs the flow into a cookie value the browser can hold but not change. */
export function sealGoogleFlow(flow: GoogleFlow, secret: string): string {
  const payload = Buffer.from(JSON.stringify(flow), "utf8").toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

export function openGoogleFlow(sealed: string | undefined, secret: string, now = Date.now()): GoogleFlow | null {
  if (!sealed || sealed.length > 4_096) return null;
  const [payload, signature, extra] = sealed.split(".");
  if (!payload || !signature || extra !== undefined) return null;
  const expected = Buffer.from(sign(payload, secret));
  const provided = Buffer.from(signature);
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) return null;
  try {
    const flow = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<GoogleFlow>;
    if (typeof flow.state !== "string" || typeof flow.nonce !== "string" || typeof flow.verifier !== "string" || typeof flow.next !== "string" || typeof flow.issuedAt !== "number") return null;
    if (now - flow.issuedAt > FLOW_LIFETIME_MS || flow.issuedAt > now + CLOCK_SKEW_SECONDS * 1000) return null;
    return { state: flow.state, nonce: flow.nonce, verifier: flow.verifier, next: flow.next, invite: typeof flow.invite === "string" ? flow.invite : null, issuedAt: flow.issuedAt };
  } catch {
    return null;
  }
}

export function sameState(expected: string, provided: string | null): boolean {
  if (!provided) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(provided);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Exchanges the returned code for an ID token. Null means Google refused or could not be reached. */
export async function exchangeGoogleCode(
  input: { code: string; verifier: string; clientId: string; clientSecret: string; redirectUri: string },
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  try {
    const response = await fetchImpl(GOOGLE_ENDPOINTS.token, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: input.code,
        code_verifier: input.verifier,
        client_id: input.clientId,
        client_secret: input.clientSecret,
        redirect_uri: input.redirectUri,
      }).toString(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { id_token?: unknown };
    return typeof body.id_token === "string" && body.id_token.length <= MAX_TOKEN_LENGTH ? body.id_token : null;
  } catch {
    return null;
  }
}

interface SigningKey extends JsonWebKey {
  kid?: string;
  alg?: string;
  use?: string;
}

const keyCache = globalThis as typeof globalThis & { codeproofGoogleKeys?: { keys: SigningKey[]; fetchedAt: number } };

async function signingKeys(fetchImpl: typeof fetch, now: number, refresh: boolean): Promise<SigningKey[]> {
  const cached = keyCache.codeproofGoogleKeys;
  if (cached && !refresh && now - cached.fetchedAt < KEY_CACHE_MS) return cached.keys;
  const response = await fetchImpl(GOOGLE_ENDPOINTS.keys, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error("Google signing keys are unavailable.");
  const body = (await response.json()) as { keys?: SigningKey[] };
  const keys = Array.isArray(body.keys) ? body.keys.filter((key) => key.kty === "RSA" && typeof key.kid === "string") : [];
  keyCache.codeproofGoogleKeys = { keys, fetchedAt: now };
  return keys;
}

/** Forgets cached signing keys. For tests. */
export function resetGoogleKeyCache(): void {
  keyCache.codeproofGoogleKeys = undefined;
}

export interface GoogleIdentity {
  /** Google's stable identifier for the account. It does not change when the address does. */
  subject: string;
  email: string;
  name: string | null;
}

function decodeSegment(segment: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

/** Returns who the token identifies, or null if any check fails. */
export async function verifyGoogleIdToken(
  idToken: string,
  expected: { clientId: string; nonce: string; now?: number },
  fetchImpl: typeof fetch = fetch,
): Promise<GoogleIdentity | null> {
  if (idToken.length > MAX_TOKEN_LENGTH) return null;
  const parts = idToken.split(".");
  if (parts.length !== 3) return null;
  const [headerSegment, payloadSegment, signatureSegment] = parts;
  const header = decodeSegment(headerSegment);
  const claims = decodeSegment(payloadSegment);
  if (!header || !claims || header.alg !== "RS256" || typeof header.kid !== "string") return null;

  const now = expected.now ?? Date.now();
  let verified = false;
  try {
    // Google rotates keys, so an unknown key id is looked up once more before giving up.
    for (const refresh of [false, true]) {
      const key = (await signingKeys(fetchImpl, now, refresh)).find((candidate) => candidate.kid === header.kid);
      if (!key) continue;
      verified = verifySignature(
        "RSA-SHA256",
        Buffer.from(`${headerSegment}.${payloadSegment}`),
        createPublicKey({ key, format: "jwk" }),
        Buffer.from(signatureSegment, "base64url"),
      );
      break;
    }
  } catch {
    return null;
  }
  if (!verified) return null;

  const seconds = Math.floor(now / 1000);
  const audience = claims.aud;
  const audienceMatches = audience === expected.clientId || (Array.isArray(audience) && audience.length === 1 && audience[0] === expected.clientId);
  if (typeof claims.iss !== "string" || !ISSUERS.has(claims.iss) || !audienceMatches) return null;
  if (typeof claims.exp !== "number" || claims.exp < seconds - CLOCK_SKEW_SECONDS) return null;
  if (typeof claims.iat !== "number" || claims.iat > seconds + CLOCK_SKEW_SECONDS) return null;
  if (typeof claims.nonce !== "string" || !sameState(expected.nonce, claims.nonce)) return null;
  if (claims.email_verified !== true && claims.email_verified !== "true") return null;
  if (typeof claims.sub !== "string" || !claims.sub || claims.sub.length > 255) return null;
  if (typeof claims.email !== "string" || claims.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(claims.email)) return null;

  const name = typeof claims.name === "string" ? claims.name.replace(/\s+/g, " ").trim().slice(0, 80) : "";
  return { subject: claims.sub, email: claims.email.trim().toLowerCase(), name: name || null };
}

/** The address Google must send the browser back to. It has to be registered in the Google console. */
export function googleRedirectUri(origin: string): string {
  return `${origin}/api/auth/google/callback`;
}
