import Link from "next/link";
import { notFound } from "next/navigation";
import { AssignAdminForm, OrganizationDetailsForm, OrganizationStateButton, SubscriptionForm } from "@/components/admin/AdminControls";
import { BACK_LINK, History, ROW_LINK, SubscriptionBadge, Tile } from "@/components/admin/AdminParts";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import PageHeader from "@/components/ui/PageHeader";
import { INVITATION_STATUS_LABEL, MEMBER_ROLE_LABEL, ORGANIZATION_KIND_LABEL } from "@/features/accounts/copy";
import { getAccountsDatabase } from "@/features/accounts/database";
import { dateFieldValue, formatCalendarDate, organizationHistory } from "@/features/admin/history";
import { getAdminAuditStore } from "@/features/admin/store";
import { requireAdminPage } from "@/features/auth/admin-guard";
import { getAuthStore } from "@/features/auth/store";
import { listMemberViews, listOrganizationInvitations, seatUsage } from "@/features/organizations/service";
import { getOrganization } from "@/features/organizations/store";
import { planById, PLANS } from "@/features/plans/catalog";
import { getI18n } from "@/i18n/server";
import { formatDateForLocale } from "@/i18n/translations";

export const dynamic = "force-dynamic";

const HISTORY_LENGTH = 20;

/** One organisation: its subscription, its seats, who administers it, and what owners have changed. */
export default async function AdminOrganizationPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const [{ t, locale }, database, { id }] = await Promise.all([getI18n(), getAccountsDatabase(), params]);
  const organization = await getOrganization(database.runner, id);
  if (!organization) notFound();

  const deps = { database, auth: getAuthStore() };
  const [seats, members, invitations, entries] = await Promise.all([
    seatUsage(database.runner, organization, new Date().toISOString()),
    listMemberViews(deps, organization.id),
    listOrganizationInvitations(deps, organization.id),
    getAdminAuditStore().list(),
  ]);
  const history = organizationHistory(entries, organization.id).slice(0, HISTORY_LENGTH);
  const actorIds = [...new Set(history.map((entry) => entry.actorUserId))];
  const actors = new Map((await Promise.all(actorIds.map((actorId) => getAuthStore().findById(actorId)))).flatMap((actor) => (actor ? [[actor.id, actor.email] as const] : [])));
  const plan = planById(organization.planTierId);
  const admins = members.filter((member) => member.role === "ORG_ADMIN");
  const paused = organization.lifecycleState !== "active";
  const date = (value: string | null) => (value ? formatDateForLocale(locale, value) : t("Never"));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("Organisation")}
        title={organization.name}
        description={t("Created on {date}. Changes made here are recorded in the audit log.", { date: date(organization.createdAt) })}
        badge={<><Badge tone="brand">{t(ORGANIZATION_KIND_LABEL[organization.kind])}</Badge>{organization.isDemo && <Badge tone="warning">{t("Demo")}</Badge>}{paused && <Badge tone="warning">{t("Paused by us")}</Badge>}</>}
        actions={<Link href="/admin/organizations" className={BACK_LINK}><span className="directional-icon me-1.5">←</span> {t("All organisations")}</Link>}
      />

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label={t("Seats")} value={t("{count} of {total}", { count: seats.members + seats.invited, total: seats.limit })} note={t("Members: {members} · Invited: {invited}", { members: seats.members, invited: seats.invited })} />
        <Tile label={t("Plan")} value={t(plan.name)} note={organization.seatLimit === null ? t("Seats from the plan: {seats}", { seats: plan.seats }) : t("Seats set by hand: {seats}", { seats: organization.seatLimit })} />
        <Tile
          label={t("Subscription")}
          value={<SubscriptionBadge status={organization.subscriptionStatus} t={t} />}
          note={organization.currentPeriodEnd ? t("Until {date}", { date: formatCalendarDate(locale, organization.currentPeriodEnd) }) : t("No end date")}
        />
        <Tile label={t("Admins")} value={admins.length} note={admins.length === 0 ? t("Nobody administers this organisation yet.") : undefined} />
      </dl>

      <Card title={t("Subscription")} subtitle={t("Entered by hand when a customer pays or a trial starts. Nothing here takes payment.")}>
        <SubscriptionForm
          organizationId={organization.id}
          plans={PLANS.map((option) => ({ id: option.id, name: option.name, seats: option.seats }))}
          initial={{
            planTierId: organization.planTierId,
            subscriptionStatus: organization.subscriptionStatus,
            seatLimit: organization.seatLimit === null ? "" : String(organization.seatLimit),
            currentPeriodStart: dateFieldValue(organization.currentPeriodStart),
            currentPeriodEnd: dateFieldValue(organization.currentPeriodEnd),
            notes: organization.notes ?? "",
          }}
        />
      </Card>

      <Card title={t("Name the admin")} subtitle={t("The admin invites and removes recruiters and can read every member's candidates. Someone without an account yet gets an invitation.")}>
        <AssignAdminForm organizationId={organization.id} />
      </Card>

      <Card title={t("Members")} subtitle={t("People in this organisation")}>
        {members.length === 0 ? <p className="text-sm text-slate-600">{t("Nobody has joined yet.")}</p> : (
          <ul className="divide-y divide-slate-100">
            {members.map((member) => (
              <li key={member.userId} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2">
                    <Link href={`/admin/accounts/${member.userId}`} className={ROW_LINK}><bdi dir="ltr" className="break-all">{member.email}</bdi></Link>
                    <Badge tone={member.role === "ORG_ADMIN" ? "brand" : "neutral"}>{t(MEMBER_ROLE_LABEL[member.role])}</Badge>
                    {!member.accountActive && <Badge tone="warning">{t("Account unavailable")}</Badge>}
                  </p>
                  {member.displayName && <p className="text-xs text-slate-600"><bdi>{member.displayName}</bdi></p>}
                </div>
                <p className="text-xs leading-5 text-slate-600">{t("Joined {date}", { date: date(member.joinedAt) })} · {t("Last signed in: {date}", { date: date(member.lastSignInAt) })}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={t("Invitations")} subtitle={t("An open invitation holds a seat until it is answered, closed or expires")}>
        {invitations.length === 0 ? <p className="text-sm text-slate-600">{t("No invitations yet.")}</p> : (
          <ul className="divide-y divide-slate-100">
            {invitations.map((invitation) => (
              <li key={invitation.id} className="py-3 first:pt-0 last:pb-0">
                <bdi dir="ltr" className="block break-all text-start text-sm font-semibold text-slate-900">{invitation.email}</bdi>
                <p className="mt-1 text-xs text-slate-600">
                  {t(MEMBER_ROLE_LABEL[invitation.role])} · {t(INVITATION_STATUS_LABEL[invitation.status])}
                  {invitation.status === "pending" && <> · {t("Open until {date}", { date: date(invitation.expiresAt) })}</>}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title={t("Details")}>
          <OrganizationDetailsForm organizationId={organization.id} initial={{ name: organization.name, kind: organization.kind, isDemo: organization.isDemo }} />
        </Card>
        <Card title={t("State")} subtitle={t("A paused organisation keeps its members and their candidates, but nobody can be invited or changed.")}>
          <OrganizationStateButton organizationId={organization.id} state={organization.lifecycleState} />
        </Card>
      </div>

      <Card title={t("History")} subtitle={t("What owners have changed, newest first")}>
        <History entries={history} actors={actors} t={t} locale={locale} />
      </Card>
    </div>
  );
}
