import { isoOrNull, toCount, type SqlRunner, type SqlValue } from "@/features/persistence/sql";
import type { Invitation, Membership, MemberRole, Organization, OrganizationKind, OrganizationLifecycleState, SubscriptionStatus } from "./types";

/** Reads and writes for organisations, members and invitations. Rules live in `service.ts`. */

interface OrganizationRow {
  id: string;
  name: string;
  kind: string;
  plan_tier_id: string;
  subscription_status: string;
  seat_limit: number | string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  notes: string | null;
  lifecycle_state: string;
  is_demo: number | boolean;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

function mapOrganization(row: OrganizationRow): Organization {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind as OrganizationKind,
    planTierId: row.plan_tier_id,
    subscriptionStatus: row.subscription_status as SubscriptionStatus,
    seatLimit: row.seat_limit === null ? null : Number(row.seat_limit),
    currentPeriodStart: isoOrNull(row.current_period_start),
    currentPeriodEnd: isoOrNull(row.current_period_end),
    notes: row.notes,
    lifecycleState: row.lifecycle_state as OrganizationLifecycleState,
    isDemo: Boolean(Number(row.is_demo)),
    createdByUserId: row.created_by_user_id,
    createdAt: isoOrNull(row.created_at) ?? row.created_at,
    updatedAt: isoOrNull(row.updated_at) ?? row.updated_at,
  };
}

export async function insertOrganization(runner: SqlRunner, organization: Organization): Promise<void> {
  await runner.run(
    `INSERT INTO {organizations}
      (id, name, kind, plan_tier_id, subscription_status, seat_limit, current_period_start, current_period_end, notes,
       lifecycle_state, is_demo, created_by_user_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      organization.id, organization.name, organization.kind, organization.planTierId, organization.subscriptionStatus,
      organization.seatLimit, organization.currentPeriodStart, organization.currentPeriodEnd, organization.notes,
      organization.lifecycleState, organization.isDemo ? 1 : 0, organization.createdByUserId, organization.createdAt, organization.updatedAt,
    ],
  );
}

export async function getOrganization(runner: SqlRunner, id: string): Promise<Organization | null> {
  const row = await runner.get<OrganizationRow>("SELECT * FROM {organizations} WHERE id = ?", [id]);
  return row ? mapOrganization(row) : null;
}

export type OrganizationPatch = Partial<Pick<Organization,
  "name" | "kind" | "planTierId" | "subscriptionStatus" | "seatLimit" | "currentPeriodStart" | "currentPeriodEnd" | "notes" | "lifecycleState" | "isDemo">>;

const COLUMN: Record<keyof OrganizationPatch, string> = {
  name: "name",
  kind: "kind",
  planTierId: "plan_tier_id",
  subscriptionStatus: "subscription_status",
  seatLimit: "seat_limit",
  currentPeriodStart: "current_period_start",
  currentPeriodEnd: "current_period_end",
  notes: "notes",
  lifecycleState: "lifecycle_state",
  isDemo: "is_demo",
};

export async function updateOrganization(runner: SqlRunner, id: string, patch: OrganizationPatch, now: string): Promise<boolean> {
  const entries = (Object.keys(patch) as Array<keyof OrganizationPatch>).filter((key) => patch[key] !== undefined);
  if (entries.length === 0) return (await getOrganization(runner, id)) !== null;
  const values: SqlValue[] = entries.map((key) => {
    const value = patch[key];
    return typeof value === "boolean" ? (value ? 1 : 0) : (value as SqlValue);
  });
  const changed = await runner.run(
    `UPDATE {organizations} SET ${entries.map((key) => `${COLUMN[key]} = ?`).join(", ")}, updated_at = ? WHERE id = ?`,
    [...values, now, id],
  );
  return changed === 1;
}

export interface OrganizationSummary extends Organization {
  members: number;
  pendingInvitations: number;
}

export interface OrganizationFilter {
  search?: string;
  kind?: OrganizationKind;
  status?: SubscriptionStatus;
  planTierId?: string;
}

export async function listOrganizations(runner: SqlRunner, filter: OrganizationFilter = {}, now = new Date().toISOString()): Promise<OrganizationSummary[]> {
  const where: string[] = [];
  const params: SqlValue[] = [now];
  if (filter.search?.trim()) {
    where.push("(LOWER(o.name) LIKE ? OR o.id = ?)");
    params.push(`%${filter.search.trim().toLowerCase().replace(/[%_]/g, "")}%`, filter.search.trim());
  }
  if (filter.kind) { where.push("o.kind = ?"); params.push(filter.kind); }
  if (filter.status) { where.push("o.subscription_status = ?"); params.push(filter.status); }
  if (filter.planTierId) { where.push("o.plan_tier_id = ?"); params.push(filter.planTierId); }
  const rows = await runner.all<OrganizationRow & { members: number | string; pending_invitations: number | string }>(
    `SELECT o.*,
       (SELECT CAST(COUNT(*) AS INTEGER) FROM {organization_members} m WHERE m.organization_id = o.id) AS members,
       (SELECT CAST(COUNT(*) AS INTEGER) FROM {organization_invites} i
         WHERE i.organization_id = o.id AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > ?) AS pending_invitations
     FROM {organizations} o
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY o.created_at DESC, o.id`,
    params,
  );
  return rows.map((row) => ({ ...mapOrganization(row), members: toCount(row.members), pendingInvitations: toCount(row.pending_invitations) }));
}

interface MemberRow {
  organization_id: string;
  user_id: string;
  member_role: string;
  joined_at: string;
  invited_by_user_id: string | null;
}

const mapMember = (row: MemberRow): Membership => ({
  organizationId: row.organization_id,
  userId: row.user_id,
  role: row.member_role as MemberRole,
  joinedAt: isoOrNull(row.joined_at) ?? row.joined_at,
  invitedByUserId: row.invited_by_user_id,
});

export async function getMembership(runner: SqlRunner, userId: string): Promise<Membership | null> {
  const row = await runner.get<MemberRow>("SELECT * FROM {organization_members} WHERE user_id = ?", [userId]);
  return row ? mapMember(row) : null;
}

export async function listMembers(runner: SqlRunner, organizationId: string): Promise<Membership[]> {
  // Admins first, then in the order people joined.
  const rows = await runner.all<MemberRow>(
    `SELECT * FROM {organization_members} WHERE organization_id = ?
     ORDER BY CASE member_role WHEN 'ORG_ADMIN' THEN 0 ELSE 1 END, joined_at, user_id`,
    [organizationId],
  );
  return rows.map(mapMember);
}

export async function insertMember(runner: SqlRunner, member: Membership): Promise<void> {
  await runner.run(
    "INSERT INTO {organization_members} (organization_id, user_id, member_role, joined_at, invited_by_user_id) VALUES (?, ?, ?, ?, ?)",
    [member.organizationId, member.userId, member.role, member.joinedAt, member.invitedByUserId],
  );
}

export async function deleteMember(runner: SqlRunner, organizationId: string, userId: string): Promise<boolean> {
  return (await runner.run("DELETE FROM {organization_members} WHERE organization_id = ? AND user_id = ?", [organizationId, userId])) === 1;
}

export async function updateMemberRole(runner: SqlRunner, organizationId: string, userId: string, role: MemberRole): Promise<boolean> {
  return (await runner.run("UPDATE {organization_members} SET member_role = ? WHERE organization_id = ? AND user_id = ?", [role, organizationId, userId])) === 1;
}

interface InviteRow {
  id: string;
  organization_id: string;
  email: string;
  member_role: string;
  invited_by_user_id: string | null;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
}

const mapInvite = (row: InviteRow): Invitation => ({
  id: row.id,
  organizationId: row.organization_id,
  email: row.email,
  role: row.member_role as MemberRole,
  invitedByUserId: row.invited_by_user_id,
  createdAt: isoOrNull(row.created_at) ?? row.created_at,
  expiresAt: isoOrNull(row.expires_at) ?? row.expires_at,
  acceptedAt: isoOrNull(row.accepted_at),
  revokedAt: isoOrNull(row.revoked_at),
});

export async function insertInvitation(runner: SqlRunner, invitation: Invitation, tokenDigest: string): Promise<void> {
  await runner.run(
    `INSERT INTO {organization_invites} (id, organization_id, email, member_role, token_digest, invited_by_user_id, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [invitation.id, invitation.organizationId, invitation.email, invitation.role, tokenDigest, invitation.invitedByUserId, invitation.createdAt, invitation.expiresAt],
  );
}

export async function findInvitationByDigest(runner: SqlRunner, tokenDigest: string): Promise<Invitation | null> {
  const row = await runner.get<InviteRow>("SELECT * FROM {organization_invites} WHERE token_digest = ?", [tokenDigest]);
  return row ? mapInvite(row) : null;
}

export async function getInvitation(runner: SqlRunner, organizationId: string, id: string): Promise<Invitation | null> {
  const row = await runner.get<InviteRow>("SELECT * FROM {organization_invites} WHERE id = ? AND organization_id = ?", [id, organizationId]);
  return row ? mapInvite(row) : null;
}

export async function listInvitations(runner: SqlRunner, organizationId: string): Promise<Invitation[]> {
  const rows = await runner.all<InviteRow>("SELECT * FROM {organization_invites} WHERE organization_id = ? ORDER BY created_at DESC, id", [organizationId]);
  return rows.map(mapInvite);
}

/** Invitations still open for an address, across organisations. */
export async function listOpenInvitationsForEmail(runner: SqlRunner, email: string, now: string): Promise<Invitation[]> {
  const rows = await runner.all<InviteRow>(
    `SELECT * FROM {organization_invites}
     WHERE email = ? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ? ORDER BY created_at DESC, id`,
    [email, now],
  );
  return rows.map(mapInvite);
}

export async function countOpenInvitations(runner: SqlRunner, organizationId: string, now: string): Promise<number> {
  const row = await runner.get<{ total: number | string }>(
    `SELECT CAST(COUNT(*) AS INTEGER) AS total FROM {organization_invites}
     WHERE organization_id = ? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ?`,
    [organizationId, now],
  );
  return toCount(row?.total);
}

export async function revokeInvitation(runner: SqlRunner, organizationId: string, id: string, now: string): Promise<boolean> {
  return (await runner.run(
    "UPDATE {organization_invites} SET revoked_at = ? WHERE id = ? AND organization_id = ? AND accepted_at IS NULL AND revoked_at IS NULL",
    [now, id, organizationId],
  )) === 1;
}

export async function revokeOpenInvitationsForEmail(runner: SqlRunner, organizationId: string, email: string, now: string): Promise<number> {
  return runner.run(
    "UPDATE {organization_invites} SET revoked_at = ? WHERE organization_id = ? AND email = ? AND accepted_at IS NULL AND revoked_at IS NULL",
    [now, organizationId, email],
  );
}

export async function markInvitationAccepted(runner: SqlRunner, id: string, userId: string, now: string): Promise<boolean> {
  return (await runner.run(
    "UPDATE {organization_invites} SET accepted_at = ?, accepted_by_user_id = ? WHERE id = ? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ?",
    [now, userId, id, now],
  )) === 1;
}
