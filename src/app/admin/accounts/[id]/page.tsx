import Link from "next/link";
import { notFound } from "next/navigation";
import { AccountPlanForm, AccountStateActions } from "@/components/admin/AdminControls";
import { BACK_LINK, History, ROW_LINK, StateBadge } from "@/components/admin/AdminParts";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import PageHeader from "@/components/ui/PageHeader";
import { MEMBER_ROLE_LABEL, SIGN_IN_METHOD_LABEL } from "@/features/accounts/copy";
import { getAccountsDatabase } from "@/features/accounts/database";
import { listIdentities } from "@/features/accounts/identities";
import { getProfile } from "@/features/accounts/profiles";
import { getAdminAccount } from "@/features/admin/console-queries";
import { accountHistory } from "@/features/admin/history";
import { getAdminAuditStore } from "@/features/admin/store";
import { requireAdminPage } from "@/features/auth/admin-guard";
import { getAuthStore } from "@/features/auth/store";
import { planById, PLANS } from "@/features/plans/catalog";
import { getI18n } from "@/i18n/server";
import { formatDateForLocale } from "@/i18n/translations";
import { maskPhone } from "@/services/messaging/sms";

export const dynamic = "force-dynamic";

const ROW = "flex flex-wrap items-baseline justify-between gap-2 py-3 first:pt-0 last:pb-0";
const HISTORY_LENGTH = 20;

/** One account: who it is, the plan it is on, its state, and what owners have changed. */
export default async function AdminAccountPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const [{ t, locale }, database, { id }] = await Promise.all([getI18n(), getAccountsDatabase(), params]);
  const account = await getAdminAccount(database.runner, id);
  if (!account) notFound();

  const [profile, identities, entries] = await Promise.all([
    getProfile(database.runner, account.id),
    listIdentities(database.runner, account.id),
    getAdminAuditStore().list(),
  ]);
  const history = accountHistory(entries, account.id).slice(0, HISTORY_LENGTH);
  const actorIds = [...new Set(history.map((entry) => entry.actorUserId))];
  const actors = new Map((await Promise.all(actorIds.map((actorId) => getAuthStore().findById(actorId)))).flatMap((actor) => (actor ? [[actor.id, actor.email] as const] : [])));
  const google = identities.find((identity) => identity.provider === "google");
  const date = (value: string | null) => (value ? formatDateForLocale(locale, value) : t("Never"));
  const isOwner = account.role === "ADMIN";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("Account")}
        title={account.displayName ?? account.email}
        description={t("Registered on {date}. Changes made here are recorded in the audit log.", { date: date(account.createdAt) })}
        badge={<><StateBadge state={account.lifecycleState} t={t} />{isOwner && <Badge tone="brand">{t("CodeProof owner")}</Badge>}{account.isDemo && <Badge tone="warning">{account.demoLabel ? `${t("Demo")}: ${account.demoLabel}` : t("Demo")}</Badge>}</>}
        actions={<Link href="/admin/accounts" className={BACK_LINK}><span className="directional-icon me-1.5">←</span> {t("All accounts")}</Link>}
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title={t("Details")}>
          <dl className="divide-y divide-slate-100 text-sm">
            <div className={ROW}>
              <dt className="text-slate-600">{t("Email")}</dt>
              <dd className="flex flex-wrap items-center gap-2">
                <bdi dir="ltr" className="break-all font-semibold text-slate-900">{account.email}</bdi>
                {account.emailVerifiedAt ? <Badge tone="positive">{t("Confirmed")}</Badge> : <Badge tone="warning">{t("Not confirmed yet")}</Badge>}
              </dd>
            </div>
            <div className={ROW}>
              <dt className="text-slate-600">{t("Account identifier")}</dt>
              <dd><code dir="ltr" className="break-all text-xs text-slate-700">{account.id}</code></dd>
            </div>
            <div className={ROW}>
              <dt className="text-slate-600">{t("Company")}</dt>
              <dd className="font-semibold text-slate-900">{account.companyName ? <bdi>{account.companyName}</bdi> : t("None")}</dd>
            </div>
            <div className={ROW}>
              <dt className="text-slate-600">{t("Organisation")}</dt>
              <dd className="font-semibold text-slate-900">
                {account.organization
                  ? <><Link href={`/admin/organizations/${account.organization.id}`} className={ROW_LINK}><bdi>{account.organization.name}</bdi></Link> <span className="font-normal text-slate-600">· {t(MEMBER_ROLE_LABEL[account.organization.memberRole])}</span></>
                  : t("None")}
              </dd>
            </div>
            <div className={ROW}>
              <dt className="text-slate-600">{t("Candidates")}</dt>
              <dd className="font-semibold tabular-nums text-slate-900">{account.candidates === null ? t("Unavailable") : account.candidates}</dd>
            </div>
            <div className={ROW}>
              <dt className="text-slate-600">{t("Last signed in")}</dt>
              <dd className="font-semibold text-slate-900">
                {date(account.lastSignInAt)}{account.lastSignInMethod && SIGN_IN_METHOD_LABEL[account.lastSignInMethod] && <span className="font-normal text-slate-600"> · {t(SIGN_IN_METHOD_LABEL[account.lastSignInMethod])}</span>}
              </dd>
            </div>
            <div className={ROW}>
              <dt className="text-slate-600">{t("Last active")}</dt>
              <dd className="font-semibold text-slate-900">{date(account.lastActivityAt)}</dd>
            </div>
            <div className={ROW}>
              <dt className="text-slate-600">Google</dt>
              <dd>{google ? <span className="flex flex-wrap items-center gap-2"><bdi dir="ltr" className="break-all text-slate-700">{google.email}</bdi><Badge tone="positive">{t("Linked")}</Badge></span> : <span className="text-slate-600">{t("Not linked")}</span>}</dd>
            </div>
            <div className={ROW}>
              <dt className="text-slate-600">{t("Mobile number")}</dt>
              <dd>{profile.phone ? <bdi dir="ltr" className="text-slate-700">{maskPhone(profile.phone)}</bdi> : <span className="text-slate-600">{t("None")}</span>}</dd>
            </div>
            {account.suspendedAt && (
              <div className={ROW}>
                <dt className="text-slate-600">{t("Suspended on")}</dt>
                <dd className="font-semibold text-slate-900">{date(account.suspendedAt)}</dd>
              </div>
            )}
            {account.removedAt && (
              <div className={ROW}>
                <dt className="text-slate-600">{t("Removed on")}</dt>
                <dd className="font-semibold text-slate-900">{date(account.removedAt)}</dd>
              </div>
            )}
          </dl>
        </Card>

        <div className="space-y-6">
          <Card title={t("Plan")} subtitle={t("Placed by hand. Nothing here takes payment.")}>
            {account.organization ? (
              <p className="text-sm leading-6 text-slate-700">
                {t("This account uses its organisation's plan:")} <strong className="text-slate-900">{t(planById(account.planTierId).name)}</strong>.{" "}
                <Link href={`/admin/organizations/${account.organization.id}`} className="font-semibold text-brand-700 underline-offset-4 hover:underline">{t("Change it on the organisation")}</Link>
              </p>
            ) : (
              <AccountPlanForm userId={account.id} planTierId={account.ownPlanTierId} plans={PLANS.map((plan) => ({ id: plan.id, name: plan.name, seats: plan.seats }))} />
            )}
          </Card>

          <Card title={t("State")} subtitle={t("A suspended or removed account is signed out and cannot sign in. Nothing it holds is deleted.")}>
            {isOwner
              ? <p className="text-sm leading-6 text-slate-700">{t("An owner account cannot be changed here.")}</p>
              : <AccountStateActions userId={account.id} state={account.lifecycleState} />}
          </Card>
        </div>
      </div>

      <Card title={t("History")} subtitle={t("What owners have changed, newest first")}>
        <History entries={history} actors={actors} t={t} locale={locale} />
      </Card>
    </div>
  );
}
