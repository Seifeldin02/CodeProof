import type { SqlRunner } from "@/features/persistence/sql";

/**
 * Tables for sign-in codes, linked sign-in providers, account profiles and
 * organisations.
 *
 * They are created on first use and only ever added to. They sit beside the
 * remediation migration ledger rather than inside it, so they cannot collide
 * with a migration number added there later. Every table is new: no existing
 * table is altered.
 */
export const ACCOUNTS_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS {account_profiles} (
    user_id TEXT PRIMARY KEY REFERENCES {users}(id) ON DELETE CASCADE,
    display_name TEXT,
    email_verified_at TEXT,
    phone_e164 TEXT,
    phone_verified_at TEXT,
    onboarded_at TEXT,
    last_sign_in_at TEXT,
    last_sign_in_method TEXT,
    updated_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_cp_account_profiles_phone
    ON {account_profiles}(phone_e164) WHERE phone_e164 IS NOT NULL;

  CREATE TABLE IF NOT EXISTS {auth_identities} (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES {users}(id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK(provider IN ('google')),
    subject TEXT NOT NULL,
    email TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_used_at TEXT NOT NULL,
    UNIQUE(provider, subject)
  );
  CREATE INDEX IF NOT EXISTS idx_cp_auth_identities_user ON {auth_identities}(user_id);

  CREATE TABLE IF NOT EXISTS {auth_codes} (
    id TEXT PRIMARY KEY,
    purpose TEXT NOT NULL CHECK(purpose IN ('sign_in', 'phone_verification')),
    channel TEXT NOT NULL CHECK(channel IN ('email', 'sms')),
    subject_digest TEXT NOT NULL,
    code_digest TEXT NOT NULL,
    delivered INTEGER NOT NULL DEFAULT 0 CHECK(delivered IN (0, 1)),
    attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts >= 0),
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    consumed_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_cp_auth_codes_subject ON {auth_codes}(subject_digest, purpose, created_at);

  CREATE TABLE IF NOT EXISTS {organizations} (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK(kind IN ('company', 'agency')),
    plan_tier_id TEXT NOT NULL,
    subscription_status TEXT NOT NULL CHECK(subscription_status IN ('trial', 'active', 'past_due', 'paused', 'cancelled')),
    seat_limit INTEGER CHECK(seat_limit IS NULL OR seat_limit >= 1),
    current_period_start TEXT,
    current_period_end TEXT,
    notes TEXT,
    lifecycle_state TEXT NOT NULL DEFAULT 'active' CHECK(lifecycle_state IN ('active', 'suspended')),
    is_demo INTEGER NOT NULL DEFAULT 0 CHECK(is_demo IN (0, 1)),
    created_by_user_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS {organization_members} (
    organization_id TEXT NOT NULL REFERENCES {organizations}(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL UNIQUE REFERENCES {users}(id) ON DELETE CASCADE,
    member_role TEXT NOT NULL CHECK(member_role IN ('ORG_ADMIN', 'RECRUITER')),
    joined_at TEXT NOT NULL,
    invited_by_user_id TEXT,
    PRIMARY KEY (organization_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS {organization_invites} (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES {organizations}(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    member_role TEXT NOT NULL CHECK(member_role IN ('ORG_ADMIN', 'RECRUITER')),
    token_digest TEXT NOT NULL UNIQUE,
    invited_by_user_id TEXT,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    accepted_at TEXT,
    accepted_by_user_id TEXT,
    revoked_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_cp_org_invites_org ON {organization_invites}(organization_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_cp_org_invites_email ON {organization_invites}(email);
`;

export async function ensureAccountsSchema(runner: SqlRunner): Promise<void> {
  await runner.exec(ACCOUNTS_SCHEMA_SQL);
}
