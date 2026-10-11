import { createHash, randomBytes, randomUUID } from "node:crypto";
import { getProfiles } from "@/features/accounts/profiles";
import { normalizeEmail } from "@/features/auth/code-sign-in";
import type { AuthPersistence, AuthUser } from "@/features/auth/store";
import type { SqlDatabase, SqlRunner } from "@/features/persistence/sql";
import { DEFAULT_PLAN_ID, seatLimitFor } from "@/features/plans/catalog";
import {
  countOpenInvitations,
  deleteMember,
  findInvitationByDigest,
  getMembership,
  getOrganization,
  insertInvitation,
  insertMember,
  insertOrganization,
  listInvitations,
  listMembers,
  listOpenInvitationsForEmail,
  markInvitationAccepted,
  revokeInvitation as revokeInvitationRow,
  revokeOpenInvitationsForEmail,
  updateMemberRole,
} from "./store";
import {
  cleanOrganizationName,
  invitationStatus,
  MEMBER_ROLES,
  ORGANIZATION_KINDS,
  ORGANIZATION_LIMITS,
  type Invitation,
  type Membership,
  type MemberRole,
  type Organization,
  type OrganizationKind,
} from "./types";

/**
 * The rules for organisations: who may create one, who may invite whom, how
 * many seats are taken, and that an organisation always keeps an admin.
 */

export interface OrganizationDependencies {
  database: SqlDatabase;
  auth: Pick<AuthPersistence, "findByEmail" | "findById">;
  now?: number;
}

export type OrganizationFailure =
  | "INVALID_NAME"
  | "INVALID_KIND"
  | "INVALID_EMAIL"
  | "INVALID_MEMBER_ROLE"
  | "ALREADY_IN_ORGANIZATION"
  | "ALREADY_A_MEMBER"
  | "NOT_A_MEMBER"
  | "NOT_ORGANIZATION_ADMIN"
  | "ORGANIZATION_UNAVAILABLE"
  | "SEAT_LIMIT_REACHED"
  | "INVITATION_UNAVAILABLE"
  | "EMAIL_MISMATCH"
  | "MEMBER_NOT_FOUND"
  | "LAST_ADMIN";

export type Failed = { ok: false; code: OrganizationFailure };
const failed = (code: OrganizationFailure): Failed => ({ ok: false, code });

const iso = (deps: Pick<OrganizationDependencies, "now">): string => new Date(deps.now ?? Date.now()).toISOString();

export function invitationDigest(token: string): string {
  return createHash("sha256").update(`organization-invitation\0${token}`).digest("hex");
}

export function isWellFormedInvitationToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

export interface SeatUsage {
  /** People in the organisation. */
  members: number;
  /** Invitations still open. Each holds a seat until it is answered, closed or expires. */
  invited: number;
  limit: number;
}

export interface Workspace {
  organization: Organization;
  membership: Membership;
  seats: SeatUsage;
}

export async function seatUsage(runner: SqlRunner, organization: Organization, now: string): Promise<SeatUsage> {
  const [members, invited] = await Promise.all([listMembers(runner, organization.id), countOpenInvitations(runner, organization.id, now)]);
  return { members: members.length, invited, limit: seatLimitFor(organization) };
}

/** The organisation a person belongs to, or null for someone working alone. */
export async function getWorkspace(runner: SqlRunner, userId: string, now = new Date().toISOString()): Promise<Workspace | null> {
  const membership = await getMembership(runner, userId);
  if (!membership) return null;
  const organization = await getOrganization(runner, membership.organizationId);
  if (!organization) return null;
  return { organization, membership, seats: await seatUsage(runner, organization, now) };
}

type AdminScope = { ok: true; organization: Organization; membership: Membership } | Failed;

/** Confirms the person is an admin of an organisation that is in good standing. */
export async function organizationAdminScope(runner: SqlRunner, userId: string): Promise<AdminScope> {
  const membership = await getMembership(runner, userId);
  if (!membership) return failed("NOT_A_MEMBER");
  if (membership.role !== "ORG_ADMIN") return failed("NOT_ORGANIZATION_ADMIN");
  const organization = await getOrganization(runner, membership.organizationId);
  if (!organization || organization.lifecycleState !== "active") return failed("ORGANIZATION_UNAVAILABLE");
  return { ok: true, organization, membership };
}

export async function createOrganization(
  deps: OrganizationDependencies,
  userId: string,
  input: { name: string; kind: string },
): Promise<{ ok: true; organization: Organization } | Failed> {
  const name = cleanOrganizationName(input.name);
  if (!name) return failed("INVALID_NAME");
  if (!ORGANIZATION_KINDS.includes(input.kind as OrganizationKind)) return failed("INVALID_KIND");
  const creator = await deps.auth.findById(userId);
  const now = iso(deps);

  return deps.database.transaction(async (tx) => {
    if (await getMembership(tx, userId)) return failed("ALREADY_IN_ORGANIZATION");
    const organization: Organization = {
      id: randomUUID(),
      name,
      kind: input.kind as OrganizationKind,
      planTierId: DEFAULT_PLAN_ID,
      subscriptionStatus: "active",
      seatLimit: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      notes: null,
      lifecycleState: "active",
      isDemo: Boolean(creator?.isDemo),
      createdByUserId: userId,
      createdAt: now,
      updatedAt: now,
    };
    await insertOrganization(tx, organization);
    await insertMember(tx, { organizationId: organization.id, userId, role: "ORG_ADMIN", joinedAt: now, invitedByUserId: null });
    return { ok: true as const, organization };
  });
}

export async function inviteMember(
  deps: OrganizationDependencies,
  actorUserId: string,
  input: { email: string; role?: string },
): Promise<{ ok: true; invitation: Invitation; token: string; organization: Organization } | Failed> {
  const email = normalizeEmail(input.email);
  if (!email) return failed("INVALID_EMAIL");
  const role = (input.role ?? "RECRUITER") as MemberRole;
  if (!MEMBER_ROLES.includes(role)) return failed("INVALID_MEMBER_ROLE");
  const existingAccount = await deps.auth.findByEmail(email);
  const now = iso(deps);

  return deps.database.transaction(async (tx) => {
    const scope = await organizationAdminScope(tx, actorUserId);
    if (!scope.ok) return scope;
    const { organization } = scope;

    if (existingAccount && (await getMembership(tx, existingAccount.id))?.organizationId === organization.id) return failed("ALREADY_A_MEMBER");

    // A new invitation for the same address replaces the open one, so it takes no extra seat.
    await revokeOpenInvitationsForEmail(tx, organization.id, email, now);
    const usage = await seatUsage(tx, organization, now);
    if (usage.members + usage.invited + 1 > usage.limit) throw new SeatLimitReached();

    const token = randomBytes(32).toString("base64url");
    const invitation: Invitation = {
      id: randomUUID(),
      organizationId: organization.id,
      email,
      role,
      invitedByUserId: actorUserId,
      createdAt: now,
      expiresAt: new Date(Date.parse(now) + ORGANIZATION_LIMITS.invitationDays * 86_400_000).toISOString(),
      acceptedAt: null,
      revokedAt: null,
    };
    await insertInvitation(tx, invitation, invitationDigest(token));
    return { ok: true as const, invitation, token, organization };
  }).catch((error: unknown) => {
    // Raised inside the transaction so that replacing the earlier invitation is undone as well.
    if (error instanceof SeatLimitReached) return failed("SEAT_LIMIT_REACHED");
    throw error;
  });
}

class SeatLimitReached extends Error {}

export async function revokeInvitation(deps: OrganizationDependencies, actorUserId: string, invitationId: string): Promise<{ ok: true } | Failed> {
  const scope = await organizationAdminScope(deps.database.runner, actorUserId);
  if (!scope.ok) return scope;
  return (await revokeInvitationRow(deps.database.runner, scope.organization.id, invitationId, iso(deps))) ? { ok: true } : failed("INVITATION_UNAVAILABLE");
}

export interface InvitationPreview {
  invitation: Invitation;
  organization: Pick<Organization, "id" | "name" | "kind">;
}

/** What an invitation link leads to, or null when it cannot be used. */
export async function previewInvitation(deps: OrganizationDependencies, token: string): Promise<InvitationPreview | null> {
  if (!isWellFormedInvitationToken(token)) return null;
  const invitation = await findInvitationByDigest(deps.database.runner, invitationDigest(token));
  if (!invitation || invitationStatus(invitation, deps.now ?? Date.now()) !== "pending") return null;
  const organization = await getOrganization(deps.database.runner, invitation.organizationId);
  if (!organization || organization.lifecycleState !== "active") return null;
  return { invitation, organization: { id: organization.id, name: organization.name, kind: organization.kind } };
}

type Joined = { ok: true; organization: Organization; membership: Membership } | Failed;

async function join(tx: SqlRunner, invitation: Invitation | null, user: Pick<AuthUser, "id" | "email">, now: string): Promise<Joined> {
  if (!invitation || invitationStatus(invitation, Date.parse(now)) !== "pending") return failed("INVITATION_UNAVAILABLE");
  if (invitation.email !== user.email.trim().toLowerCase()) return failed("EMAIL_MISMATCH");
  const organization = await getOrganization(tx, invitation.organizationId);
  if (!organization || organization.lifecycleState !== "active") return failed("ORGANIZATION_UNAVAILABLE");

  const current = await getMembership(tx, user.id);
  if (current && current.organizationId !== organization.id) return failed("ALREADY_IN_ORGANIZATION");
  if (current) {
    await markInvitationAccepted(tx, invitation.id, user.id, now);
    return { ok: true, organization, membership: current };
  }

  // The open invitation already holds this person's seat, so only the members are counted.
  if ((await listMembers(tx, organization.id)).length >= seatLimitFor(organization)) return failed("SEAT_LIMIT_REACHED");
  const membership: Membership = { organizationId: organization.id, userId: user.id, role: invitation.role, joinedAt: now, invitedByUserId: invitation.invitedByUserId };
  await insertMember(tx, membership);
  await markInvitationAccepted(tx, invitation.id, user.id, now);
  return { ok: true, organization, membership };
}

/** Joins the organisation an invitation link names. The invitation must have been sent to this person's address. */
export async function acceptInvitation(deps: OrganizationDependencies, user: Pick<AuthUser, "id" | "email">, token: string): Promise<Joined> {
  if (!isWellFormedInvitationToken(token)) return failed("INVITATION_UNAVAILABLE");
  const now = iso(deps);
  return deps.database.transaction(async (tx) => join(tx, await findInvitationByDigest(tx, invitationDigest(token)), user, now));
}

/**
 * Joins without the link, from the list of invitations addressed to the person.
 * The caller must first have established that the person can read that address,
 * because here the address alone, not a secret link, is what admits them.
 */
export async function acceptInvitationForVerifiedEmail(deps: OrganizationDependencies, user: Pick<AuthUser, "id" | "email">, invitationId: string): Promise<Joined> {
  const now = iso(deps);
  return deps.database.transaction(async (tx) => {
    const open = await listOpenInvitationsForEmail(tx, user.email.trim().toLowerCase(), now);
    return join(tx, open.find((invitation) => invitation.id === invitationId) ?? null, user, now);
  });
}

/** Turns an invitation down. Only the person it was addressed to can. */
export async function declineInvitation(deps: OrganizationDependencies, user: Pick<AuthUser, "email">, invitationId: string): Promise<{ ok: true } | Failed> {
  const now = iso(deps);
  const open = await listOpenInvitationsForEmail(deps.database.runner, user.email.trim().toLowerCase(), now);
  const invitation = open.find((candidate) => candidate.id === invitationId);
  if (!invitation) return failed("INVITATION_UNAVAILABLE");
  await revokeInvitationRow(deps.database.runner, invitation.organizationId, invitation.id, now);
  return { ok: true };
}

export async function removeMember(deps: OrganizationDependencies, actorUserId: string, targetUserId: string): Promise<{ ok: true } | Failed> {
  return deps.database.transaction(async (tx) => {
    const scope = await organizationAdminScope(tx, actorUserId);
    if (!scope.ok) return scope;
    const members = await listMembers(tx, scope.organization.id);
    const target = members.find((member) => member.userId === targetUserId);
    if (!target) return failed("MEMBER_NOT_FOUND");
    if (target.role === "ORG_ADMIN" && members.filter((member) => member.role === "ORG_ADMIN").length === 1) return failed("LAST_ADMIN");
    await deleteMember(tx, scope.organization.id, targetUserId);
    return { ok: true as const };
  });
}

export async function changeMemberRole(deps: OrganizationDependencies, actorUserId: string, targetUserId: string, role: string): Promise<{ ok: true } | Failed> {
  if (!MEMBER_ROLES.includes(role as MemberRole)) return failed("INVALID_MEMBER_ROLE");
  return deps.database.transaction(async (tx) => {
    const scope = await organizationAdminScope(tx, actorUserId);
    if (!scope.ok) return scope;
    const members = await listMembers(tx, scope.organization.id);
    const target = members.find((member) => member.userId === targetUserId);
    if (!target) return failed("MEMBER_NOT_FOUND");
    if (target.role === "ORG_ADMIN" && role !== "ORG_ADMIN" && members.filter((member) => member.role === "ORG_ADMIN").length === 1) return failed("LAST_ADMIN");
    await updateMemberRole(tx, scope.organization.id, targetUserId, role as MemberRole);
    return { ok: true as const };
  });
}

/** Leaves the organisation. The last admin has to hand the role over first while others remain. */
export async function leaveOrganization(deps: OrganizationDependencies, userId: string): Promise<{ ok: true } | Failed> {
  return deps.database.transaction(async (tx) => {
    const membership = await getMembership(tx, userId);
    if (!membership) return failed("NOT_A_MEMBER");
    const members = await listMembers(tx, membership.organizationId);
    const admins = members.filter((member) => member.role === "ORG_ADMIN");
    if (membership.role === "ORG_ADMIN" && admins.length === 1 && members.length > 1) return failed("LAST_ADMIN");
    await deleteMember(tx, membership.organizationId, userId);
    return { ok: true as const };
  });
}

export interface MemberView {
  userId: string;
  email: string;
  displayName: string | null;
  role: MemberRole;
  joinedAt: string;
  lastActivityAt: string | null;
  lastSignInAt: string | null;
  /** False for an account the platform has suspended or removed. */
  accountActive: boolean;
}

export async function listMemberViews(deps: OrganizationDependencies, organizationId: string): Promise<MemberView[]> {
  const members = await listMembers(deps.database.runner, organizationId);
  const [accounts, profiles] = await Promise.all([
    Promise.all(members.map((member) => deps.auth.findById(member.userId))),
    getProfiles(deps.database.runner, members.map((member) => member.userId)),
  ]);
  return members.flatMap((member, index) => {
    const account = accounts[index];
    if (!account) return [];
    const profile = profiles.get(member.userId);
    return [{
      userId: member.userId,
      email: account.email,
      displayName: profile?.displayName ?? null,
      role: member.role,
      joinedAt: member.joinedAt,
      lastActivityAt: account.lastActivityAt,
      lastSignInAt: profile?.lastSignInAt ?? null,
      accountActive: account.lifecycleState === "active",
    }];
  });
}

export async function listOrganizationInvitations(deps: OrganizationDependencies, organizationId: string): Promise<Array<Invitation & { status: ReturnType<typeof invitationStatus> }>> {
  const now = deps.now ?? Date.now();
  return (await listInvitations(deps.database.runner, organizationId)).map((invitation) => ({ ...invitation, status: invitationStatus(invitation, now) }));
}

/** Open invitations addressed to a person, with the organisation each one names. */
export async function openInvitationsFor(deps: OrganizationDependencies, email: string): Promise<InvitationPreview[]> {
  const invitations = await listOpenInvitationsForEmail(deps.database.runner, email.trim().toLowerCase(), iso(deps));
  const previews: InvitationPreview[] = [];
  for (const invitation of invitations) {
    const organization = await getOrganization(deps.database.runner, invitation.organizationId);
    if (organization && organization.lifecycleState === "active") previews.push({ invitation, organization: { id: organization.id, name: organization.name, kind: organization.kind } });
  }
  return previews;
}
