import { randomBytes, randomUUID } from "node:crypto";
import { normalizeEmail } from "@/features/auth/code-sign-in";
import { invitationDigest, seatUsage } from "@/features/organizations/service";
import {
  getMembership,
  getOrganization,
  insertInvitation,
  insertMember,
  insertOrganization,
  revokeOpenInvitationsForEmail,
  updateMemberRole,
  updateOrganization,
} from "@/features/organizations/store";
import {
  cleanOrganizationName,
  ORGANIZATION_KINDS,
  ORGANIZATION_LIMITS,
  SUBSCRIPTION_STATUSES,
  type Invitation,
  type Organization,
  type OrganizationKind,
  type SubscriptionStatus,
} from "@/features/organizations/types";
import { postgresRunner, sqliteRunner, type SqlRunner } from "@/features/persistence/sql";
import { DEFAULT_PLAN_ID, isKnownPlan, planById } from "@/features/plans/catalog";
import type { AccountLifecycleState, AdminActor } from "@/types/remediation";
import type { AdminAuditDescriptor, AdminAuditPersistence, AdminAuditRequestContext, AdminAuditTransaction, AdminMutationResult } from "./audit";

/**
 * Changes a platform owner can make to accounts and organisations.
 *
 * Each change runs inside the audit log's own transaction, so the change and
 * its log entry are saved together or not at all. Every statement goes through
 * that transaction's connection: a write made on another connection would wait
 * on the transaction that is waiting for it.
 */

export interface AdminCommandDependencies {
  audit: AdminAuditPersistence;
  actor: AdminActor;
  context: AdminAuditRequestContext;
  now?: number;
}

export type AdminCommandFailure =
  | "RESOURCE_UNAVAILABLE"
  | "CANNOT_CHANGE_OWNER"
  | "NOTHING_TO_CHANGE"
  | "UNKNOWN_PLAN"
  | "PLAN_FROM_ORGANIZATION"
  | "INVALID_STATE"
  | "INVALID_SEATS"
  | "INVALID_DATE"
  | "INVALID_NOTES"
  | "INVALID_NAME"
  | "INVALID_KIND"
  | "INVALID_EMAIL"
  | "ACCOUNT_IN_ANOTHER_ORGANIZATION"
  | "ACCOUNT_NOT_ACTIVE"
  | "NO_FREE_SEAT";

export type Rejected = { ok: false; code: AdminCommandFailure };
const rejected = (code: AdminCommandFailure): Rejected => ({ ok: false, code });

/** Thrown inside the transaction so that everything done so far is undone and nothing is logged. */
class CommandRejected extends Error {
  constructor(readonly code: AdminCommandFailure) {
    super(code);
  }
}

function runnerFor(transaction: AdminAuditTransaction): SqlRunner {
  return transaction.engine === "sqlite" ? sqliteRunner(transaction.db) : postgresRunner(transaction.client);
}

async function audited<T>(
  deps: AdminCommandDependencies,
  descriptor: AdminAuditDescriptor,
  change: (tx: SqlRunner, now: string) => Promise<AdminMutationResult<T>>,
): Promise<{ ok: true; value: T } | Rejected> {
  const now = new Date(deps.now ?? Date.now()).toISOString();
  try {
    return { ok: true, value: await deps.audit.withAdminAudit(deps.actor, descriptor, deps.context, (transaction) => change(runnerFor(transaction), now)) };
  } catch (error) {
    if (error instanceof CommandRejected) return rejected(error.code);
    throw error;
  }
}

interface AccountState {
  id: string;
  role: string;
  lifecycle_state: string;
  plan_tier_id: string | null;
}

async function accountState(tx: SqlRunner, userId: string): Promise<AccountState> {
  const account = await tx.get<AccountState>("SELECT id, role, lifecycle_state, plan_tier_id FROM {users} WHERE id = ?", [userId]);
  if (!account) throw new CommandRejected("RESOURCE_UNAVAILABLE");
  return account;
}

export const ACCOUNT_ACTIONS = ["suspend", "reactivate", "remove", "restore"] as const;
export type AccountAction = (typeof ACCOUNT_ACTIONS)[number];

const TRANSITION: Record<AccountAction, { from: readonly AccountLifecycleState[]; to: AccountLifecycleState; audit: string }> = {
  suspend: { from: ["active"], to: "suspended", audit: "account_suspended" },
  reactivate: { from: ["suspended"], to: "active", audit: "account_reactivated" },
  remove: { from: ["active", "suspended"], to: "soft_deleted", audit: "account_soft_deleted" },
  restore: { from: ["soft_deleted"], to: "active", audit: "account_restored" },
};

/**
 * Suspends, reactivates, removes or restores an account. Removing keeps every
 * record the account holds, so restoring brings all of it back. An account
 * that is not active is signed out on its next request and cannot sign in.
 */
export async function changeAccountState(deps: AdminCommandDependencies, userId: string, action: AccountAction): Promise<{ ok: true; lifecycleState: AccountLifecycleState } | Rejected> {
  const transition = TRANSITION[action];
  const result = await audited(deps, {
    action: transition.audit,
    actionCategory: "account_lifecycle",
    targetKind: "account",
    targetId: userId,
    parameters: { action },
  }, async (tx, now) => {
    const account = await accountState(tx, userId);
    // An owner account is left alone, so the platform can never lock out the people who run it.
    if (account.role === "ADMIN") throw new CommandRejected("CANNOT_CHANGE_OWNER");
    if (!transition.from.includes(account.lifecycle_state as AccountLifecycleState)) throw new CommandRejected("NOTHING_TO_CHANGE");
    await tx.run(
      "UPDATE {users} SET lifecycle_state = ?, suspended_at = ?, soft_deleted_at = ? WHERE id = ?",
      [transition.to, transition.to === "suspended" ? now : null, transition.to === "soft_deleted" ? now : null, userId],
    );
    return { value: transition.to, before: { lifecycleState: account.lifecycle_state }, after: { lifecycleState: transition.to } };
  });
  return result.ok ? { ok: true, lifecycleState: result.value } : result;
}

/**
 * Places an account on a plan. No payment is taken. A member of an
 * organisation uses the organisation's plan, so theirs is changed there.
 */
export async function changeAccountPlan(deps: AdminCommandDependencies, userId: string, planTierId: string): Promise<{ ok: true } | Rejected> {
  if (!isKnownPlan(planTierId)) return rejected("UNKNOWN_PLAN");
  const result = await audited(deps, {
    action: "account_plan_changed",
    actionCategory: "plan",
    targetKind: "account",
    targetId: userId,
    parameters: { planTierId },
  }, async (tx) => {
    const account = await accountState(tx, userId);
    if (await getMembership(tx, userId)) throw new CommandRejected("PLAN_FROM_ORGANIZATION");
    const before = account.plan_tier_id ?? DEFAULT_PLAN_ID;
    if (before === planTierId) throw new CommandRejected("NOTHING_TO_CHANGE");
    await tx.run("UPDATE {users} SET plan_tier_id = ? WHERE id = ?", [planTierId, userId]);
    return { value: null, before: { planTierId: before }, after: { planTierId } };
  });
  return result.ok ? { ok: true } : result;
}

async function organizationOrReject(tx: SqlRunner, organizationId: string): Promise<Organization> {
  const organization = await getOrganization(tx, organizationId);
  if (!organization) throw new CommandRejected("RESOURCE_UNAVAILABLE");
  return organization;
}

/**
 * Sets up a company or an agency for a customer. It starts with no members:
 * its admin is assigned next. A paid plan starts as a trial until the owner
 * marks the subscription active.
 */
export async function createOrganizationAsOwner(
  deps: AdminCommandDependencies,
  input: { name: string; kind: string; planTierId: string },
): Promise<{ ok: true; organization: Organization } | Rejected> {
  const name = cleanOrganizationName(input.name);
  if (!name) return rejected("INVALID_NAME");
  if (!ORGANIZATION_KINDS.includes(input.kind as OrganizationKind)) return rejected("INVALID_KIND");
  if (!isKnownPlan(input.planTierId)) return rejected("UNKNOWN_PLAN");
  const organizationId = randomUUID();
  const result = await audited(deps, {
    action: "organization_created",
    actionCategory: "organization",
    targetKind: "none",
    targetId: null,
    parameters: { organizationId, name, kind: input.kind, planTierId: input.planTierId },
  }, async (tx, now) => {
    const organization: Organization = {
      id: organizationId,
      name,
      kind: input.kind as OrganizationKind,
      planTierId: input.planTierId,
      subscriptionStatus: planById(input.planTierId).paid ? "trial" : "active",
      seatLimit: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      notes: null,
      lifecycleState: "active",
      isDemo: false,
      createdByUserId: deps.actor.userId,
      createdAt: now,
      updatedAt: now,
    };
    await insertOrganization(tx, organization);
    return { value: organization, before: null, after: { name, kind: organization.kind, planTierId: organization.planTierId, subscriptionStatus: organization.subscriptionStatus } };
  });
  return result.ok ? { ok: true, organization: result.value } : result;
}

/**
 * A calendar date as the form sends it, stored as the start of that day in UTC.
 * An empty value clears the date and gives null. A value that is not a real
 * date gives undefined.
 */
export function parsePeriodDate(value: string | null): string | null | undefined {
  const text = value?.trim() ?? "";
  if (text === "") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return undefined;
  const date = new Date(`${text}T00:00:00.000Z`);
  // A date such as 31 February parses to a different day rather than failing.
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text ? undefined : date.toISOString();
}

export interface SubscriptionInput {
  planTierId: string;
  subscriptionStatus: string;
  /** Empty or null means "use the plan's seats". */
  seatLimit: number | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  notes: string | null;
}

/** Records the subscription an organisation is on. The figures are entered by hand; nothing here takes payment. */
export async function changeSubscription(deps: AdminCommandDependencies, organizationId: string, input: SubscriptionInput): Promise<{ ok: true } | Rejected> {
  if (!isKnownPlan(input.planTierId)) return rejected("UNKNOWN_PLAN");
  if (!SUBSCRIPTION_STATUSES.includes(input.subscriptionStatus as SubscriptionStatus)) return rejected("INVALID_STATE");
  const seatLimit = input.seatLimit;
  if (seatLimit !== null && (!Number.isInteger(seatLimit) || seatLimit < 1 || seatLimit > ORGANIZATION_LIMITS.maxSeats)) return rejected("INVALID_SEATS");
  const currentPeriodStart = parsePeriodDate(input.currentPeriodStart);
  const currentPeriodEnd = parsePeriodDate(input.currentPeriodEnd);
  if (currentPeriodStart === undefined || currentPeriodEnd === undefined) return rejected("INVALID_DATE");
  if (currentPeriodStart && currentPeriodEnd && currentPeriodEnd < currentPeriodStart) return rejected("INVALID_DATE");
  const notes = input.notes?.trim() || null;
  if (notes && notes.length > ORGANIZATION_LIMITS.notesCharacters) return rejected("INVALID_NOTES");
  const subscriptionStatus = input.subscriptionStatus as SubscriptionStatus;

  const result = await audited(deps, {
    action: "organization_subscription_changed",
    actionCategory: "subscription",
    targetKind: "quota",
    targetId: organizationId,
    parameters: { organizationId, planTierId: input.planTierId, subscriptionStatus, seatLimit, currentPeriodStart, currentPeriodEnd },
  }, async (tx, now) => {
    const organization = await organizationOrReject(tx, organizationId);
    const summary = (value: Pick<Organization, "planTierId" | "subscriptionStatus" | "seatLimit" | "currentPeriodStart" | "currentPeriodEnd">) => ({
      planTierId: value.planTierId,
      subscriptionStatus: value.subscriptionStatus,
      seatLimit: value.seatLimit,
      currentPeriodStart: value.currentPeriodStart,
      currentPeriodEnd: value.currentPeriodEnd,
    });
    const next = { planTierId: input.planTierId, subscriptionStatus, seatLimit, currentPeriodStart, currentPeriodEnd };
    const notesChanged = (organization.notes ?? null) !== notes;
    if (JSON.stringify(summary(organization)) === JSON.stringify(next) && !notesChanged) throw new CommandRejected("NOTHING_TO_CHANGE");
    await updateOrganization(tx, organizationId, { ...next, notes }, now);
    // The note itself stays out of the log: it is free text and may name people.
    return { value: null, before: summary(organization), after: { ...next, notesChanged } };
  });
  return result.ok ? { ok: true } : result;
}

/** Renames an organisation, changes its kind, or marks it as a demo so it stays out of the real totals. */
export async function changeOrganizationDetails(
  deps: AdminCommandDependencies,
  organizationId: string,
  input: { name: string; kind: string; isDemo: boolean },
): Promise<{ ok: true } | Rejected> {
  const name = cleanOrganizationName(input.name);
  if (!name) return rejected("INVALID_NAME");
  if (!ORGANIZATION_KINDS.includes(input.kind as OrganizationKind)) return rejected("INVALID_KIND");
  const kind = input.kind as OrganizationKind;
  const result = await audited(deps, {
    action: "organization_details_changed",
    actionCategory: "organization",
    targetKind: "none",
    targetId: null,
    parameters: { organizationId, name, kind, isDemo: input.isDemo },
  }, async (tx, now) => {
    const organization = await organizationOrReject(tx, organizationId);
    if (organization.name === name && organization.kind === kind && organization.isDemo === input.isDemo) throw new CommandRejected("NOTHING_TO_CHANGE");
    await updateOrganization(tx, organizationId, { name, kind, isDemo: input.isDemo }, now);
    return {
      value: null,
      before: { name: organization.name, kind: organization.kind, isDemo: organization.isDemo },
      after: { name, kind, isDemo: input.isDemo },
    };
  });
  return result.ok ? { ok: true } : result;
}

export const ORGANIZATION_ACTIONS = ["suspend", "restore"] as const;
export type OrganizationAction = (typeof ORGANIZATION_ACTIONS)[number];

/**
 * Pauses an organisation or brings it back. While paused its members keep
 * their own accounts and candidates, but nobody can be invited or changed and
 * its admin cannot read the team's candidates.
 */
export async function changeOrganizationState(deps: AdminCommandDependencies, organizationId: string, action: OrganizationAction): Promise<{ ok: true } | Rejected> {
  const to = action === "suspend" ? "suspended" : "active";
  const result = await audited(deps, {
    action: action === "suspend" ? "organization_suspended" : "organization_restored",
    actionCategory: "organization",
    targetKind: "none",
    targetId: null,
    parameters: { organizationId, action },
  }, async (tx, now) => {
    const organization = await organizationOrReject(tx, organizationId);
    if (organization.lifecycleState === to) throw new CommandRejected("NOTHING_TO_CHANGE");
    await updateOrganization(tx, organizationId, { lifecycleState: to }, now);
    return { value: null, before: { lifecycleState: organization.lifecycleState }, after: { lifecycleState: to } };
  });
  return result.ok ? { ok: true } : result;
}

export type AdminAssignment =
  /** The account existed and now administers the organisation. */
  | { outcome: "assigned" | "promoted"; email: string; userId: string }
  /** Nobody has that address yet, so an invitation was created. The token is returned once and never stored. */
  | { outcome: "invited"; email: string; invitation: Invitation; token: string };

/**
 * Names the person who administers an organisation.
 *
 * Someone who already has an account is made its admin at once. Someone who
 * does not is invited as an admin, and becomes one when they sign in with that
 * address and accept. Either way the person takes a seat.
 */
export async function assignOrganizationAdmin(
  deps: AdminCommandDependencies,
  organizationId: string,
  emailInput: string,
): Promise<({ ok: true; organization: Organization } & AdminAssignment) | Rejected> {
  const email = normalizeEmail(emailInput);
  if (!email) return rejected("INVALID_EMAIL");
  const result = await audited<{ organization: Organization } & AdminAssignment>(deps, {
    action: "organization_admin_assigned",
    actionCategory: "organization",
    targetKind: "none",
    targetId: null,
    parameters: { organizationId, email },
  }, async (tx, now) => {
    const organization = await organizationOrReject(tx, organizationId);
    const account = await tx.get<{ id: string; lifecycle_state: string }>("SELECT id, lifecycle_state FROM {users} WHERE email = ?", [email]);

    if (account) {
      if (account.lifecycle_state !== "active") throw new CommandRejected("ACCOUNT_NOT_ACTIVE");
      const membership = await getMembership(tx, account.id);
      if (membership && membership.organizationId !== organizationId) throw new CommandRejected("ACCOUNT_IN_ANOTHER_ORGANIZATION");
      if (membership) {
        if (membership.role === "ORG_ADMIN") throw new CommandRejected("NOTHING_TO_CHANGE");
        await updateMemberRole(tx, organizationId, account.id, "ORG_ADMIN");
        return { value: { organization, outcome: "promoted", email, userId: account.id }, before: { memberRole: membership.role }, after: { memberRole: "ORG_ADMIN", userId: account.id } };
      }
      // An invitation to the same address would hold a second seat for the same person.
      await revokeOpenInvitationsForEmail(tx, organizationId, email, now);
      const usage = await seatUsage(tx, organization, now);
      if (usage.members + usage.invited + 1 > usage.limit) throw new CommandRejected("NO_FREE_SEAT");
      await insertMember(tx, { organizationId, userId: account.id, role: "ORG_ADMIN", joinedAt: now, invitedByUserId: deps.actor.userId });
      return { value: { organization, outcome: "assigned", email, userId: account.id }, before: null, after: { memberRole: "ORG_ADMIN", userId: account.id } };
    }

    await revokeOpenInvitationsForEmail(tx, organizationId, email, now);
    const usage = await seatUsage(tx, organization, now);
    if (usage.members + usage.invited + 1 > usage.limit) throw new CommandRejected("NO_FREE_SEAT");
    const token = randomBytes(32).toString("base64url");
    const invitation: Invitation = {
      id: randomUUID(),
      organizationId,
      email,
      role: "ORG_ADMIN",
      invitedByUserId: deps.actor.userId,
      createdAt: now,
      expiresAt: new Date(Date.parse(now) + ORGANIZATION_LIMITS.invitationDays * 86_400_000).toISOString(),
      acceptedAt: null,
      revokedAt: null,
    };
    await insertInvitation(tx, invitation, invitationDigest(token));
    return { value: { organization, outcome: "invited", email, invitation, token }, before: null, after: { memberRole: "ORG_ADMIN", invitationId: invitation.id } };
  });
  return result.ok ? { ok: true, ...result.value } : result;
}
