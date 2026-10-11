import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openTestAccounts } from "@/features/accounts/test-support";
import type { AuthStore, AuthUser } from "@/features/auth/store";
import { acceptInvitation, createOrganization, getWorkspace, inviteMember, organizationAdminScope, previewInvitation } from "@/features/organizations/service";
import { getMembership, getOrganization, listInvitations, listMembers, updateOrganization } from "@/features/organizations/store";
import { invitationStatus } from "@/features/organizations/types";
import type { SqlDatabase } from "@/features/persistence/sql";
import type { AdminActor } from "@/types/remediation";
import { SQLiteAdminAuditStore, type AdminAuditRequestContext } from "./audit";
import {
  assignOrganizationAdmin,
  changeAccountPlan,
  changeAccountState,
  changeOrganizationDetails,
  changeOrganizationState,
  changeSubscription,
  createOrganizationAsOwner,
  parsePeriodDate,
  type AdminCommandDependencies,
  type SubscriptionInput,
} from "./console-commands";

const NOW = Date.parse("2026-10-12T09:00:00.000Z");

const context: AdminAuditRequestContext = {
  requestCorrelationId: "request-1",
  requestMethod: "POST",
  route: "/api/admin/test",
  ipFingerprint: "a".repeat(64),
  userAgentFamily: "test-client",
};

let auth: AuthStore;
let database: SqlDatabase;
let close: () => void;
let audit: SQLiteAdminAuditStore;
let owner: AuthUser;
let deps: AdminCommandDependencies;

const account = (name: string): Promise<AuthUser> => auth.createUser(`${name}@example.test`, "a-long-enough-password");

beforeEach(async () => {
  ({ auth, database, close } = await openTestAccounts());
  owner = await auth.createUser("owner@codeproof.test", "a-long-enough-password");
  auth.db.prepare("UPDATE users SET role = 'ADMIN' WHERE id = ?").run(owner.id);
  // The audit log shares the connection, as it shares the database file in a running deployment.
  audit = new SQLiteAdminAuditStore(auth.db);
  const actor: AdminActor = { userId: owner.id, email: owner.email, role: "ADMIN", lifecycleState: "active" };
  deps = { audit, actor, context, now: NOW };
});
afterEach(() => close());

const logged = async () => (await audit.list()).map((entry) => entry.action);

async function ownerOrganization(planTierId = "pilot-guided") {
  const created = await createOrganizationAsOwner(deps, { name: "Jeddah Talent", kind: "agency", planTierId });
  if (!created.ok) throw new Error(created.code);
  return created.organization;
}

const subscription = (changes: Partial<SubscriptionInput> = {}): SubscriptionInput => ({
  planTierId: "pilot-guided",
  subscriptionStatus: "active",
  seatLimit: null,
  currentPeriodStart: "2026-10-01",
  currentPeriodEnd: "2026-10-31",
  notes: null,
  ...changes,
});

describe("changing an account's state", () => {
  it("suspends, reactivates, removes and restores, logging the state before and after", async () => {
    const recruiter = await account("sara");

    expect(await changeAccountState(deps, recruiter.id, "suspend")).toEqual({ ok: true, lifecycleState: "suspended" });
    expect((await auth.findById(recruiter.id))?.lifecycleState).toBe("suspended");
    expect(auth.db.prepare("SELECT suspended_at FROM users WHERE id = ?").get(recruiter.id)).toEqual({ suspended_at: new Date(NOW).toISOString() });

    expect(await changeAccountState(deps, recruiter.id, "reactivate")).toEqual({ ok: true, lifecycleState: "active" });
    expect(auth.db.prepare("SELECT suspended_at FROM users WHERE id = ?").get(recruiter.id)).toEqual({ suspended_at: null });

    expect(await changeAccountState(deps, recruiter.id, "remove")).toEqual({ ok: true, lifecycleState: "soft_deleted" });
    expect(await changeAccountState(deps, recruiter.id, "restore")).toEqual({ ok: true, lifecycleState: "active" });
    expect((await auth.findById(recruiter.id))?.email).toBe("sara@example.test");

    const entries = await audit.list();
    expect(entries.map((entry) => entry.action)).toEqual(["account_suspended", "account_reactivated", "account_soft_deleted", "account_restored"]);
    expect(entries[0]).toMatchObject({
      actorUserId: owner.id,
      targetKind: "account",
      targetId: recruiter.id,
      outcome: "succeeded",
      before: { lifecycleState: "active" },
      after: { lifecycleState: "suspended" },
    });
    expect(await audit.verifyAdminAuditChain()).toMatchObject({ valid: true, checkedEntries: 4 });
  });

  it("refuses a change that does not apply, an owner account and an unknown account, and logs none of them", async () => {
    const recruiter = await account("sara");
    expect(await changeAccountState(deps, recruiter.id, "reactivate")).toEqual({ ok: false, code: "NOTHING_TO_CHANGE" });
    expect(await changeAccountState(deps, recruiter.id, "restore")).toEqual({ ok: false, code: "NOTHING_TO_CHANGE" });
    expect(await changeAccountState(deps, owner.id, "suspend")).toEqual({ ok: false, code: "CANNOT_CHANGE_OWNER" });
    expect(await changeAccountState(deps, "no-such-account", "suspend")).toEqual({ ok: false, code: "RESOURCE_UNAVAILABLE" });
    expect((await auth.findById(recruiter.id))?.lifecycleState).toBe("active");
    expect(await logged()).toEqual([]);

    // The connection is left usable: a refused change must not leave its transaction open.
    expect(await changeAccountState(deps, recruiter.id, "suspend")).toMatchObject({ ok: true });
  });
});

describe("changing an account's plan", () => {
  it("stores the plan and logs the old and the new one", async () => {
    const recruiter = await account("sara");
    expect(await changeAccountPlan(deps, recruiter.id, "pilot-self-serve")).toEqual({ ok: true });
    expect((await auth.findById(recruiter.id))?.planTierId).toBe("pilot-self-serve");
    expect((await audit.list())[0]).toMatchObject({ action: "account_plan_changed", targetId: recruiter.id, before: { planTierId: "pilot-free" }, after: { planTierId: "pilot-self-serve" } });
  });

  it("refuses an unknown plan, the plan already in place, and a member of an organisation", async () => {
    const recruiter = await account("sara");
    expect(await changeAccountPlan(deps, recruiter.id, "enterprise")).toEqual({ ok: false, code: "UNKNOWN_PLAN" });
    expect(await changeAccountPlan(deps, recruiter.id, "pilot-free")).toEqual({ ok: false, code: "NOTHING_TO_CHANGE" });
    expect(await changeAccountPlan(deps, "no-such-account", "pilot-guided")).toEqual({ ok: false, code: "RESOURCE_UNAVAILABLE" });

    const member = await account("amina");
    await createOrganization({ database, auth, now: NOW }, member.id, { name: "Riyadh Systems", kind: "company" });
    expect(await changeAccountPlan(deps, member.id, "pilot-guided")).toEqual({ ok: false, code: "PLAN_FROM_ORGANIZATION" });
    expect(await logged()).toEqual([]);
  });
});

describe("setting up an organisation for a customer", () => {
  it("creates it without members, as a trial on a paid plan", async () => {
    const organization = await ownerOrganization();
    expect(organization).toMatchObject({ name: "Jeddah Talent", kind: "agency", planTierId: "pilot-guided", subscriptionStatus: "trial", isDemo: false, createdByUserId: owner.id });
    expect(await listMembers(database.runner, organization.id)).toEqual([]);
    expect((await audit.list())[0]).toMatchObject({ action: "organization_created", targetKind: "none", parameters: { organizationId: organization.id } });
  });

  it("starts a free organisation as active, and checks the name, kind and plan", async () => {
    expect((await ownerOrganization("pilot-free")).subscriptionStatus).toBe("active");
    expect(await createOrganizationAsOwner(deps, { name: "x", kind: "company", planTierId: "pilot-free" })).toEqual({ ok: false, code: "INVALID_NAME" });
    expect(await createOrganizationAsOwner(deps, { name: "Valid Name", kind: "charity", planTierId: "pilot-free" })).toEqual({ ok: false, code: "INVALID_KIND" });
    expect(await createOrganizationAsOwner(deps, { name: "Valid Name", kind: "company", planTierId: "gold" })).toEqual({ ok: false, code: "UNKNOWN_PLAN" });
  });
});

describe("recording a subscription", () => {
  it("stores the plan, status, seats and period, and keeps the note out of the log", async () => {
    const organization = await ownerOrganization();
    const note = "Invoice 0042 sent to their finance lead";
    expect(await changeSubscription(deps, organization.id, subscription({ seatLimit: 40, notes: `  ${note} ` }))).toEqual({ ok: true });

    expect(await getOrganization(database.runner, organization.id)).toMatchObject({
      planTierId: "pilot-guided",
      subscriptionStatus: "active",
      seatLimit: 40,
      currentPeriodStart: "2026-10-01T00:00:00.000Z",
      currentPeriodEnd: "2026-10-31T00:00:00.000Z",
      notes: note,
    });
    const entry = (await audit.list()).at(-1);
    expect(entry).toMatchObject({
      action: "organization_subscription_changed",
      targetKind: "quota",
      targetId: organization.id,
      before: { subscriptionStatus: "trial", seatLimit: null },
      after: { subscriptionStatus: "active", seatLimit: 40, notesChanged: true },
    });
    expect(JSON.stringify(entry)).not.toContain("Invoice");
  });

  it("clears the seat override and the period when they are left empty", async () => {
    const organization = await ownerOrganization();
    await changeSubscription(deps, organization.id, subscription({ seatLimit: 40 }));
    expect(await changeSubscription(deps, organization.id, subscription({ seatLimit: null, currentPeriodStart: null, currentPeriodEnd: "" }))).toEqual({ ok: true });
    expect(await getOrganization(database.runner, organization.id)).toMatchObject({ seatLimit: null, currentPeriodStart: null, currentPeriodEnd: null });
  });

  it("refuses values that are not on the lists or not real", async () => {
    const organization = await ownerOrganization();
    const refuse = async (changes: Partial<SubscriptionInput>) => changeSubscription(deps, organization.id, subscription(changes));
    expect(await refuse({ planTierId: "gold" })).toEqual({ ok: false, code: "UNKNOWN_PLAN" });
    expect(await refuse({ subscriptionStatus: "overdue" })).toEqual({ ok: false, code: "INVALID_STATE" });
    for (const seatLimit of [0, 1001, 2.5, Number.NaN]) expect(await refuse({ seatLimit })).toEqual({ ok: false, code: "INVALID_SEATS" });
    expect(await refuse({ currentPeriodEnd: "2026-02-31" })).toEqual({ ok: false, code: "INVALID_DATE" });
    expect(await refuse({ currentPeriodEnd: "31/10/2026" })).toEqual({ ok: false, code: "INVALID_DATE" });
    expect(await refuse({ currentPeriodStart: "2026-11-01", currentPeriodEnd: "2026-10-31" })).toEqual({ ok: false, code: "INVALID_DATE" });
    expect(await refuse({ notes: "x".repeat(2001) })).toEqual({ ok: false, code: "INVALID_NOTES" });
    expect(await changeSubscription(deps, "no-such-organisation", subscription())).toEqual({ ok: false, code: "RESOURCE_UNAVAILABLE" });
    expect(await logged()).toEqual(["organization_created"]);
  });

  it("says so when nothing would change", async () => {
    const organization = await ownerOrganization();
    await changeSubscription(deps, organization.id, subscription());
    expect(await changeSubscription(deps, organization.id, subscription())).toEqual({ ok: false, code: "NOTHING_TO_CHANGE" });
  });

  it("reads a calendar date as that day in UTC", () => {
    expect(parsePeriodDate("2026-10-31")).toBe("2026-10-31T00:00:00.000Z");
    expect(parsePeriodDate(" ")).toBeNull();
    expect(parsePeriodDate(null)).toBeNull();
    expect(parsePeriodDate("2026-13-01")).toBeUndefined();
    expect(parsePeriodDate("tomorrow")).toBeUndefined();
  });
});

describe("changing an organisation's details and state", () => {
  it("renames it, changes its kind and marks it as a demo", async () => {
    const organization = await ownerOrganization();
    expect(await changeOrganizationDetails(deps, organization.id, { name: " Jeddah  Talent Partners ", kind: "company", isDemo: true })).toEqual({ ok: true });
    expect(await getOrganization(database.runner, organization.id)).toMatchObject({ name: "Jeddah Talent Partners", kind: "company", isDemo: true });
    expect(await changeOrganizationDetails(deps, organization.id, { name: "Jeddah Talent Partners", kind: "company", isDemo: true })).toEqual({ ok: false, code: "NOTHING_TO_CHANGE" });
    expect(await changeOrganizationDetails(deps, organization.id, { name: "", kind: "company", isDemo: false })).toEqual({ ok: false, code: "INVALID_NAME" });
  });

  it("pauses an organisation, which stops its admin, and brings it back", async () => {
    const admin = await account("amina");
    const created = await createOrganization({ database, auth, now: NOW }, admin.id, { name: "Riyadh Systems", kind: "company" });
    if (!created.ok) throw new Error(created.code);

    expect(await changeOrganizationState(deps, created.organization.id, "suspend")).toEqual({ ok: true });
    expect(await organizationAdminScope(database.runner, admin.id)).toEqual({ ok: false, code: "ORGANIZATION_UNAVAILABLE" });
    expect(await inviteMember({ database, auth, now: NOW }, admin.id, { email: "new@example.test" })).toEqual({ ok: false, code: "ORGANIZATION_UNAVAILABLE" });
    expect(await changeOrganizationState(deps, created.organization.id, "suspend")).toEqual({ ok: false, code: "NOTHING_TO_CHANGE" });

    expect(await changeOrganizationState(deps, created.organization.id, "restore")).toEqual({ ok: true });
    expect(await organizationAdminScope(database.runner, admin.id)).toMatchObject({ ok: true });
    expect(await logged()).toEqual(["organization_suspended", "organization_restored"]);
  });
});

describe("naming an organisation's admin", () => {
  it("makes an existing account the admin at once", async () => {
    const organization = await ownerOrganization();
    const person = await account("khalid");
    const assigned = await assignOrganizationAdmin(deps, organization.id, " Khalid@Example.test ");
    expect(assigned).toMatchObject({ ok: true, outcome: "assigned", email: "khalid@example.test", userId: person.id });
    expect(await getMembership(database.runner, person.id)).toMatchObject({ organizationId: organization.id, role: "ORG_ADMIN", invitedByUserId: owner.id });
    expect((await getWorkspace(database.runner, person.id, new Date(NOW).toISOString()))?.seats).toMatchObject({ members: 1, invited: 0, limit: 10 });
    expect(await assignOrganizationAdmin(deps, organization.id, "khalid@example.test")).toEqual({ ok: false, code: "NOTHING_TO_CHANGE" });
  });

  it("promotes a recruiter who is already in the organisation", async () => {
    const admin = await account("amina");
    const created = await createOrganization({ database, auth, now: NOW }, admin.id, { name: "Riyadh Systems", kind: "company" });
    if (!created.ok) throw new Error(created.code);
    const recruiter = await account("sara");
    const invited = await inviteMember({ database, auth, now: NOW }, admin.id, { email: recruiter.email });
    if (!invited.ok) throw new Error(invited.code);
    await acceptInvitation({ database, auth, now: NOW }, recruiter, invited.token);

    expect(await assignOrganizationAdmin(deps, created.organization.id, recruiter.email)).toMatchObject({ ok: true, outcome: "promoted", userId: recruiter.id });
    expect((await getMembership(database.runner, recruiter.id))?.role).toBe("ORG_ADMIN");
    expect((await audit.list()).at(-1)).toMatchObject({ action: "organization_admin_assigned", before: { memberRole: "RECRUITER" }, after: { memberRole: "ORG_ADMIN" } });
  });

  it("invites someone who has no account yet, as an admin, with a link that works once they sign in", async () => {
    const organization = await ownerOrganization();
    const assigned = await assignOrganizationAdmin(deps, organization.id, "noor@example.test");
    if (!assigned.ok || assigned.outcome !== "invited") throw new Error("expected an invitation");
    expect(assigned.invitation).toMatchObject({ email: "noor@example.test", role: "ORG_ADMIN", invitedByUserId: owner.id });
    expect((await previewInvitation({ database, auth, now: NOW }, assigned.token))?.organization.name).toBe("Jeddah Talent");

    // The link is not kept anywhere: only its digest is stored, and the log holds neither.
    expect(JSON.stringify(await audit.list())).not.toContain(assigned.token);
    expect(JSON.stringify(auth.db.prepare("SELECT * FROM organization_invites").all())).not.toContain(assigned.token);

    const noor = await account("noor");
    expect(await acceptInvitation({ database, auth, now: NOW }, noor, assigned.token)).toMatchObject({ ok: true, membership: { role: "ORG_ADMIN" } });
  });

  it("replaces an earlier open invitation to the same address instead of holding two seats", async () => {
    const organization = await ownerOrganization();
    await assignOrganizationAdmin(deps, organization.id, "noor@example.test");
    await assignOrganizationAdmin(deps, organization.id, "noor@example.test");
    const invitations = await listInvitations(database.runner, organization.id);
    expect(invitations.map((invitation) => invitationStatus(invitation, NOW)).sort()).toEqual(["pending", "revoked"]);
  });

  it("refuses an account that is elsewhere or not active, and a full organisation", async () => {
    const organization = await ownerOrganization();
    const elsewhere = await account("amina");
    await createOrganization({ database, auth, now: NOW }, elsewhere.id, { name: "Riyadh Systems", kind: "company" });
    expect(await assignOrganizationAdmin(deps, organization.id, elsewhere.email)).toEqual({ ok: false, code: "ACCOUNT_IN_ANOTHER_ORGANIZATION" });

    const suspended = await account("sara");
    await changeAccountState(deps, suspended.id, "suspend");
    expect(await assignOrganizationAdmin(deps, organization.id, suspended.email)).toEqual({ ok: false, code: "ACCOUNT_NOT_ACTIVE" });

    expect(await assignOrganizationAdmin(deps, organization.id, "not an address")).toEqual({ ok: false, code: "INVALID_EMAIL" });
    expect(await assignOrganizationAdmin(deps, "no-such-organisation", "noor@example.test")).toEqual({ ok: false, code: "RESOURCE_UNAVAILABLE" });

    const at = new Date(NOW).toISOString();
    await updateOrganization(database.runner, organization.id, { seatLimit: 2 }, at);
    const first = await account("khalid");
    await assignOrganizationAdmin(deps, organization.id, first.email);
    await assignOrganizationAdmin(deps, organization.id, "noor@example.test");
    const free = await account("omar");
    expect(await assignOrganizationAdmin(deps, organization.id, free.email)).toEqual({ ok: false, code: "NO_FREE_SEAT" });
    expect(await getMembership(database.runner, free.id)).toBeNull();

    // With fewer seats than people, replacing the open invitation is refused, and the refusal must leave it open.
    await updateOrganization(database.runner, organization.id, { seatLimit: 1 }, at);
    expect(await assignOrganizationAdmin(deps, organization.id, "noor@example.test")).toEqual({ ok: false, code: "NO_FREE_SEAT" });
    expect((await listInvitations(database.runner, organization.id)).filter((invitation) => invitationStatus(invitation, NOW) === "pending")).toHaveLength(1);
  });
});
