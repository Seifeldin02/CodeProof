import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setDisplayName } from "@/features/accounts/profiles";
import { openTestAccounts } from "@/features/accounts/test-support";
import type { AuthStore, AuthUser } from "@/features/auth/store";
import type { SqlDatabase } from "@/features/persistence/sql";
import {
  acceptInvitation,
  acceptInvitationForVerifiedEmail,
  changeMemberRole,
  createOrganization,
  declineInvitation,
  getWorkspace,
  inviteMember,
  isWellFormedInvitationToken,
  leaveOrganization,
  listMemberViews,
  listOrganizationInvitations,
  openInvitationsFor,
  organizationAdminScope,
  previewInvitation,
  removeMember,
  revokeInvitation,
  type OrganizationDependencies,
} from "./service";
import { updateOrganization } from "./store";
import { ORGANIZATION_LIMITS } from "./types";

const NOW = Date.parse("2026-10-12T09:00:00.000Z");
const DAY = 86_400_000;

let auth: AuthStore;
let database: SqlDatabase;
let close: () => void;
let deps: OrganizationDependencies;

beforeEach(async () => {
  ({ auth, database, close } = await openTestAccounts());
  deps = { database, auth, now: NOW };
});
afterEach(() => close());

const account = (name: string): Promise<AuthUser> => auth.createUser(`${name}@example.test`, "a-long-enough-password");

async function company(adminName = "amina") {
  const admin = await account(adminName);
  const created = await createOrganization(deps, admin.id, { name: "  Riyadh   Systems ", kind: "company" });
  if (!created.ok) throw new Error(created.code);
  return { admin, organization: created.organization };
}

async function invite(adminId: string, email: string, role?: string) {
  const invited = await inviteMember(deps, adminId, { email, role });
  if (!invited.ok) throw new Error(invited.code);
  return invited;
}

describe("creating an organisation", () => {
  it("makes its creator the admin, on the free plan, with seats counted", async () => {
    const { admin, organization } = await company();
    expect(organization).toMatchObject({ name: "Riyadh Systems", kind: "company", planTierId: "pilot-free", subscriptionStatus: "active", seatLimit: null, lifecycleState: "active", isDemo: false, createdByUserId: admin.id });
    const workspace = await getWorkspace(database.runner, admin.id, new Date(NOW).toISOString());
    expect(workspace?.membership.role).toBe("ORG_ADMIN");
    expect(workspace?.seats).toEqual({ members: 1, invited: 0, limit: 2 });
    expect(await getWorkspace(database.runner, "nobody")).toBeNull();
  });

  it("needs a real name and a known kind, and one organisation per person", async () => {
    const user = await account("omar");
    expect(await createOrganization(deps, user.id, { name: " ", kind: "company" })).toEqual({ ok: false, code: "INVALID_NAME" });
    expect(await createOrganization(deps, user.id, { name: "x".repeat(ORGANIZATION_LIMITS.nameCharacters + 1), kind: "company" })).toEqual({ ok: false, code: "INVALID_NAME" });
    expect(await createOrganization(deps, user.id, { name: "Talent Bridge", kind: "charity" })).toEqual({ ok: false, code: "INVALID_KIND" });
    expect(await createOrganization(deps, user.id, { name: "Talent Bridge", kind: "agency" })).toMatchObject({ ok: true });
    expect(await createOrganization(deps, user.id, { name: "A second one", kind: "company" })).toEqual({ ok: false, code: "ALREADY_IN_ORGANIZATION" });
  });
});

describe("inviting people", () => {
  it("is for the organisation's admin only", async () => {
    const { admin } = await company();
    const outsider = await account("outsider");
    expect(await inviteMember(deps, outsider.id, { email: "new@example.test" })).toEqual({ ok: false, code: "NOT_A_MEMBER" });
    expect(await inviteMember(deps, admin.id, { email: "not an address" })).toEqual({ ok: false, code: "INVALID_EMAIL" });
    expect(await inviteMember(deps, admin.id, { email: "new@example.test", role: "OWNER" })).toEqual({ ok: false, code: "INVALID_MEMBER_ROLE" });

    const recruiter = await account("recruiter");
    const invited = await invite(admin.id, "Recruiter@Example.test");
    expect(await acceptInvitation(deps, recruiter, invited.token)).toMatchObject({ ok: true });
    expect(await inviteMember(deps, recruiter.id, { email: "third@example.test" })).toEqual({ ok: false, code: "NOT_ORGANIZATION_ADMIN" });
    expect(await inviteMember(deps, admin.id, { email: "recruiter@example.test" })).toEqual({ ok: false, code: "ALREADY_A_MEMBER" });
  });

  it("creates a link that is stored only as a digest and lasts seven days", async () => {
    const { admin, organization } = await company();
    const { invitation, token } = await invite(admin.id, " New.Person@Example.test ");
    expect(isWellFormedInvitationToken(token)).toBe(true);
    expect(invitation).toMatchObject({ organizationId: organization.id, email: "new.person@example.test", role: "RECRUITER", invitedByUserId: admin.id });
    expect(Date.parse(invitation.expiresAt) - NOW).toBe(7 * DAY);
    expect(JSON.stringify(await database.runner.all("SELECT * FROM {organization_invites}"))).not.toContain(token);

    expect(await previewInvitation(deps, token)).toMatchObject({ organization: { name: "Riyadh Systems", kind: "company" }, invitation: { email: "new.person@example.test" } });
    expect(await previewInvitation(deps, "short")).toBeNull();
    expect(await previewInvitation({ ...deps, now: NOW + 7 * DAY }, token)).toBeNull();
  });

  it("counts an open invitation as a taken seat and replaces an earlier one for the same address", async () => {
    const { admin, organization } = await company();
    const first = await invite(admin.id, "one@example.test");
    // The free plan holds two people: the admin and one invitation.
    expect(await inviteMember(deps, admin.id, { email: "two@example.test" })).toEqual({ ok: false, code: "SEAT_LIMIT_REACHED" });
    expect((await listOrganizationInvitations(deps, organization.id)).map((item) => item.status)).toEqual(["pending"]);

    const second = await invite(admin.id, "one@example.test");
    expect(await previewInvitation(deps, first.token)).toBeNull();
    expect(await previewInvitation(deps, second.token)).not.toBeNull();
    expect((await getWorkspace(database.runner, admin.id, new Date(NOW).toISOString()))?.seats).toEqual({ members: 1, invited: 1, limit: 2 });

    // Raising the seat count, as a platform owner can, makes room.
    await updateOrganization(database.runner, organization.id, { seatLimit: 3 }, new Date(NOW).toISOString());
    expect(await inviteMember(deps, admin.id, { email: "two@example.test" })).toMatchObject({ ok: true });
  });

  it("lets the admin close an invitation, which frees its seat", async () => {
    const { admin } = await company();
    const invited = await invite(admin.id, "one@example.test");
    const outsider = await account("outsider");
    expect(await revokeInvitation(deps, outsider.id, invited.invitation.id)).toEqual({ ok: false, code: "NOT_A_MEMBER" });
    expect(await revokeInvitation(deps, admin.id, invited.invitation.id)).toEqual({ ok: true });
    expect(await revokeInvitation(deps, admin.id, invited.invitation.id)).toEqual({ ok: false, code: "INVITATION_UNAVAILABLE" });
    expect(await previewInvitation(deps, invited.token)).toBeNull();
    expect(await inviteMember(deps, admin.id, { email: "two@example.test" })).toMatchObject({ ok: true });
  });
});

describe("answering an invitation", () => {
  it("joins the person the invitation was addressed to, once", async () => {
    const { admin, organization } = await company();
    const invited = await invite(admin.id, "omar@example.test");
    const someoneElse = await account("layla");
    const omar = await account("omar");

    expect(await acceptInvitation(deps, someoneElse, invited.token)).toEqual({ ok: false, code: "EMAIL_MISMATCH" });
    expect(await acceptInvitation(deps, omar, "x".repeat(43))).toEqual({ ok: false, code: "INVITATION_UNAVAILABLE" });
    expect(await acceptInvitation(deps, omar, invited.token)).toMatchObject({ ok: true, organization: { id: organization.id }, membership: { role: "RECRUITER", invitedByUserId: admin.id } });
    expect(await acceptInvitation(deps, omar, invited.token)).toEqual({ ok: false, code: "INVITATION_UNAVAILABLE" });
    expect((await getWorkspace(database.runner, omar.id, new Date(NOW).toISOString()))?.seats).toEqual({ members: 2, invited: 0, limit: 2 });
  });

  it("refuses a link that expired, an organisation that is suspended, and a person already elsewhere", async () => {
    const { admin, organization } = await company();
    const omar = await account("omar");
    const invited = await invite(admin.id, "omar@example.test");
    expect(await acceptInvitation({ ...deps, now: NOW + 8 * DAY }, omar, invited.token)).toEqual({ ok: false, code: "INVITATION_UNAVAILABLE" });

    await updateOrganization(database.runner, organization.id, { lifecycleState: "suspended" }, new Date(NOW).toISOString());
    expect(await acceptInvitation(deps, omar, invited.token)).toEqual({ ok: false, code: "ORGANIZATION_UNAVAILABLE" });
    expect(await organizationAdminScope(database.runner, admin.id)).toEqual({ ok: false, code: "ORGANIZATION_UNAVAILABLE" });
    expect(await inviteMember(deps, admin.id, { email: "x@example.test" })).toEqual({ ok: false, code: "ORGANIZATION_UNAVAILABLE" });
    await updateOrganization(database.runner, organization.id, { lifecycleState: "active" }, new Date(NOW).toISOString());

    expect(await createOrganization(deps, omar.id, { name: "Omar Consulting", kind: "agency" })).toMatchObject({ ok: true });
    expect(await acceptInvitation(deps, omar, invited.token)).toEqual({ ok: false, code: "ALREADY_IN_ORGANIZATION" });
  });

  it("refuses to seat more people than the organisation has seats", async () => {
    const { admin, organization } = await company();
    const omar = await account("omar");
    const invited = await invite(admin.id, "omar@example.test");
    await updateOrganization(database.runner, organization.id, { seatLimit: 1 }, new Date(NOW).toISOString());
    expect(await acceptInvitation(deps, omar, invited.token)).toEqual({ ok: false, code: "SEAT_LIMIT_REACHED" });
    expect(await getWorkspace(database.runner, omar.id)).toBeNull();
  });

  it("can be accepted or declined from the list of invitations addressed to the person", async () => {
    const { admin, organization } = await company();
    await updateOrganization(database.runner, organization.id, { seatLimit: 5 }, new Date(NOW).toISOString());
    const omar = await account("omar");
    const layla = await account("layla");
    const forOmar = await invite(admin.id, "omar@example.test");
    const forLayla = await invite(admin.id, "layla@example.test");

    expect((await openInvitationsFor(deps, "OMAR@example.test")).map((item) => item.organization.name)).toEqual(["Riyadh Systems"]);
    // Knowing an invitation's identifier is not enough: it has to be addressed to the person.
    expect(await acceptInvitationForVerifiedEmail(deps, omar, forLayla.invitation.id)).toEqual({ ok: false, code: "INVITATION_UNAVAILABLE" });
    expect(await declineInvitation(deps, omar, forLayla.invitation.id)).toEqual({ ok: false, code: "INVITATION_UNAVAILABLE" });
    expect(await acceptInvitationForVerifiedEmail(deps, omar, forOmar.invitation.id)).toMatchObject({ ok: true });

    expect(await declineInvitation(deps, layla, forLayla.invitation.id)).toEqual({ ok: true });
    expect(await openInvitationsFor(deps, "layla@example.test")).toEqual([]);
    expect(await acceptInvitation(deps, layla, forLayla.token)).toEqual({ ok: false, code: "INVITATION_UNAVAILABLE" });
  });
});

describe("managing members", () => {
  async function team() {
    const { admin, organization } = await company();
    await updateOrganization(database.runner, organization.id, { seatLimit: 5 }, new Date(NOW).toISOString());
    const omar = await account("omar");
    const layla = await account("layla");
    for (const person of [omar, layla]) {
      const invited = await invite(admin.id, person.email);
      await acceptInvitation(deps, person, invited.token);
    }
    return { admin, organization, omar, layla };
  }

  it("lists members with their address, name and role", async () => {
    const { admin, organization, omar } = await team();
    await setDisplayName(database.runner, omar.id, "Omar Khalid");
    const members = (await listMemberViews(deps, organization.id)).map((member) => [member.email, member.displayName, member.role, member.accountActive]);
    // The admin is listed first.
    expect(members[0]).toEqual([admin.email, null, "ORG_ADMIN", true]);
    expect(members.slice(1).sort()).toEqual([
      ["layla@example.test", null, "RECRUITER", true],
      ["omar@example.test", "Omar Khalid", "RECRUITER", true],
    ]);
  });

  it("always keeps an admin", async () => {
    const { admin, omar, layla } = await team();
    expect(await removeMember(deps, omar.id, layla.id)).toEqual({ ok: false, code: "NOT_ORGANIZATION_ADMIN" });
    expect(await removeMember(deps, admin.id, admin.id)).toEqual({ ok: false, code: "LAST_ADMIN" });
    expect(await changeMemberRole(deps, admin.id, admin.id, "RECRUITER")).toEqual({ ok: false, code: "LAST_ADMIN" });
    expect(await leaveOrganization(deps, admin.id)).toEqual({ ok: false, code: "LAST_ADMIN" });
    expect(await changeMemberRole(deps, admin.id, omar.id, "OWNER")).toEqual({ ok: false, code: "INVALID_MEMBER_ROLE" });

    expect(await changeMemberRole(deps, admin.id, omar.id, "ORG_ADMIN")).toEqual({ ok: true });
    expect(await leaveOrganization(deps, admin.id)).toEqual({ ok: true });
    expect(await getWorkspace(database.runner, admin.id)).toBeNull();
    expect((await getWorkspace(database.runner, omar.id))?.membership.role).toBe("ORG_ADMIN");
  });

  it("removes a member, which frees their seat and leaves their account alone", async () => {
    const { admin, organization, omar } = await team();
    const stranger = await account("stranger");
    expect(await removeMember(deps, admin.id, stranger.id)).toEqual({ ok: false, code: "MEMBER_NOT_FOUND" });
    expect(await removeMember(deps, admin.id, omar.id)).toEqual({ ok: true });
    expect(await getWorkspace(database.runner, omar.id)).toBeNull();
    expect(await auth.findById(omar.id)).not.toBeNull();
    expect((await listMemberViews(deps, organization.id)).map((member) => member.email)).toEqual([admin.email, "layla@example.test"]);
    expect((await getWorkspace(database.runner, admin.id, new Date(NOW).toISOString()))?.seats).toEqual({ members: 2, invited: 0, limit: 5 });
    expect(await leaveOrganization(deps, omar.id)).toEqual({ ok: false, code: "NOT_A_MEMBER" });
  });

  it("lets the only person in an organisation leave it", async () => {
    const { admin } = await company();
    expect(await leaveOrganization(deps, admin.id)).toEqual({ ok: true });
    expect(await createOrganization(deps, admin.id, { name: "A fresh start", kind: "agency" })).toMatchObject({ ok: true });
  });
});
