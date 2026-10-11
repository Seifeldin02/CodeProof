import Link from "next/link";
import { NewOrganizationForm } from "@/components/admin/AdminControls";
import { CELL, FILTER_FIELD, FILTER_LABEL, Pagination, ROW_LINK, SubscriptionBadge, TABLE_HEAD } from "@/components/admin/AdminParts";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import PageHeader from "@/components/ui/PageHeader";
import { ORGANIZATION_KIND_LABEL, SUBSCRIPTION_STATUS_LABEL } from "@/features/accounts/copy";
import { getAccountsDatabase } from "@/features/accounts/database";
import { ADMIN_PAGE_SIZE } from "@/features/admin/console-queries";
import { formatCalendarDate } from "@/features/admin/history";
import { requireAdminPage } from "@/features/auth/admin-guard";
import { listOrganizations } from "@/features/organizations/store";
import { ORGANIZATION_KINDS, SUBSCRIPTION_STATUSES } from "@/features/organizations/types";
import { isKnownPlan, planById, PLANS, seatLimitFor } from "@/features/plans/catalog";
import { getI18n } from "@/i18n/server";
import { formatDateForLocale } from "@/i18n/translations";

export const dynamic = "force-dynamic";

type Query = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined): string => (Array.isArray(value) ? value[0] : value) ?? "";

/** Every company and agency, newest first, with its subscription and seats. A new one is set up here. */
export default async function AdminOrganizationsPage({ searchParams }: { searchParams: Promise<Query> }) {
  await requireAdminPage();
  const [{ t, locale }, database, query] = await Promise.all([getI18n(), getAccountsDatabase(), searchParams]);
  const search = first(query.q).trim().slice(0, 120);
  const kind = ORGANIZATION_KINDS.find((value) => value === first(query.kind));
  const status = SUBSCRIPTION_STATUSES.find((value) => value === first(query.status));
  const plan = isKnownPlan(first(query.plan)) ? first(query.plan) : "";
  const filtered = Boolean(search || kind || status || plan);

  // Newest first, then by identifier, so a page never shifts between two requests for it.
  const organizations = await listOrganizations(database.runner, { search, kind, status, planTierId: plan || undefined });
  const pages = Math.max(1, Math.ceil(organizations.length / ADMIN_PAGE_SIZE));
  const page = Math.min(Math.max(1, Number.parseInt(first(query.page), 10) || 1), pages);
  const shown = organizations.slice((page - 1) * ADMIN_PAGE_SIZE, page * ADMIN_PAGE_SIZE);

  const hrefFor = (target: number): string => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (kind) params.set("kind", kind);
    if (status) params.set("status", status);
    if (plan) params.set("plan", plan);
    if (target > 1) params.set("page", String(target));
    const text = params.toString();
    return text ? `/admin/organizations?${text}` : "/admin/organizations";
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("Owner administration")}
        title={t("Organisations")}
        description={t("Companies and recruitment agencies, their subscriptions and their seats. Open one to change its subscription or name its admin.")}
      />

      <Card title={t("Set up an organisation for a customer")} subtitle={t("It starts with no members. Name its admin on the next page.")}>
        <NewOrganizationForm plans={PLANS.map((option) => ({ id: option.id, name: option.name, seats: option.seats }))} />
      </Card>

      <Card title={t("Find an organisation")}>
        <form method="get" action="/admin/organizations" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr_auto] lg:items-end">
          <div className="sm:col-span-2 lg:col-span-1">
            <label htmlFor="organization-search" className={FILTER_LABEL}>{t("Search")}</label>
            <input id="organization-search" name="q" type="search" defaultValue={search} maxLength={120} autoComplete="off" className={FILTER_FIELD} />
          </div>
          <div>
            <label htmlFor="organization-kind" className={FILTER_LABEL}>{t("Kind")}</label>
            <select id="organization-kind" name="kind" defaultValue={kind ?? ""} className={FILTER_FIELD}>
              <option value="">{t("Any kind")}</option>
              {ORGANIZATION_KINDS.map((value) => <option key={value} value={value}>{t(ORGANIZATION_KIND_LABEL[value])}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="organization-status" className={FILTER_LABEL}>{t("Subscription status")}</label>
            <select id="organization-status" name="status" defaultValue={status ?? ""} className={FILTER_FIELD}>
              <option value="">{t("Any status")}</option>
              {SUBSCRIPTION_STATUSES.map((value) => <option key={value} value={value}>{t(SUBSCRIPTION_STATUS_LABEL[value])}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="organization-plan-filter" className={FILTER_LABEL}>{t("Plan")}</label>
            <select id="organization-plan-filter" name="plan" defaultValue={plan} className={FILTER_FIELD}>
              <option value="">{t("Any plan")}</option>
              {PLANS.map((option) => <option key={option.id} value={option.id}>{t(option.name)}</option>)}
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-brand-700">{t("Apply")}</button>
            {filtered && <Link href="/admin/organizations" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:border-brand-300 hover:bg-brand-50">{t("Clear")}</Link>}
          </div>
        </form>
      </Card>

      <Card bodyClassName="!p-0">
        <p role="status" className="border-b border-slate-100 px-4 py-3 text-sm text-slate-700">
          {filtered ? t("Organisations that match: {count}", { count: organizations.length }) : t("Organisations: {count}", { count: organizations.length })}
        </p>
        {shown.length === 0 ? (
          <p className="p-6 text-sm text-slate-600">{filtered ? t("No organisation matches. Change the search or clear the filters.") : t("No organisation has been set up yet.")}</p>
        ) : (
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={t("Organisations")}>
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className={TABLE_HEAD}>
                  <th scope="col" className="px-4 py-3 text-start">{t("Organisation")}</th>
                  <th scope="col" className="px-4 py-3 text-start">{t("Plan")}</th>
                  <th scope="col" className="px-4 py-3 text-start">{t("Subscription")}</th>
                  <th scope="col" className="px-4 py-3 text-end">{t("Seats")}</th>
                  <th scope="col" className="px-4 py-3 text-end">{t("Created")}</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((organization) => (
                  <tr key={organization.id} className="border-b border-slate-50 last:border-0">
                    <td className={CELL}>
                      <Link href={`/admin/organizations/${organization.id}`} className={ROW_LINK}><bdi>{organization.name}</bdi></Link>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                        <span>{t(ORGANIZATION_KIND_LABEL[organization.kind])}</span>
                        {organization.isDemo && <Badge tone="warning">{t("Demo")}</Badge>}
                        {organization.lifecycleState !== "active" && <Badge tone="warning">{t("Paused by us")}</Badge>}
                      </div>
                    </td>
                    <td className={`${CELL} text-slate-700`}>{t(planById(organization.planTierId).name)}</td>
                    <td className={CELL}>
                      <SubscriptionBadge status={organization.subscriptionStatus} t={t} />
                      {organization.currentPeriodEnd && <p className="mt-1 text-xs text-slate-600">{t("Until {date}", { date: formatCalendarDate(locale, organization.currentPeriodEnd) })}</p>}
                    </td>
                    <td className={`${CELL} text-end text-slate-700`}>
                      <span className="tabular-nums">{t("{count} of {total}", { count: organization.members + organization.pendingInvitations, total: seatLimitFor(organization) })}</span>
                      {organization.pendingInvitations > 0 && <p className="text-xs text-slate-600">{t("Invited: {invited}", { invited: organization.pendingInvitations })}</p>}
                    </td>
                    <td className={`${CELL} whitespace-nowrap text-end text-slate-700`}>{formatDateForLocale(locale, organization.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} pages={pages} hrefFor={hrefFor} t={t} />
      </Card>
    </div>
  );
}
