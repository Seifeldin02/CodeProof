import { createHash } from "node:crypto";

export type AdminBootstrapDiagnosticReason =
  | "variable_absent"
  | "variable_empty"
  | "no_matching_account"
  | "admin_bootstrap_divergence";

export interface AdminBootstrapDiagnostic {
  readonly event: "admin_bootstrap_unresolved" | "admin_bootstrap_divergence";
  readonly reason: AdminBootstrapDiagnosticReason;
  readonly emailDigestPrefix?: string;
}

export interface NormalizedAdminBootstrap {
  readonly normalizedEmail: string | null;
  readonly unresolvedDiagnostic: AdminBootstrapDiagnostic | null;
}

export function adminEmailDigestPrefix(normalizedEmail: string): string {
  return createHash("sha256").update(normalizedEmail, "utf8").digest("hex").slice(0, 8);
}

export function normalizeAdminBootstrap(value: string | undefined): NormalizedAdminBootstrap {
  if (value === undefined) {
    return {
      normalizedEmail: null,
      unresolvedDiagnostic: { event: "admin_bootstrap_unresolved", reason: "variable_absent" },
    };
  }
  const normalizedEmail = value.trim().toLowerCase();
  if (!normalizedEmail) {
    return {
      normalizedEmail: null,
      unresolvedDiagnostic: { event: "admin_bootstrap_unresolved", reason: "variable_empty" },
    };
  }
  return { normalizedEmail, unresolvedDiagnostic: null };
}

export function noMatchingAdminDiagnostic(normalizedEmail: string): AdminBootstrapDiagnostic {
  return {
    event: "admin_bootstrap_unresolved",
    reason: "no_matching_account",
    emailDigestPrefix: adminEmailDigestPrefix(normalizedEmail),
  };
}

export function divergentAdminDiagnostic(normalizedEmail: string): AdminBootstrapDiagnostic {
  return {
    event: "admin_bootstrap_divergence",
    reason: "admin_bootstrap_divergence",
    emailDigestPrefix: adminEmailDigestPrefix(normalizedEmail),
  };
}
