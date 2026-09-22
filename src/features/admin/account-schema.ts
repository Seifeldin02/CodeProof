import {
  AccountLifecycleStateSchema,
  AccountRemediationFieldsSchema,
  AccountRoleSchema,
  type AccountLifecycleState,
  type AccountRemediationFields,
  type AccountRole,
} from "@/types/remediation";

/**
 * Canonical account authority values are validated before any write is issued.
 * PostgreSQL also enforces these values with named CHECK constraints; this
 * boundary gives SQLite and every command path the same fail-closed behavior.
 */
export function assertCanonicalAccountAuthority(input: {
  role: unknown;
  lifecycleState: unknown;
}): { role: AccountRole; lifecycleState: AccountLifecycleState } {
  return {
    role: AccountRoleSchema.parse(input.role),
    lifecycleState: AccountLifecycleStateSchema.parse(input.lifecycleState),
  };
}

export function ensureAccountSchema(input: unknown): AccountRemediationFields {
  return AccountRemediationFieldsSchema.parse(input);
}
