import { getAccountsDatabase } from "@/features/accounts/database";
import { fail, ok, organizationFailure, readBody, signedInRequest, text } from "@/features/accounts/http";
import { getProfile } from "@/features/accounts/profiles";
import { invitationEmail } from "@/features/auth-codes/messages";
import { publicOrigin } from "@/features/auth/finish-sign-in";
import { clientAddressLimited } from "@/features/auth/request-limit";
import { getAuthStore } from "@/features/auth/store";
import { inviteMember } from "@/features/organizations/service";
import { ORGANIZATION_LIMITS } from "@/features/organizations/types";
import { isLocale } from "@/i18n/translations";
import { configuredMailProvider } from "@/services/messaging/mail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Invites someone to the organisation. The link is returned once, for the
 * admin to copy, and is also emailed when a mail service is configured.
 */
export async function POST(request: Request): Promise<Response> {
  const user = await signedInRequest(request);
  if (user instanceof Response) return user;
  if (clientAddressLimited(request, "invite", { max: 40, windowMs: 15 * 60_000 })) return fail(429, "RATE_LIMITED");
  const body = await readBody(request);
  if (!body) return fail(400, "INVALID_INPUT");

  const database = await getAccountsDatabase();
  const invited = await inviteMember({ database, auth: getAuthStore() }, user.id, { email: text(body.email, 254), role: text(body.role, 20) || undefined });
  if (!invited.ok) return organizationFailure(invited.code);

  const link = `${publicOrigin(request)}/join/${invited.token}`;
  let emailed = false;
  const mail = configuredMailProvider();
  if (mail) {
    try {
      const inviter = (await getProfile(database.runner, user.id)).displayName ?? user.email;
      await mail.send(invitationEmail(typeof body.locale === "string" && isLocale(body.locale) ? body.locale : "en", {
        to: invited.invitation.email,
        organization: invited.organization.name,
        inviter,
        link,
        days: ORGANIZATION_LIMITS.invitationDays,
      }));
      emailed = true;
    } catch {
      // The invitation still exists: the admin can send the link themselves.
    }
  }
  return ok({ invitation: { id: invited.invitation.id, email: invited.invitation.email, role: invited.invitation.role, expiresAt: invited.invitation.expiresAt }, link, emailed }, 201);
}
