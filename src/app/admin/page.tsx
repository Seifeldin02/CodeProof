import Link from "next/link";
import { ROW_LINK, SubscriptionBadge, Tile } from "@/components/admin/AdminParts";
import Card from "@/components/ui/Card";
import PageHeader from "@/components/ui/PageHeader";
import { ATTENTION_REASON_LABEL, ORGANIZATION_KIND_LABEL } from "@/features/accounts/copy";
import { getAccountsDatabase } from "@/features/accounts/database";
import { getAdminOverview, NEW_ACCOUNT_DAYS, RENEWAL_NOTICE_DAYS } from "@/features/admin/console-queries";
import { formatCalendarDate } from "@/features/admin/history";
import { requireAdminPage } from "@/features/auth/admin-guard";
import { planById } from "@/features/plans/catalog";
import { getI18n } from "@/i18n/server";
import { formatDateForLocale } from "@/i18n/translations";

export const dynamic = "force-dynamic";

/** Where the people who run CodeProof see how many accounts and organisations there are, and which need a look. */
export default async function AdminPage() {
  await requireAdminPage();
  const [{ t, locale }, database] = await Promise.all([getI18n(), getAccountsDatabase()]);
  const overview = await getAdminOverview(database.runner);
  const { accounts, organizations, work } = overview;
  const figure = (value: number | null) => (value === null ? t("Unavailable") : value.toLocaleString("en-US"));
  const noFigure = work.unavailable === "query_failed" ? t("The candidate records could not be read.") : t("No candidate has been saved yet, so there is nothing to count.");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("Owner administration")}
        title={t("Accounts, organisations and subscriptions")}
        description={t("Real customers and demo data are counted apart. Every figure is an exact count, read when this page loaded.")}
      />

      <section aria-labelledby="admin-accounts-heading" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="admin-accounts-heading" className="text-sm font-semibold text-slate-900">{t("Real accounts")}</h2>
          <Link href="/admin/accounts" className="inline-flex min-h-11 items-center text-sm font-semibold text-brand-700 hover:text-brand-500">{t("All accounts")} <span className="directional-icon ms-1.5">→</span></Link>
        </div>
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile label={t("Accounts")} value={figure(accounts.total)} note={t("Active: {active} · Suspended: {suspended}", { active: accounts.active, suspended: accounts.suspended })} />
          <Tile label={t("New accounts")} value={figure(accounts.newInPeriod)} note={t("Registered in the last {days} days, since {date}", { days: NEW_ACCOUNT_DAYS, date: formatDateForLocale(locale, overview.newSince) })} />
          <Tile label={t("On a paid plan")} value={figure(accounts.paid)} note={t("Their own plan, or their organisation's")} />
          <Tile label={t("On the free plan")} value={figure(accounts.free)} note={t("Their own plan, and no organisation on a paid one")} />
        </dl>
        <p className="text-xs leading-5 text-slate-600">
          {t("Not in the figures above: demo accounts ({demo}) and removed accounts ({removed}).", { demo: overview.demoAccounts, removed: accounts.removed })}
        </p>
      </section>

      <section aria-labelledby="admin-organizations-heading" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="admin-organizations-heading" className="text-sm font-semibold text-slate-900">{t("Real organisations")}</h2>
          <Link href="/admin/organizations" className="inline-flex min-h-11 items-center text-sm font-semibold text-brand-700 hover:text-brand-500">{t("All organisations")} <span className="directional-icon ms-1.5">→</span></Link>
        </div>
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile label={t("Organisations")} value={figure(organizations.total)} note={t("Companies: {companies} · Agencies: {agencies}", { companies: organizations.companies, agencies: organizations.agencies })} />
          <Tile label={t("Paying")} value={figure(organizations.paid)} note={t("Active on a paid plan. On trial: {trial}", { trial: organizations.trial })} />
          <Tile label={t("Payment overdue")} value={figure(organizations.pastDue)} note={t("Paused: {paused} · Cancelled: {cancelled}", { paused: organizations.paused, cancelled: organizations.cancelled })} />
          <Tile label={t("Seats")} value={t("{count} of {total}", { count: organizations.seatsTaken + organizations.seatsInvited, total: organizations.seatLimit })} note={t("Members: {members} · Invited: {invited}", { members: organizations.seatsTaken, invited: organizations.seatsInvited })} />
        </dl>
        <p className="text-xs leading-5 text-slate-600">
          {t("Not in the figures above: demo organisations ({demo}). Organisations we have paused ({suspended}) are counted only in the total.", { demo: overview.demoOrganizations, suspended: organizations.suspended })}
        </p>
      </section>

      <section aria-labelledby="admin-work-heading" className="space-y-3">
        <h2 id="admin-work-heading" className="text-sm font-semibold text-slate-900">{t("Candidates and repositories")}</h2>
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile label={t("Candidates added")} value={figure(work.candidates)} note={work.candidates === null ? noFigure : t("By real accounts, all time")} />
          <Tile label={t("Repositories read")} value={figure(work.repositories)} note={work.repositories === null ? noFigure : t("For those candidates, all time")} />
          <Tile label={t("Demo candidates")} value={figure(work.demoCandidates)} note={work.demoCandidates === null ? noFigure : t("Counted apart, and in neither figure before")} />
        </dl>
      </section>

      <Card title={t("Organisations to look at")} subtitle={t("Payment overdue, or a period that has ended or ends within {days} days", { days: RENEWAL_NOTICE_DAYS })}>
        {overview.attention.length === 0 ? <p className="text-sm text-slate-600">{t("Nothing needs attention.")}</p> : (
          <ul className="divide-y divide-slate-100">
            {overview.attention.map((organization) => (
              <li key={organization.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <Link href={`/admin/organizations/${organization.id}`} className={ROW_LINK}><bdi>{organization.name}</bdi></Link>
                  <p className="text-xs text-slate-600">
                    {t(ORGANIZATION_KIND_LABEL[organization.kind])} · {t(planById(organization.planTierId).name)}
                    {organization.currentPeriodEnd && <> · {t("Until {date}", { date: formatCalendarDate(locale, organization.currentPeriodEnd) })}</>}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <SubscriptionBadge status={organization.subscriptionStatus} t={t} />
                  <span className="text-xs font-semibold text-slate-700">{t(ATTENTION_REASON_LABEL[organization.reason])}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="text-xs leading-5 text-slate-600">
        {t("Read on {date}. Counts are exact and are not rounded. Usage and cost of AI features are not shown here.", { date: formatDateForLocale(locale, overview.generatedAt) })}
      </p>
    </div>
  );
}
