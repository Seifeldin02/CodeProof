import Link from "next/link";
import {
  CloseInvitationButton,
  CreateOrganizationForm,
  InvitationAnswer,
  InviteMemberForm,
  LeaveOrganizationButton,
  MemberActions,
} from "@/components/accounts/TeamControls";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import PageHeader from "@/components/ui/PageHeader";
import { INVITATION_STATUS_LABEL, MEMBER_ROLE_LABEL, ORGANIZATION_KIND_LABEL, SUBSCRIPTION_STATUS_LABEL } from "@/features/accounts/copy";
import { getAccountsDatabase } from "@/features/accounts/database";
import { getProfile } from "@/features/accounts/profiles";
import { requirePageUser } from "@/features/auth/page-guard";
import { getAuthStore } from "@/features/auth/store";
import { getCandidateStore } from "@/features/candidates/store";
import { getWorkspace, listMemberViews, listOrganizationInvitations, openInvitationsFor } from "@/features/organizations/service";
import { planById } from "@/features/plans/catalog";
import { getI18n } from "@/i18n/server";
import { formatDateForLocale } from "@/i18n/translations";

export const dynamic = "force-dynamic";

const TILE = "rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-card";
const TILE_LABEL = "text-[10px] font-semibold uppercase tracking-wider text-slate-500";
const TILE_VALUE = "mt-2 text-xl font-semibold tracking-[-.02em] text-slate-950";

/**
 * A person's organisation. Its admin manages who is in it; everyone else sees
 * who the admins are and can leave. Someone with no organisation can create
 * one here or answer an invitation.
 */
export default async function TeamPage() {
  const [{ t, locale }, user] = await Promise.all([getI18n(), requirePageUser("/team")]);
  const database = await getAccountsDatabase();
  const deps = { database, auth: getAuthStore() };
  const workspace = await getWorkspace(database.runner, user.id);
  const date = (value: string | null) => (value ? formatDateForLocale(locale, value) : t("Never"));

  if (!workspace) {
    const [profile, invitations] = await Promise.all([getProfile(database.runner, user.id), openInvitationsFor(deps, user.email)]);
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow={t("Your organisation")}
          title={t("Work with your team")}
          description={t("Set up a company or a recruitment agency and invite its recruiters. Each recruiter keeps their own candidates, and only the admin can see everyone's.")}
        />
        {invitations.length > 0 && (
          <Card title={t("Invitations for you")} subtitle={t("Sent to your email address")}>
            <ul className="space-y-3">
              {invitations.map(({ invitation, organization }) => (
                <li key={invitation.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-900"><bdi>{organization.name}</bdi></p>
                    <p className="mt-1 text-xs text-slate-600">{t(ORGANIZATION_KIND_LABEL[organization.kind])} · {t(MEMBER_ROLE_LABEL[invitation.role])} · {t("Open until {date}", { date: date(invitation.expiresAt) })}</p>
                  </div>
                  {profile.emailVerifiedAt
                    ? <InvitationAnswer invitationId={invitation.id} />
                    : <p className="max-w-xs text-xs leading-5 text-slate-600">{t("Open the link in the invitation to join.")}</p>}
                </li>
              ))}
            </ul>
          </Card>
        )}
        <Card title={t("Create an organisation")} subtitle={t("You become its admin")}>
          <CreateOrganizationForm />
        </Card>
      </div>
    );
  }

  const { organization, membership, seats } = workspace;
  const isAdmin = membership.role === "ORG_ADMIN";
  const members = await listMemberViews(deps, organization.id);
  const plan = planById(organization.planTierId);
  const suspended = organization.lifecycleState !== "active";

  const tiles = (
    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <div className={TILE}>
        <dt className={TILE_LABEL}>{t("Seats")}</dt>
        <dd className={TILE_VALUE}>{t("{count} of {total}", { count: seats.members + seats.invited, total: seats.limit })}</dd>
        <dd className="mt-1 text-xs text-slate-600">{t("Members: {members} · Invited: {invited}", { members: seats.members, invited: seats.invited })}</dd>
      </div>
      <div className={TILE}>
        <dt className={TILE_LABEL}>{t("Plan")}</dt>
        <dd className={TILE_VALUE}>{t(plan.name)}</dd>
      </div>
      <div className={TILE}>
        <dt className={TILE_LABEL}>{t("Subscription")}</dt>
        <dd className={TILE_VALUE}>{t(SUBSCRIPTION_STATUS_LABEL[organization.subscriptionStatus])}</dd>
        {organization.currentPeriodEnd && <dd className="mt-1 text-xs text-slate-600">{t("Until {date}", { date: date(organization.currentPeriodEnd) })}</dd>}
      </div>
      <div className={TILE}>
        <dt className={TILE_LABEL}>{t("Your role")}</dt>
        <dd className={TILE_VALUE}>{t(MEMBER_ROLE_LABEL[membership.role])}</dd>
      </div>
    </dl>
  );

  const header = (
    <PageHeader
      eyebrow={t("Your organisation")}
      title={organization.name}
      description={isAdmin
        ? t("You manage who is in this organisation. Each recruiter keeps their own candidates. You can read everyone's; recruiters cannot see each other's.")
        : t("Your candidates are yours. Your organisation's admin can read them; other recruiters cannot.")}
      badge={<><Badge tone="brand">{t(ORGANIZATION_KIND_LABEL[organization.kind])}</Badge>{organization.isDemo && <Badge tone="warning">{t("Demo")}</Badge>}</>}
      actions={isAdmin ? <Link href="/team/candidates" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-brand-300 hover:bg-brand-50">{t("Everyone's candidates")} <span className="directional-icon ms-1.5">→</span></Link> : undefined}
    />
  );

  const suspendedNote = suspended && (
    <p role="note" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
      {t("This organisation is paused by CodeProof. Members cannot be invited or changed until it is restored. Contact support.")}
    </p>
  );

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        {header}
        {suspendedNote}
        {tiles}
        <Card title={t("Admins")} subtitle={t("Ask them about seats, invitations and your organisation's plan")}>
          <ul className="space-y-2">
            {members.filter((member) => member.role === "ORG_ADMIN").map((member) => (
              <li key={member.userId} className="text-sm text-slate-800">
                {member.displayName && <span className="font-semibold">{member.displayName} · </span>}
                <bdi dir="ltr" className="text-slate-600">{member.email}</bdi>
              </li>
            ))}
          </ul>
        </Card>
        <Card title={t("Leave")} subtitle={t("Your account and your candidates stay yours")}>
          <LeaveOrganizationButton userId={user.id} />
        </Card>
      </div>
    );
  }

  const [invitations, candidateCounts] = await Promise.all([
    listOrganizationInvitations(deps, organization.id),
    Promise.all(members.map(async (member) => (await getCandidateStore().listCandidates(member.userId)).length)),
  ]);
  const seatsLeft = seats.limit - seats.members - seats.invited;

  return (
    <div className="space-y-6">
      {header}
      {suspendedNote}
      {tiles}

      <Card title={t("Invite a recruiter")} subtitle={t("They sign in with the address you enter here, and the link works only for that address")}>
        <InviteMemberForm seatsLeft={suspended ? 0 : seatsLeft} />
      </Card>

      <Card title={t("Members")} subtitle={t("People in this organisation")}>
        <ul className="divide-y divide-slate-100">
          {members.map((member, index) => (
            <li key={member.userId} className="grid gap-3 py-4 first:pt-0 last:pb-0 lg:grid-cols-[1.4fr_1fr_auto] lg:items-center">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
                  <bdi>{member.displayName ?? member.email}</bdi>
                  <Badge tone={member.role === "ORG_ADMIN" ? "brand" : "neutral"}>{t(MEMBER_ROLE_LABEL[member.role])}</Badge>
                  {member.userId === user.id && <Badge>{t("You")}</Badge>}
                  {!member.accountActive && <Badge tone="warning">{t("Account unavailable")}</Badge>}
                </p>
                {member.displayName && <bdi dir="ltr" className="mt-1 block break-all text-start text-xs text-slate-600">{member.email}</bdi>}
              </div>
              <p className="text-xs leading-5 text-slate-600">
                {t("Candidates: {count}", { count: candidateCounts[index] })}
                {" · "}{t("Joined {date}", { date: date(member.joinedAt) })}
                {" · "}{t("Last signed in: {date}", { date: date(member.lastSignInAt) })}
              </p>
              {!suspended && <MemberActions userId={member.userId} role={member.role} isSelf={member.userId === user.id} />}
            </li>
          ))}
        </ul>
      </Card>

      <Card title={t("Invitations")} subtitle={t("An open invitation holds a seat until it is answered, closed or expires")}>
        {invitations.length === 0 ? <p className="text-sm text-slate-600">{t("No invitations yet.")}</p> : (
          <ul className="divide-y divide-slate-100">
            {invitations.map((invitation) => (
              <li key={invitation.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <bdi dir="ltr" className="block break-all text-start text-sm font-semibold text-slate-900">{invitation.email}</bdi>
                  <p className="mt-1 text-xs text-slate-600">
                    {t(MEMBER_ROLE_LABEL[invitation.role])} · {t(INVITATION_STATUS_LABEL[invitation.status])}
                    {invitation.status === "pending" && <> · {t("Open until {date}", { date: date(invitation.expiresAt) })}</>}
                  </p>
                </div>
                {invitation.status === "pending" && <CloseInvitationButton invitationId={invitation.id} />}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
