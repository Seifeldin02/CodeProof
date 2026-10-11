import { listOrganizations, type OrganizationSummary } from "@/features/organizations/store";
import type { MemberRole } from "@/features/organizations/types";
import { isoOrNull, renderSql, toCount, type SqlRunner, type SqlValue } from "@/features/persistence/sql";
import { DEFAULT_PLAN_ID, planById, PLANS, seatLimitFor } from "@/features/plans/catalog";
import type { AccountLifecycleState, AccountRole } from "@/types/remediation";

/**
 * What the owner administration area reads: accounts, organisations and the
 * totals on its first page.
 *
 * Demo accounts and demo organisations are counted apart from real ones and
 * are never part of a real total. A figure whose records cannot be read is
 * reported as null, which the pages show as unavailable rather than as zero.
 */

export const ADMIN_PAGE_SIZE = 25;
/** How far back "new" reaches on the first page. */
export const NEW_ACCOUNT_DAYS = 30;
/** How soon a subscription period must end to be listed as ending soon. */
export const RENEWAL_NOTICE_DAYS = 14;

export const ACCOUNT_STATES: readonly AccountLifecycleState[] = ["active", "suspended", "soft_deleted"];

export interface AccountFilter {
  search?: string;
  state?: AccountLifecycleState;
  /** Matches the plan in force: the organisation's for a member, otherwise the account's own. */
  planTierId?: string;
  demo?: boolean;
  page?: number;
}

export interface AdminAccount {
  id: string;
  email: string;
  displayName: string | null;
  companyName: string | null;
  role: AccountRole;
  lifecycleState: AccountLifecycleState;
  isDemo: boolean;
  demoLabel: string | null;
  /** The plan stored on the account itself. */
  ownPlanTierId: string;
  /** The plan in force: the organisation's for a member, otherwise the account's own. */
  planTierId: string;
  createdAt: string;
  lastActivityAt: string | null;
  lastSignInAt: string | null;
  lastSignInMethod: string | null;
  emailVerifiedAt: string | null;
  suspendedAt: string | null;
  removedAt: string | null;
  organization: { id: string; name: string; memberRole: MemberRole } | null;
  /** Candidates the account holds. Null when the candidate records cannot be read. */
  candidates: number | null;
}

export interface AccountPage {
  accounts: AdminAccount[];
  total: number;
  page: number;
  pages: number;
}

interface AccountRow {
  id: string;
  email: string;
  created_at: string;
  role: string;
  lifecycle_state: string;
  is_demo: number | boolean;
  demo_label: string | null;
  company_name: string | null;
  plan_tier_id: string | null;
  last_activity_at: string | null;
  suspended_at: string | null;
  soft_deleted_at: string | null;
  display_name: string | null;
  last_sign_in_at: string | null;
  last_sign_in_method: string | null;
  email_verified_at: string | null;
  member_role: string | null;
  organization_id: string | null;
  organization_name: string | null;
  organization_plan_tier_id: string | null;
}

const ACCOUNT_SELECT = `
  SELECT u.id, u.email, u.created_at, u.role, u.lifecycle_state, u.is_demo, u.demo_label, u.company_name,
         u.plan_tier_id, u.last_activity_at, u.suspended_at, u.soft_deleted_at,
         p.display_name, p.last_sign_in_at, p.last_sign_in_method, p.email_verified_at,
         m.member_role, o.id AS organization_id, o.name AS organization_name, o.plan_tier_id AS organization_plan_tier_id`;

const ACCOUNT_FROM = `
  FROM {users} u
  LEFT JOIN {account_profiles} p ON p.user_id = u.id
  LEFT JOIN {organization_members} m ON m.user_id = u.id
  LEFT JOIN {organizations} o ON o.id = m.organization_id`;

/** The plan in force for an account: its organisation's when it has one. */
const PLAN_IN_FORCE = `COALESCE(o.plan_tier_id, u.plan_tier_id, '${DEFAULT_PLAN_ID}')`;

function mapAccount(row: AccountRow, candidates: number | null): AdminAccount {
  const ownPlanTierId = row.plan_tier_id ?? DEFAULT_PLAN_ID;
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    companyName: row.company_name,
    role: row.role === "ADMIN" ? "ADMIN" : "RECRUITER",
    lifecycleState: ACCOUNT_STATES.find((state) => state === row.lifecycle_state) ?? "suspended",
    isDemo: Boolean(Number(row.is_demo)),
    demoLabel: row.demo_label,
    ownPlanTierId,
    planTierId: row.organization_plan_tier_id ?? ownPlanTierId,
    createdAt: isoOrNull(row.created_at) ?? String(row.created_at),
    lastActivityAt: isoOrNull(row.last_activity_at),
    lastSignInAt: isoOrNull(row.last_sign_in_at),
    lastSignInMethod: row.last_sign_in_method,
    emailVerifiedAt: isoOrNull(row.email_verified_at),
    suspendedAt: isoOrNull(row.suspended_at),
    removedAt: isoOrNull(row.soft_deleted_at),
    organization: row.organization_id && row.organization_name
      ? { id: row.organization_id, name: row.organization_name, memberRole: row.member_role === "ORG_ADMIN" ? "ORG_ADMIN" : "RECRUITER" }
      : null,
    candidates,
  };
}

/** A search term with the pattern characters removed, so it is only ever matched as text. */
function searchPattern(term: string): string {
  return `%${term.toLowerCase().replace(/[%_\\]/g, "")}%`;
}

/** Candidates held by each of the given accounts, or null when the candidate records cannot be read. */
async function candidateCounts(runner: SqlRunner, userIds: readonly string[]): Promise<Map<string, number> | null> {
  if (userIds.length === 0) return new Map();
  try {
    const rows = await runner.all<{ owner_user_id: string; total: number | string }>(
      `SELECT owner_user_id, CAST(COUNT(*) AS INTEGER) AS total FROM {candidates}
       WHERE owner_user_id IN (${userIds.map(() => "?").join(", ")}) GROUP BY owner_user_id`,
      [...userIds],
    );
    return new Map(rows.map((row) => [row.owner_user_id, toCount(row.total)]));
  } catch {
    // The candidate tables are created the first time a candidate is saved.
    return null;
  }
}

/** Accounts newest first, then by identifier, so a page never shifts between two requests for it. */
export async function listAccounts(runner: SqlRunner, filter: AccountFilter = {}): Promise<AccountPage> {
  const where: string[] = [];
  const params: SqlValue[] = [];
  const term = filter.search?.trim();
  if (term) {
    const pattern = searchPattern(term);
    where.push(`(LOWER(u.email) LIKE ? OR LOWER(COALESCE(u.company_name, '')) LIKE ? OR LOWER(COALESCE(p.display_name, '')) LIKE ?
      OR LOWER(COALESCE(o.name, '')) LIKE ? OR u.id = ?)`);
    params.push(pattern, pattern, pattern, pattern, term);
  }
  if (filter.state) { where.push("u.lifecycle_state = ?"); params.push(filter.state); }
  if (filter.planTierId) { where.push(`${PLAN_IN_FORCE} = ?`); params.push(filter.planTierId); }
  if (filter.demo !== undefined) where.push(`u.is_demo = ${runner.bool(filter.demo)}`);
  const condition = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const counted = await runner.get<{ total: number | string }>(`SELECT CAST(COUNT(*) AS INTEGER) AS total ${ACCOUNT_FROM} ${condition}`, params);
  const total = toCount(counted?.total);
  const pages = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.trunc(filter.page ?? 1) || 1), pages);
  const rows = await runner.all<AccountRow>(
    `${ACCOUNT_SELECT} ${ACCOUNT_FROM} ${condition} ORDER BY u.created_at DESC, u.id LIMIT ? OFFSET ?`,
    [...params, ADMIN_PAGE_SIZE, (page - 1) * ADMIN_PAGE_SIZE],
  );
  const counts = await candidateCounts(runner, rows.map((row) => row.id));
  return { accounts: rows.map((row) => mapAccount(row, counts ? counts.get(row.id) ?? 0 : null)), total, page, pages };
}

export async function getAdminAccount(runner: SqlRunner, id: string): Promise<AdminAccount | null> {
  const row = await runner.get<AccountRow>(`${ACCOUNT_SELECT} ${ACCOUNT_FROM} WHERE u.id = ?`, [id]);
  if (!row) return null;
  const counts = await candidateCounts(runner, [row.id]);
  return mapAccount(row, counts ? counts.get(row.id) ?? 0 : null);
}

async function count(runner: SqlRunner, sql: string, params: readonly SqlValue[] = []): Promise<number> {
  return toCount((await runner.get<{ total: number | string }>(sql, params))?.total);
}

/** Whether a table has been created. The candidate tables appear the first time a candidate is saved. */
async function tableExists(runner: SqlRunner, table: string): Promise<boolean> {
  const name = renderSql(`{${table}}`, runner.engine);
  const found = runner.engine === "sqlite"
    ? await runner.get<{ present: unknown }>("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ?", [name])
    : await runner.get<{ present: unknown }>("SELECT to_regclass(?) AS present", [name]);
  return Boolean(found?.present);
}

export interface PlanCount {
  planTierId: string;
  accounts: number;
  organizations: number;
}

export interface AdminOverview {
  /** When these figures were read. */
  generatedAt: string;
  /** Start of the period "new" covers. */
  newSince: string;
  /** Real accounts only. Removed accounts are counted on their own and are in no other figure. */
  accounts: { total: number; active: number; suspended: number; removed: number; newInPeriod: number; free: number; paid: number };
  demoAccounts: number;
  /** Real organisations only. */
  organizations: {
    total: number;
    companies: number;
    agencies: number;
    paid: number;
    trial: number;
    pastDue: number;
    paused: number;
    cancelled: number;
    suspended: number;
    seatsTaken: number;
    seatsInvited: number;
    seatLimit: number;
  };
  demoOrganizations: number;
  /** Real organisations to look at: payment overdue, period ended, or period ending soon. */
  attention: Array<OrganizationSummary & { reason: "past_due" | "period_ended" | "period_ending" }>;
  /**
   * Figures from the candidate records, or null with the reason they cannot be
   * given: the records have not been created yet, or reading them failed.
   */
  work: { candidates: number | null; repositories: number | null; demoCandidates: number | null; unavailable: "no_source_table" | "query_failed" | null };
  plans: PlanCount[];
}

/** A candidate is real when it is not flagged as a demo and does not belong to a demo account. */
async function candidateFigures(runner: SqlRunner, realAccount: string): Promise<AdminOverview["work"]> {
  const none = { candidates: null, repositories: null, demoCandidates: null };
  try {
    if (!(await tableExists(runner, "candidates")) || !(await tableExists(runner, "candidate_analyses"))) return { ...none, unavailable: "no_source_table" };
    const realCandidate = `c.is_demo = ${runner.bool(false)} AND (u.id IS NULL OR ${realAccount})`;
    const source = "FROM {candidates} c LEFT JOIN {users} u ON u.id = c.owner_user_id";
    const [candidates, allCandidates, repositories] = await Promise.all([
      count(runner, `SELECT CAST(COUNT(*) AS INTEGER) AS total ${source} WHERE ${realCandidate}`),
      count(runner, "SELECT CAST(COUNT(*) AS INTEGER) AS total FROM {candidates}"),
      count(runner, `SELECT CAST(COUNT(*) AS INTEGER) AS total FROM {candidate_analyses} a JOIN {candidates} c ON c.id = a.candidate_id
        LEFT JOIN {users} u ON u.id = c.owner_user_id WHERE ${realCandidate}`),
    ]);
    return { candidates, repositories, demoCandidates: allCandidates - candidates, unavailable: null };
  } catch {
    return { ...none, unavailable: "query_failed" };
  }
}

export async function getAdminOverview(runner: SqlRunner, now = Date.now()): Promise<AdminOverview> {
  const generatedAt = new Date(now).toISOString();
  const newSince = new Date(now - NEW_ACCOUNT_DAYS * 86_400_000).toISOString();
  const real = `u.is_demo = ${runner.bool(false)}`;

  const [stateRows, newInPeriod, demoAccounts, planRows, organizations] = await Promise.all([
    runner.all<{ lifecycle_state: string; total: number | string }>(
      `SELECT u.lifecycle_state, CAST(COUNT(*) AS INTEGER) AS total FROM {users} u WHERE ${real} GROUP BY u.lifecycle_state`,
    ),
    count(runner, `SELECT CAST(COUNT(*) AS INTEGER) AS total FROM {users} u WHERE ${real} AND u.lifecycle_state <> 'soft_deleted' AND u.created_at >= ?`, [newSince]),
    count(runner, `SELECT CAST(COUNT(*) AS INTEGER) AS total FROM {users} u WHERE u.is_demo = ${runner.bool(true)} AND u.lifecycle_state <> 'soft_deleted'`),
    runner.all<{ plan: string; total: number | string }>(
      `SELECT ${PLAN_IN_FORCE} AS plan, CAST(COUNT(*) AS INTEGER) AS total
       FROM {users} u
       LEFT JOIN {organization_members} m ON m.user_id = u.id
       LEFT JOIN {organizations} o ON o.id = m.organization_id
       WHERE ${real} AND u.lifecycle_state <> 'soft_deleted' GROUP BY 1`,
    ),
    listOrganizations(runner, {}, generatedAt),
  ]);

  const byState = new Map(stateRows.map((row) => [row.lifecycle_state, toCount(row.total)]));
  const active = byState.get("active") ?? 0;
  const suspended = byState.get("suspended") ?? 0;
  const accountsByPlan = new Map(planRows.map((row) => [row.plan, toCount(row.total)]));
  const paidAccounts = [...accountsByPlan].reduce((sum, [plan, total]) => sum + (planById(plan).paid ? total : 0), 0);

  const realOrganizations = organizations.filter((organization) => !organization.isDemo);
  const standing = realOrganizations.filter((organization) => organization.lifecycleState === "active");
  const withStatus = (status: OrganizationSummary["subscriptionStatus"]) => standing.filter((organization) => organization.subscriptionStatus === status).length;
  const soon = now + RENEWAL_NOTICE_DAYS * 86_400_000;
  const attention: AdminOverview["attention"] = [];
  for (const organization of standing) {
    // The period runs through its last day, so it is over once the following day begins.
    const ends = organization.currentPeriodEnd ? Date.parse(organization.currentPeriodEnd) + 86_400_000 : null;
    const running = organization.subscriptionStatus === "active" || organization.subscriptionStatus === "trial";
    if (organization.subscriptionStatus === "past_due") attention.push({ ...organization, reason: "past_due" });
    else if (running && ends !== null && ends <= now) attention.push({ ...organization, reason: "period_ended" });
    else if (running && ends !== null && ends <= soon) attention.push({ ...organization, reason: "period_ending" });
  }

  const work = await candidateFigures(runner, real);

  const planIds = [...new Set([...PLANS.map((plan) => plan.id), ...accountsByPlan.keys(), ...realOrganizations.map((organization) => organization.planTierId)])];

  return {
    generatedAt,
    newSince,
    accounts: {
      total: active + suspended,
      active,
      suspended,
      removed: byState.get("soft_deleted") ?? 0,
      newInPeriod,
      free: active + suspended - paidAccounts,
      paid: paidAccounts,
    },
    demoAccounts,
    organizations: {
      total: realOrganizations.length,
      companies: realOrganizations.filter((organization) => organization.kind === "company").length,
      agencies: realOrganizations.filter((organization) => organization.kind === "agency").length,
      paid: standing.filter((organization) => organization.subscriptionStatus === "active" && planById(organization.planTierId).paid).length,
      trial: withStatus("trial"),
      pastDue: withStatus("past_due"),
      paused: withStatus("paused"),
      cancelled: withStatus("cancelled"),
      suspended: realOrganizations.length - standing.length,
      seatsTaken: standing.reduce((sum, organization) => sum + organization.members, 0),
      seatsInvited: standing.reduce((sum, organization) => sum + organization.pendingInvitations, 0),
      seatLimit: standing.reduce((sum, organization) => sum + seatLimitFor(organization), 0),
    },
    demoOrganizations: organizations.length - realOrganizations.length,
    attention,
    work,
    plans: planIds.map((planTierId) => ({
      planTierId,
      accounts: accountsByPlan.get(planTierId) ?? 0,
      organizations: realOrganizations.filter((organization) => organization.planTierId === planTierId).length,
    })),
  };
}
