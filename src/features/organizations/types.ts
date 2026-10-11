/**
 * A company or a recruitment agency, the people in it, and its subscription.
 *
 * Each recruiter keeps their own candidates. Belonging to an organisation does
 * not pool them: only the organisation's admin can see what every member
 * holds, and only to read it. A person belongs to at most one organisation.
 */

export const ORGANIZATION_KINDS = ["company", "agency"] as const;
export type OrganizationKind = (typeof ORGANIZATION_KINDS)[number];

export const MEMBER_ROLES = ["ORG_ADMIN", "RECRUITER"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const SUBSCRIPTION_STATUSES = ["trial", "active", "past_due", "paused", "cancelled"] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const ORGANIZATION_LIFECYCLE_STATES = ["active", "suspended"] as const;
export type OrganizationLifecycleState = (typeof ORGANIZATION_LIFECYCLE_STATES)[number];

export const ORGANIZATION_LIMITS = {
  nameCharacters: 120,
  notesCharacters: 2_000,
  invitationDays: 7,
  maxSeats: 1_000,
} as const;

export interface Organization {
  id: string;
  name: string;
  kind: OrganizationKind;
  planTierId: string;
  subscriptionStatus: SubscriptionStatus;
  /** Overrides the plan's seat count when set. */
  seatLimit: number | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  /** Written by platform owners. Never shown to the organisation. */
  notes: string | null;
  lifecycleState: OrganizationLifecycleState;
  isDemo: boolean;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Membership {
  organizationId: string;
  userId: string;
  role: MemberRole;
  joinedAt: string;
  invitedByUserId: string | null;
}

export interface Invitation {
  id: string;
  organizationId: string;
  email: string;
  role: MemberRole;
  invitedByUserId: string | null;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
}

export type InvitationStatus = "pending" | "accepted" | "revoked" | "expired";

export function invitationStatus(invitation: Pick<Invitation, "acceptedAt" | "revokedAt" | "expiresAt">, now = Date.now()): InvitationStatus {
  if (invitation.acceptedAt) return "accepted";
  if (invitation.revokedAt) return "revoked";
  return Date.parse(invitation.expiresAt) <= now ? "expired" : "pending";
}

export function cleanOrganizationName(value: string): string | null {
  const name = value.replace(/\s+/g, " ").trim();
  return name.length >= 2 && name.length <= ORGANIZATION_LIMITS.nameCharacters ? name : null;
}
