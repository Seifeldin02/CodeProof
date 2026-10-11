import { fail, ok, readBody, text } from "@/features/accounts/http";
import {
  assignOrganizationAdmin,
  changeOrganizationDetails,
  changeOrganizationState,
  changeSubscription,
  type AdminCommandDependencies,
} from "@/features/admin/console-commands";
import { adminCommandDependencies, adminCommandFailure } from "@/features/admin/http";
import { invitationEmail } from "@/features/auth-codes/messages";
import { AdminAccessDenied, adminApiDenial, requireAdmin } from "@/features/auth/admin-guard";
import { publicOrigin } from "@/features/auth/finish-sign-in";
import { denyCrossOrigin } from "@/features/auth/guard";
import { ORGANIZATION_LIMITS } from "@/features/organizations/types";
import { isLocale } from "@/i18n/translations";
import { configuredMailProvider } from "@/services/messaging/mail";
import type { AdminActor } from "@/types/remediation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** An empty field means "no override"; anything else must be a whole number. */
function seatLimit(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const seats = typeof value === "number" ? value : Number(typeof value === "string" ? value.trim() : Number.NaN);
  return Number.isFinite(seats) ? seats : Number.NaN;
}

/**
 * Names the organisation's admin. When nobody has that address yet, the
 * invitation link is returned once for the owner to pass on, and is also
 * emailed when a mail service is configured.
 */
async function assignAdmin(request: Request, deps: AdminCommandDependencies, organizationId: string, body: Record<string, unknown>): Promise<Response> {
  const assigned = await assignOrganizationAdmin(deps, organizationId, text(body.email, 254));
  if (!assigned.ok) return adminCommandFailure(assigned.code);
  if (assigned.outcome !== "invited") return ok({ outcome: assigned.outcome, email: assigned.email });

  const link = `${publicOrigin(request)}/join/${assigned.token}`;
  let emailed = false;
  const mail = configuredMailProvider();
  if (mail) {
    try {
      await mail.send(invitationEmail(typeof body.locale === "string" && isLocale(body.locale) ? body.locale : "en", {
        to: assigned.email,
        organization: assigned.organization.name,
        inviter: "CodeProof",
        link,
        days: ORGANIZATION_LIMITS.invitationDays,
      }));
      emailed = true;
    } catch {
      // The invitation still exists: the owner can send the link themselves.
    }
  }
  return ok({ outcome: "invited", email: assigned.email, link, emailed }, 201);
}

/** Changes an organisation's subscription or details, pauses or restores it, or names its admin. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  let actor: AdminActor;
  try {
    actor = await requireAdmin(request);
  } catch (error) {
    if (error instanceof AdminAccessDenied) return adminApiDenial();
    throw error;
  }
  const crossOrigin = denyCrossOrigin(request);
  if (crossOrigin) return crossOrigin;
  const body = await readBody(request);
  if (!body) return fail(400, "INVALID_INPUT");
  const { id } = await params;
  const deps = await adminCommandDependencies(request, actor);

  switch (text(body.action, 20)) {
    case "subscription": {
      const changed = await changeSubscription(deps, id, {
        planTierId: text(body.planTierId, 80),
        subscriptionStatus: text(body.subscriptionStatus, 20),
        seatLimit: seatLimit(body.seatLimit),
        currentPeriodStart: typeof body.currentPeriodStart === "string" ? body.currentPeriodStart : null,
        currentPeriodEnd: typeof body.currentPeriodEnd === "string" ? body.currentPeriodEnd : null,
        notes: typeof body.notes === "string" ? body.notes : null,
      });
      return changed.ok ? ok() : adminCommandFailure(changed.code);
    }
    case "details": {
      const changed = await changeOrganizationDetails(deps, id, { name: text(body.name, 200), kind: text(body.kind, 20), isDemo: body.isDemo === true });
      return changed.ok ? ok() : adminCommandFailure(changed.code);
    }
    case "suspend":
    case "restore": {
      const changed = await changeOrganizationState(deps, id, body.action === "suspend" ? "suspend" : "restore");
      return changed.ok ? ok() : adminCommandFailure(changed.code);
    }
    case "admin":
      return assignAdmin(request, deps, id, body);
    default:
      return fail(400, "INVALID_INPUT");
  }
}
