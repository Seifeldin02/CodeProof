import { getAccountsDatabase } from "@/features/accounts/database";
import { fail } from "@/features/accounts/http";
import { adminApiDenial } from "@/features/auth/admin-guard";
import type { AdminActor } from "@/types/remediation";
import type { AdminCommandDependencies, AdminCommandFailure } from "./console-commands";
import { adminAuditContext } from "./request-context";
import { getAdminAuditStore } from "./store";

/** What an owner command needs, once the route has established who is asking. */
export async function adminCommandDependencies(request: Request, actor: AdminActor): Promise<AdminCommandDependencies> {
  // The tables these commands write to are created the first time this database is opened.
  await getAccountsDatabase();
  return { audit: getAdminAuditStore(), actor, context: adminAuditContext(request) };
}

const STATUS: Record<Exclude<AdminCommandFailure, "RESOURCE_UNAVAILABLE">, number> = {
  CANNOT_CHANGE_OWNER: 409,
  NOTHING_TO_CHANGE: 409,
  UNKNOWN_PLAN: 400,
  PLAN_FROM_ORGANIZATION: 409,
  INVALID_STATE: 400,
  INVALID_SEATS: 400,
  INVALID_DATE: 400,
  INVALID_NOTES: 400,
  INVALID_NAME: 400,
  INVALID_KIND: 400,
  INVALID_EMAIL: 400,
  ACCOUNT_IN_ANOTHER_ORGANIZATION: 409,
  ACCOUNT_NOT_ACTIVE: 409,
  NO_FREE_SEAT: 409,
};

/** A target that does not exist answers exactly as a request from someone who is not an owner does. */
export function adminCommandFailure(code: AdminCommandFailure): Response {
  return code === "RESOURCE_UNAVAILABLE" ? adminApiDenial() : fail(STATUS[code], code);
}
