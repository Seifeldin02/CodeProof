import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setAccountsDatabaseForTests } from "@/features/accounts/database";
import { getProfile, markOnboarded } from "@/features/accounts/profiles";
import { openTestAccounts } from "@/features/accounts/test-support";
import { createOrganization, getWorkspace, inviteMember } from "@/features/organizations/service";
import type { SqlDatabase } from "@/features/persistence/sql";
import { finishSignIn, publicOrigin, safeNextPath } from "./finish-sign-in";
import { readSessionToken } from "./session";
import type { AuthStore, AuthUser } from "./store";

const shared = vi.hoisted(() => ({ auth: null as unknown }));

vi.mock("./store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./store")>()),
  getAuthStore: () => shared.auth,
}));

let auth: AuthStore;
let database: SqlDatabase;
let close: () => void;

beforeEach(async () => {
  ({ auth, database, close } = await openTestAccounts());
  shared.auth = auth;
  setAccountsDatabaseForTests(database);
});

afterEach(() => {
  setAccountsDatabaseForTests(null);
  close();
  vi.unstubAllEnvs();
});

const account = (name: string): Promise<AuthUser> => auth.createUser(`${name}@example.test`, "a-long-enough-password");

/** An organisation with an open invitation for the given address. */
async function invitationFor(email: string): Promise<string> {
  const admin = await account("amina");
  const created = await createOrganization({ database, auth }, admin.id, { name: "Riyadh Systems", kind: "company" });
  if (!created.ok) throw new Error(created.code);
  const invited = await inviteMember({ database, auth }, admin.id, { email });
  if (!invited.ok) throw new Error(invited.code);
  return invited.token;
}

describe("where a sign-in may send someone", () => {
  it("keeps a path on this site and replaces anything else", () => {
    expect(safeNextPath("/candidates?stage=review")).toBe("/candidates?stage=review");
    for (const value of ["https://elsewhere.example/", "//elsewhere.example", "/\\elsewhere.example", "candidates", "/a\r\nSet-Cookie: x=1", "", null, undefined, `/${"a".repeat(500)}`]) {
      expect(safeNextPath(value)).toBe("/");
    }
    expect(safeNextPath("https://elsewhere.example/", "/review")).toBe("/review");
  });

  it("reads the site's address from the request unless one is configured", () => {
    const forwarded = new Request("http://10.0.0.5:3000/api/x", { headers: { "x-forwarded-host": "app.codeproof.example, proxy.internal", "x-forwarded-proto": "https" } });
    expect(publicOrigin(forwarded)).toBe("https://app.codeproof.example");
    expect(publicOrigin(new Request("http://localhost:3000/api/x"))).toBe("http://localhost:3000");

    vi.stubEnv("CODEPROOF_PUBLIC_URL", "https://codeproof.example/");
    expect(publicOrigin(forwarded)).toBe("https://codeproof.example");
    // A value with a path is not an origin, so it is ignored rather than trusted.
    vi.stubEnv("CODEPROOF_PUBLIC_URL", "https://codeproof.example/app");
    expect(publicOrigin(forwarded)).toBe("https://app.codeproof.example");
  });
});

describe("finishing a sign-in", () => {
  it("records it, issues a session, and sends a first-time visitor to the welcome step", async () => {
    const user = await account("sara");
    const finished = await finishSignIn({ user, method: "email_code", next: "/analyze" });

    expect(finished).toMatchObject({ destination: "/welcome?next=%2Fanalyze", joinedOrganization: null });
    expect(readSessionToken(finished.sessionToken)).toBe(user.id);
    expect(await getProfile(database.runner, user.id)).toMatchObject({ lastSignInMethod: "email_code" });
    expect((await getProfile(database.runner, user.id)).emailVerifiedAt).not.toBeNull();
    expect((await auth.findById(user.id))?.lastActivityAt).not.toBeNull();
  });

  it("sends a returning visitor where they were going, and never off the site", async () => {
    const user = await account("sara");
    await markOnboarded(database.runner, user.id);
    expect((await finishSignIn({ user, method: "google", next: "/review" })).destination).toBe("/review");
    expect((await finishSignIn({ user, method: "google", next: "https://elsewhere.example/" })).destination).toBe("/");
  });

  it("does not treat a password as proof of the address", async () => {
    const user = await account("sara");
    await finishSignIn({ user, method: "password", next: "/" });
    expect((await getProfile(database.runner, user.id)).emailVerifiedAt).toBeNull();

    const token = await invitationFor(user.email);
    expect(await finishSignIn({ user, method: "password", next: "/", invite: token })).toMatchObject({ joinedOrganization: null });
    expect(await getWorkspace(database.runner, user.id)).toBeNull();
  });

  it("accepts the invitation being answered and sends the person to their team, not back to the used link", async () => {
    const returning = await account("sara");
    await markOnboarded(database.runner, returning.id);
    const token = await invitationFor(returning.email);
    expect(await finishSignIn({ user: returning, method: "email_code", next: `/join/${token}`, invite: token })).toMatchObject({ destination: "/team", joinedOrganization: "Riyadh Systems" });
    expect((await getWorkspace(database.runner, returning.id))?.membership.role).toBe("RECRUITER");
  });

  it("takes a first-time visitor who joined through the welcome step and then to their team", async () => {
    const token = await invitationFor("noor@example.test");
    const user = await account("noor");
    expect(await finishSignIn({ user, method: "email_code", next: `/join/${token}`, invite: token })).toMatchObject({ destination: "/welcome?next=%2Fteam", joinedOrganization: "Riyadh Systems" });
  });

  it("leaves someone signed in but outside when the invitation was for another address", async () => {
    const token = await invitationFor("noor@example.test");
    const other = await account("khalid");
    await markOnboarded(database.runner, other.id);
    expect(await finishSignIn({ user: other, method: "email_code", next: `/join/${token}`, invite: token })).toMatchObject({ destination: `/join/${token}`, joinedOrganization: null });
    expect(await getWorkspace(database.runner, other.id)).toBeNull();
  });
});
