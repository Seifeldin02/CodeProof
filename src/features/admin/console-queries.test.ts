import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setDisplayName, setCompanyName } from "@/features/accounts/profiles";
import { openTestAccounts } from "@/features/accounts/test-support";
import type { AuthStore, AuthUser } from "@/features/auth/store";
import { acceptInvitation, createOrganization, inviteMember } from "@/features/organizations/service";
import { updateOrganization } from "@/features/organizations/store";
import type { Organization } from "@/features/organizations/types";
import type { SqlDatabase } from "@/features/persistence/sql";
import { ADMIN_PAGE_SIZE, getAdminAccount, getAdminOverview, listAccounts } from "./console-queries";

const NOW = Date.parse("2026-10-12T09:00:00.000Z");
const DAY = 86_400_000;
const at = (offsetDays: number): string => new Date(NOW + offsetDays * DAY).toISOString();

let auth: AuthStore;
let database: SqlDatabase;
let close: () => void;

beforeEach(async () => {
  ({ auth, database, close } = await openTestAccounts());
});
afterEach(() => close());

/** An account registered a given number of days before now. */
async function account(name: string, registeredDaysAgo = 1): Promise<AuthUser> {
  const user = await auth.createUser(`${name}@example.test`, "a-long-enough-password");
  auth.db.prepare("UPDATE users SET created_at = ? WHERE id = ?").run(at(-registeredDaysAgo), user.id);
  return user;
}

const set = (userId: string, column: string, value: string | number): void => {
  auth.db.prepare(`UPDATE users SET ${column} = ? WHERE id = ?`).run(value, userId);
};

async function organization(admin: AuthUser, name: string, kind = "company", changes: Partial<Organization> = {}): Promise<Organization> {
  const created = await createOrganization({ database, auth, now: NOW }, admin.id, { name, kind });
  if (!created.ok) throw new Error(created.code);
  if (Object.keys(changes).length > 0) await updateOrganization(database.runner, created.organization.id, changes, at(0));
  return created.organization;
}

async function join(admin: AuthUser, member: AuthUser): Promise<void> {
  const invited = await inviteMember({ database, auth, now: NOW }, admin.id, { email: member.email });
  if (!invited.ok) throw new Error(invited.code);
  const joined = await acceptInvitation({ database, auth, now: NOW }, member, invited.token);
  if (!joined.ok) throw new Error(joined.code);
}

/** The tables the candidate store creates the first time a candidate is saved. */
function candidateTables(): void {
  auth.db.exec(`
    CREATE TABLE candidates (id TEXT PRIMARY KEY, owner_user_id TEXT, is_demo INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE candidate_analyses (id TEXT PRIMARY KEY, candidate_id TEXT NOT NULL);
  `);
}

function candidate(id: string, ownerUserId: string | null, repositories = 0, isDemo = false): void {
  auth.db.prepare("INSERT INTO candidates (id, owner_user_id, is_demo) VALUES (?, ?, ?)").run(id, ownerUserId, isDemo ? 1 : 0);
  for (let index = 0; index < repositories; index += 1) {
    auth.db.prepare("INSERT INTO candidate_analyses (id, candidate_id) VALUES (?, ?)").run(`${id}-${index}`, id);
  }
}

describe("the account table", () => {
  it("lists accounts newest first with their organisation and the plan in force", async () => {
    const amina = await account("amina", 3);
    const sara = await account("sara", 2);
    const solo = await account("solo", 1);
    await organization(amina, "Riyadh Systems", "company", { planTierId: "pilot-guided" });
    await join(amina, sara);
    await setDisplayName(database.runner, amina.id, "Amina Al-Harbi");
    set(solo.id, "plan_tier_id", "pilot-self-serve");

    const { accounts, total, page, pages } = await listAccounts(database.runner);
    expect({ total, page, pages }).toEqual({ total: 3, page: 1, pages: 1 });
    expect(accounts.map((entry) => entry.email)).toEqual(["solo@example.test", "sara@example.test", "amina@example.test"]);
    expect(accounts[0]).toMatchObject({ planTierId: "pilot-self-serve", ownPlanTierId: "pilot-self-serve", organization: null, candidates: null });
    expect(accounts[1]).toMatchObject({ planTierId: "pilot-guided", ownPlanTierId: "pilot-free", organization: { name: "Riyadh Systems", memberRole: "RECRUITER" } });
    expect(accounts[2]).toMatchObject({ displayName: "Amina Al-Harbi", organization: { memberRole: "ORG_ADMIN" }, lifecycleState: "active", isDemo: false });
  });

  it("searches the email address, name, company, organisation and identifier, treating the term as text", async () => {
    const amina = await account("amina");
    const sara = await account("sara");
    await organization(amina, "Riyadh Systems");
    await setCompanyName(database.runner, sara.id, "Gulf Logistics");
    await setDisplayName(database.runner, sara.id, "Sara Haddad");
    const found = async (search: string) => (await listAccounts(database.runner, { search })).accounts.map((entry) => entry.email);

    expect(await found("AMINA@")).toEqual(["amina@example.test"]);
    expect(await found("gulf log")).toEqual(["sara@example.test"]);
    expect(await found("haddad")).toEqual(["sara@example.test"]);
    expect(await found("riyadh")).toEqual(["amina@example.test"]);
    expect(await found(sara.id)).toEqual(["sara@example.test"]);
    expect(await found("nobody")).toEqual([]);
    // A pattern character is not a wildcard: it is dropped, so this is the same search as "example".
    expect(await found("%_example")).toHaveLength(2);
  });

  it("filters by state, by the plan in force and by demo accounts", async () => {
    const amina = await account("amina", 4);
    const sara = await account("sara", 3);
    const demo = await account("demo", 2);
    const gone = await account("gone", 1);
    await organization(amina, "Riyadh Systems", "company", { planTierId: "pilot-agency" });
    set(sara.id, "lifecycle_state", "suspended");
    set(gone.id, "lifecycle_state", "soft_deleted");
    set(demo.id, "is_demo", 1);
    const emails = async (filter: Parameters<typeof listAccounts>[1]) => (await listAccounts(database.runner, filter)).accounts.map((entry) => entry.email);

    expect(await emails({ state: "suspended" })).toEqual(["sara@example.test"]);
    expect(await emails({ state: "soft_deleted" })).toEqual(["gone@example.test"]);
    expect(await emails({ planTierId: "pilot-agency" })).toEqual(["amina@example.test"]);
    expect(await emails({ planTierId: "pilot-free" })).toHaveLength(3);
    expect(await emails({ demo: true })).toEqual(["demo@example.test"]);
    expect(await emails({ demo: false, state: "active" })).toEqual(["amina@example.test"]);
  });

  it("pages through the accounts in a fixed order without repeating or skipping one", async () => {
    for (let index = 0; index < ADMIN_PAGE_SIZE + 6; index += 1) await account(`person${String(index).padStart(2, "0")}`, 5);
    const first = await listAccounts(database.runner, { page: 1 });
    const second = await listAccounts(database.runner, { page: 2 });
    expect(first).toMatchObject({ total: ADMIN_PAGE_SIZE + 6, page: 1, pages: 2 });
    expect(first.accounts).toHaveLength(ADMIN_PAGE_SIZE);
    expect(second.accounts).toHaveLength(6);
    expect(new Set([...first.accounts, ...second.accounts].map((entry) => entry.id)).size).toBe(ADMIN_PAGE_SIZE + 6);
    // A page past the end shows the last page rather than nothing.
    expect((await listAccounts(database.runner, { page: 99 })).page).toBe(2);
    expect((await listAccounts(database.runner, { page: -3 })).page).toBe(1);
  });

  it("counts each account's candidates once candidate records exist", async () => {
    const amina = await account("amina");
    expect((await getAdminAccount(database.runner, amina.id))?.candidates).toBeNull();
    candidateTables();
    candidate("c1", amina.id);
    candidate("c2", amina.id);
    expect((await getAdminAccount(database.runner, amina.id))?.candidates).toBe(2);
    expect(await getAdminAccount(database.runner, "no-such-account")).toBeNull();
  });
});

describe("the figures on the first page", () => {
  it("counts real accounts apart from demo and removed ones, and splits them by the plan in force", async () => {
    const amina = await account("amina", 90);
    const sara = await account("sara", 60);
    const solo = await account("solo", 10);
    const paused = await account("paused", 45);
    const gone = await account("gone", 5);
    const demo = await account("demo", 2);
    await organization(amina, "Riyadh Systems", "company", { planTierId: "pilot-guided" });
    await join(amina, sara);
    set(paused.id, "lifecycle_state", "suspended");
    set(gone.id, "lifecycle_state", "soft_deleted");
    set(demo.id, "is_demo", 1);
    set(solo.id, "plan_tier_id", "pilot-self-serve");

    const overview = await getAdminOverview(database.runner, NOW);
    expect(overview.accounts).toEqual({ total: 4, active: 3, suspended: 1, removed: 1, newInPeriod: 1, free: 1, paid: 3 });
    expect(overview.demoAccounts).toBe(1);
    expect(overview.newSince).toBe(at(-30));
    expect(overview.plans.find((plan) => plan.planTierId === "pilot-guided")).toEqual({ planTierId: "pilot-guided", accounts: 2, organizations: 1 });
    expect(overview.plans.find((plan) => plan.planTierId === "pilot-free")).toMatchObject({ accounts: 1, organizations: 0 });
  });

  it("summarises real organisations and lists the ones that need a look", async () => {
    const owners = await Promise.all(["a", "b", "c", "d", "e", "f"].map((name) => account(name)));
    await organization(owners[0], "Paid Up", "company", { planTierId: "pilot-guided", subscriptionStatus: "active", currentPeriodEnd: at(60) });
    const overdue = await organization(owners[1], "Overdue", "agency", { planTierId: "pilot-agency", subscriptionStatus: "past_due" });
    // The period runs through its last day: one that ended yesterday is over, one that ends today is not.
    const ended = await organization(owners[2], "Ended", "company", { planTierId: "pilot-self-serve", subscriptionStatus: "active", currentPeriodEnd: "2026-10-11T00:00:00.000Z" });
    const ending = await organization(owners[3], "Ending", "company", { planTierId: "pilot-self-serve", subscriptionStatus: "trial", currentPeriodEnd: "2026-10-12T00:00:00.000Z" });
    await organization(owners[4], "Suspended", "company", { lifecycleState: "suspended", subscriptionStatus: "past_due" });
    await organization(owners[5], "Demo", "company", { isDemo: true, subscriptionStatus: "past_due" });

    const overview = await getAdminOverview(database.runner, NOW);
    expect(overview.organizations).toMatchObject({ total: 5, companies: 4, agencies: 1, paid: 2, trial: 1, pastDue: 1, paused: 0, cancelled: 0, suspended: 1, seatsTaken: 4, seatsInvited: 0 });
    expect(overview.organizations.seatLimit).toBe(10 + 25 + 5 + 5);
    expect(overview.demoOrganizations).toBe(1);
    expect(overview.attention.map((entry) => [entry.id, entry.reason])).toEqual(expect.arrayContaining([
      [overdue.id, "past_due"],
      [ended.id, "period_ended"],
      [ending.id, "period_ending"],
    ]));
    expect(overview.attention).toHaveLength(3);
  });

  it("reports candidate figures as unavailable until candidate records exist, then counts real ones apart from demo", async () => {
    const amina = await account("amina");
    const demo = await account("demo");
    set(demo.id, "is_demo", 1);
    expect((await getAdminOverview(database.runner, NOW)).work).toEqual({ candidates: null, repositories: null, demoCandidates: null, unavailable: "no_source_table" });

    candidateTables();
    candidate("real-1", amina.id, 2);
    candidate("real-2", amina.id, 1);
    candidate("unowned", null, 1);
    candidate("flagged-demo", amina.id, 3, true);
    candidate("demo-account", demo.id, 4);
    expect((await getAdminOverview(database.runner, NOW)).work).toEqual({ candidates: 3, repositories: 4, demoCandidates: 2, unavailable: null });
  });

  it("says so when candidate records exist but cannot be read", async () => {
    // A candidate table without the columns the figures need.
    auth.db.exec("CREATE TABLE candidates (id TEXT PRIMARY KEY); CREATE TABLE candidate_analyses (id TEXT PRIMARY KEY);");
    expect((await getAdminOverview(database.runner, NOW)).work).toEqual({ candidates: null, repositories: null, demoCandidates: null, unavailable: "query_failed" });
  });
});
