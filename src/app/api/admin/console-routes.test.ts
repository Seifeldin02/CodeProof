import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setAccountsDatabaseForTests } from "@/features/accounts/database";
import { openTestAccounts } from "@/features/accounts/test-support";
import { SQLiteAdminAuditStore } from "@/features/admin/audit";
import { resetAdminAuthorizationAttemptsForTests } from "@/features/admin/rate-limit";
import { createSessionToken, SESSION_COOKIE } from "@/features/auth/session";
import type { AuthStore, AuthUser } from "@/features/auth/store";
import { getMembership, getOrganization } from "@/features/organizations/store";
import type { SqlDatabase } from "@/features/persistence/sql";
import { POST as accountRoute } from "./accounts/[id]/route";
import { POST as organizationRoute } from "./organizations/[id]/route";
import { POST as organizationsRoute } from "./organizations/route";

/**
 * The owner routes from the request down to the database: who may call them,
 * what they answer, and that each change lands with its audit entry. The
 * accounts, the audit log and the organisation tables share one in-memory
 * connection here, as they share one database in a deployment.
 */

const shared = vi.hoisted(() => ({ auth: null as unknown, audit: null as unknown }));

vi.mock("@/features/auth/store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/auth/store")>()),
  getAuthStore: () => shared.auth,
}));
vi.mock("@/features/admin/store", () => ({ getAdminAuditStore: () => shared.audit }));

const ORIGIN = "http://localhost";
const UNAVAILABLE = { error: { code: "RESOURCE_UNAVAILABLE" } };

let auth: AuthStore;
let database: SqlDatabase;
let audit: SQLiteAdminAuditStore;
let close: () => void;
let owner: AuthUser;
let recruiter: AuthUser;

beforeEach(async () => {
  ({ auth, database, close } = await openTestAccounts());
  audit = new SQLiteAdminAuditStore(auth.db);
  shared.auth = auth;
  shared.audit = audit;
  setAccountsDatabaseForTests(database);
  resetAdminAuthorizationAttemptsForTests();
  owner = await auth.createUser("owner@codeproof.test", "a-long-enough-password");
  auth.db.prepare("UPDATE users SET role = 'ADMIN' WHERE id = ?").run(owner.id);
  recruiter = await auth.createUser("sara@example.test", "a-long-enough-password");
});

afterEach(() => {
  setAccountsDatabaseForTests(null);
  close();
});

function post(path: string, body: unknown, options: { as?: AuthUser | null; origin?: string } = {}): Request {
  const headers = new Headers({ "content-type": "application/json", origin: options.origin ?? ORIGIN });
  const user = options.as === undefined ? owner : options.as;
  if (user) headers.set("cookie", `${SESSION_COOKIE}=${encodeURIComponent(createSessionToken(user.id))}`);
  return new Request(`${ORIGIN}${path}`, { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) });
}

const onAccount = (id: string, body: unknown, options?: Parameters<typeof post>[2]) =>
  accountRoute(post(`/api/admin/accounts/${id}`, body, options), { params: Promise.resolve({ id }) });
const onOrganization = (id: string, body: unknown, options?: Parameters<typeof post>[2]) =>
  organizationRoute(post(`/api/admin/organizations/${id}`, body, options), { params: Promise.resolve({ id }) });
const createOrganization = (body: unknown, options?: Parameters<typeof post>[2]) => organizationsRoute(post("/api/admin/organizations", body, options));

async function newOrganization(): Promise<string> {
  const response = await createOrganization({ name: "Jeddah Talent", kind: "agency", planTierId: "pilot-guided" });
  expect(response.status).toBe(201);
  return ((await response.json()) as { organization: { id: string } }).organization.id;
}

const succeeded = async () => (await audit.list()).filter((entry) => entry.outcome === "succeeded").map((entry) => entry.action);

describe("who may call the owner routes", () => {
  it("answers someone who is not an owner exactly as it answers for something that does not exist", async () => {
    for (const as of [recruiter, null]) {
      for (const response of [
        await onAccount(recruiter.id, { action: "suspend" }, { as }),
        await createOrganization({ name: "Jeddah Talent", kind: "agency", planTierId: "pilot-guided" }, { as }),
        await onOrganization("any-organisation", { action: "suspend" }, { as }),
      ]) {
        expect(response.status).toBe(404);
        expect(await response.json()).toEqual(UNAVAILABLE);
        expect(response.headers.get("cache-control")).toBe("private, no-store");
      }
    }
    expect((await auth.findById(recruiter.id))?.lifecycleState).toBe("active");
    expect(await succeeded()).toEqual([]);

    const missing = await onAccount("no-such-account", { action: "suspend" });
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual(UNAVAILABLE);
  });

  it("refuses a request that carries a claim to authority, even from an owner", async () => {
    const response = await onAccount(recruiter.id, { action: "suspend", role: "ADMIN" });
    expect(response.status).toBe(404);
    expect((await auth.findById(recruiter.id))?.lifecycleState).toBe("active");
  });

  it("refuses a request sent from another site", async () => {
    const response = await onAccount(recruiter.id, { action: "suspend" }, { origin: "https://elsewhere.example" });
    expect(response.status).toBe(403);
    expect((await auth.findById(recruiter.id))?.lifecycleState).toBe("active");
  });

  it("stops serving an owner whose own account is no longer active", async () => {
    auth.db.prepare("UPDATE users SET lifecycle_state = 'suspended' WHERE id = ?").run(owner.id);
    expect((await onAccount(recruiter.id, { action: "suspend" })).status).toBe(404);
  });
});

describe("accounts", () => {
  it("suspends and reactivates an account and records both", async () => {
    const suspended = await onAccount(recruiter.id, { action: "suspend" });
    expect(suspended.status).toBe(200);
    expect(await suspended.json()).toEqual({ lifecycleState: "suspended" });
    expect((await auth.findById(recruiter.id))?.lifecycleState).toBe("suspended");

    expect((await onAccount(recruiter.id, { action: "reactivate" })).status).toBe(200);
    expect(await succeeded()).toEqual(["account_suspended", "account_reactivated"]);
    expect((await audit.list()).at(-1)).toMatchObject({ actorUserId: owner.id, requestMethod: "POST", route: `/api/admin/accounts/${recruiter.id}`, targetId: recruiter.id });
  });

  it("changes a plan, and says why when it cannot", async () => {
    expect((await onAccount(recruiter.id, { action: "plan", planTierId: "pilot-self-serve" })).status).toBe(200);
    expect((await auth.findById(recruiter.id))?.planTierId).toBe("pilot-self-serve");

    const unknown = await onAccount(recruiter.id, { action: "plan", planTierId: "gold" });
    expect([unknown.status, await unknown.json()]).toEqual([400, { error: { code: "UNKNOWN_PLAN" } }]);
    const same = await onAccount(recruiter.id, { action: "plan", planTierId: "pilot-self-serve" });
    expect([same.status, await same.json()]).toEqual([409, { error: { code: "NOTHING_TO_CHANGE" } }]);
    const ownerAccount = await onAccount(owner.id, { action: "remove" });
    expect([ownerAccount.status, await ownerAccount.json()]).toEqual([409, { error: { code: "CANNOT_CHANGE_OWNER" } }]);
  });

  it("rejects an action it does not know and a body it cannot read", async () => {
    expect((await onAccount(recruiter.id, { action: "delete" })).status).toBe(400);
    expect((await onAccount(recruiter.id, "{not json")).status).toBe(400);
    expect(await succeeded()).toEqual([]);
  });
});

describe("organisations", () => {
  it("sets one up, records its subscription, and refuses seats that are not a whole number", async () => {
    const id = await newOrganization();
    const saved = await onOrganization(id, { action: "subscription", planTierId: "pilot-agency", subscriptionStatus: "active", seatLimit: "40", currentPeriodStart: "2026-10-01", currentPeriodEnd: "2026-10-31", notes: "First invoice paid" });
    expect(saved.status).toBe(200);
    expect(await getOrganization(database.runner, id)).toMatchObject({ planTierId: "pilot-agency", subscriptionStatus: "active", seatLimit: 40, currentPeriodEnd: "2026-10-31T00:00:00.000Z", notes: "First invoice paid" });

    for (const seatLimit of ["2.5", "many", 0]) {
      const refused = await onOrganization(id, { action: "subscription", planTierId: "pilot-agency", subscriptionStatus: "active", seatLimit, currentPeriodStart: "", currentPeriodEnd: "", notes: "" });
      expect([refused.status, await refused.json()]).toEqual([400, { error: { code: "INVALID_SEATS" } }]);
    }
    const badDate = await onOrganization(id, { action: "subscription", planTierId: "pilot-agency", subscriptionStatus: "active", seatLimit: "", currentPeriodStart: "", currentPeriodEnd: "2026-10-31T00:00:00.000Z", notes: "" });
    expect(await badDate.json()).toEqual({ error: { code: "INVALID_DATE" } });

    // An empty seat field hands the count back to the plan.
    expect((await onOrganization(id, { action: "subscription", planTierId: "pilot-agency", subscriptionStatus: "active", seatLimit: "", currentPeriodStart: "", currentPeriodEnd: "", notes: "" })).status).toBe(200);
    expect(await getOrganization(database.runner, id)).toMatchObject({ seatLimit: null, currentPeriodStart: null, currentPeriodEnd: null, notes: null });
    expect(await succeeded()).toEqual(["organization_created", "organization_subscription_changed", "organization_subscription_changed"]);
  });

  it("names an existing account as the admin at once", async () => {
    const id = await newOrganization();
    const response = await onOrganization(id, { action: "admin", email: "Sara@Example.test", locale: "ar" });
    expect([response.status, await response.json()]).toEqual([200, { outcome: "assigned", email: "sara@example.test" }]);
    expect(await getMembership(database.runner, recruiter.id)).toMatchObject({ organizationId: id, role: "ORG_ADMIN" });
  });

  it("invites someone who has no account, handing back the link once", async () => {
    const id = await newOrganization();
    const response = await onOrganization(id, { action: "admin", email: "noor@example.test", locale: "en" });
    expect(response.status).toBe(201);
    const body = (await response.json()) as { outcome: string; email: string; link: string; emailed: boolean };
    expect(body).toMatchObject({ outcome: "invited", email: "noor@example.test", emailed: false });
    expect(body.link).toMatch(/^http:\/\/localhost\/join\/[A-Za-z0-9_-]{43}$/);
    expect(JSON.stringify(await audit.list())).not.toContain(body.link.split("/").at(-1));
  });

  it("changes details, pauses and restores, and answers for one that does not exist as for a stranger", async () => {
    const id = await newOrganization();
    expect((await onOrganization(id, { action: "details", name: "Jeddah Talent Partners", kind: "company", isDemo: true })).status).toBe(200);
    expect(await getOrganization(database.runner, id)).toMatchObject({ name: "Jeddah Talent Partners", kind: "company", isDemo: true });
    expect((await onOrganization(id, { action: "suspend" })).status).toBe(200);
    expect((await onOrganization(id, { action: "suspend" })).status).toBe(409);
    expect((await onOrganization(id, { action: "restore" })).status).toBe(200);
    expect((await getOrganization(database.runner, id))?.lifecycleState).toBe("active");

    const missing = await onOrganization("no-such-organisation", { action: "suspend" });
    expect([missing.status, await missing.json()]).toEqual([404, UNAVAILABLE]);
    expect((await onOrganization(id, { action: "merge" })).status).toBe(400);
    expect((await createOrganization({ name: "x", kind: "company", planTierId: "pilot-free" })).status).toBe(400);
  });
});
