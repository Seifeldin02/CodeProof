import type { DatabaseSync } from "node:sqlite";
import type { Pool } from "pg";
import { CandidateStore } from "@/features/candidates/store";
import { getPostgresPool } from "@/features/persistence/postgres";
import { assertCanonicalAccountAuthority } from "./account-schema";

interface AccountRow {
  id: string;
  email: string;
  created_at: string;
  role: string;
  lifecycle_state: string;
  is_demo: number | boolean;
  company_name: string | null;
  plan_tier_id: string | null;
  last_activity_at: string | null;
}

export interface AdminAccountSummary {
  id: string;
  email: string;
  createdAt: string;
  role: "RECRUITER" | "ADMIN";
  lifecycleState: "active" | "suspended" | "soft_deleted";
  isDemo: boolean;
  companyName: string | null;
  planTierId: string;
  lastActivityAt: string | null;
}

export interface AdminOverview {
  accounts: AdminAccountSummary[];
  totals: {
    accounts: number;
    activeAccounts: number;
    realCandidates: number;
    demoCandidates: number;
    repositoryAnalyses: number;
    completedInterviews: number;
  };
}

function account(row: AccountRow): AdminAccountSummary {
  const authority = assertCanonicalAccountAuthority({ role: row.role, lifecycleState: row.lifecycle_state });
  return {
    id: row.id,
    email: row.email,
    createdAt: new Date(row.created_at).toISOString(),
    role: authority.role,
    lifecycleState: authority.lifecycleState,
    isDemo: Boolean(row.is_demo),
    companyName: row.company_name,
    planTierId: row.plan_tier_id ?? "pilot-free",
    lastActivityAt: row.last_activity_at ? new Date(row.last_activity_at).toISOString() : null,
  };
}

interface CountRow {
  accounts: number | string;
  active_accounts: number | string;
  real_candidates: number | string;
  demo_candidates: number | string;
  repository_analyses: number | string;
  completed_interviews: number | string;
}

function totals(row: CountRow): AdminOverview["totals"] {
  return {
    accounts: Number(row.accounts),
    activeAccounts: Number(row.active_accounts),
    realCandidates: Number(row.real_candidates),
    demoCandidates: Number(row.demo_candidates),
    repositoryAnalyses: Number(row.repository_analyses),
    completedInterviews: Number(row.completed_interviews),
  };
}

/** A bounded, persisted-only operations view. Never returns password hashes or CV text. */
export function loadSqliteAdminOverview(db: DatabaseSync): AdminOverview {
  const counts = db.prepare(`SELECT
    (SELECT COUNT(*) FROM users) AS accounts,
    (SELECT COUNT(*) FROM users WHERE lifecycle_state = 'active') AS active_accounts,
    (SELECT COUNT(*) FROM candidates WHERE is_demo = 0) AS real_candidates,
    (SELECT COUNT(*) FROM candidates WHERE is_demo = 1) AS demo_candidates,
    (SELECT COUNT(*) FROM candidate_analyses) AS repository_analyses,
    (SELECT COUNT(*) FROM interview_sessions WHERE status = 'completed') AS completed_interviews`).get() as unknown as CountRow;
  const rows = db.prepare(`SELECT id, email, created_at, role, lifecycle_state, is_demo,
    company_name, plan_tier_id, last_activity_at FROM users ORDER BY created_at DESC, id DESC LIMIT 50`).all() as unknown as AccountRow[];
  return { totals: totals(counts), accounts: rows.map(account) };
}

export async function loadPostgresAdminOverview(pool: Pool): Promise<AdminOverview> {
  const [counts, accounts] = await Promise.all([
    pool.query<CountRow>(`SELECT
      (SELECT COUNT(*) FROM codeproof_users) AS accounts,
      (SELECT COUNT(*) FROM codeproof_users WHERE lifecycle_state = 'active') AS active_accounts,
      (SELECT COUNT(*) FROM codeproof_candidates WHERE is_demo = FALSE) AS real_candidates,
      (SELECT COUNT(*) FROM codeproof_candidates WHERE is_demo = TRUE) AS demo_candidates,
      (SELECT COUNT(*) FROM codeproof_candidate_analyses) AS repository_analyses,
      (SELECT COUNT(*) FROM codeproof_interview_sessions WHERE status = 'completed') AS completed_interviews`),
    pool.query<AccountRow>(`SELECT id, email, created_at::text, role, lifecycle_state, is_demo,
      company_name, plan_tier_id, last_activity_at::text FROM codeproof_users
      ORDER BY created_at DESC, id DESC LIMIT 50`),
  ]);
  return { totals: totals(counts.rows[0]), accounts: accounts.rows.map(account) };
}

export async function loadAdminOverview(): Promise<AdminOverview> {
  const pool = getPostgresPool();
  if (pool) return loadPostgresAdminOverview(pool);
  const db = new CandidateStore().db;
  try {
    return loadSqliteAdminOverview(db);
  } finally {
    db.close();
  }
}
