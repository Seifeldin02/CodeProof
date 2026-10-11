import Link from "next/link";
import { CELL, FILTER_FIELD, FILTER_LABEL, Pagination, ROW_LINK, StateBadge, TABLE_HEAD } from "@/components/admin/AdminParts";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import PageHeader from "@/components/ui/PageHeader";
import { LIFECYCLE_LABEL, MEMBER_ROLE_LABEL } from "@/features/accounts/copy";
import { getAccountsDatabase } from "@/features/accounts/database";
import { ACCOUNT_STATES, listAccounts } from "@/features/admin/console-queries";
import { requireAdminPage } from "@/features/auth/admin-guard";
import { isKnownPlan, planById, PLANS } from "@/features/plans/catalog";
import { getI18n } from "@/i18n/server";
import { formatDateForLocale } from "@/i18n/translations";

export const dynamic = "force-dynamic";

type Query = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined): string => (Array.isArray(value) ? value[0] : value) ?? "";

/** Every account, newest first, to search and filter. */
export default async function AdminAccountsPage({ searchParams }: { searchParams: Promise<Query> }) {
  await requireAdminPage();
  const [{ t, locale }, database, query] = await Promise.all([getI18n(), getAccountsDatabase(), searchParams]);
  const search = first(query.q).trim().slice(0, 120);
  const state = ACCOUNT_STATES.find((value) => value === first(query.state));
  const plan = isKnownPlan(first(query.plan)) ? first(query.plan) : "";
  const demo = first(query.demo) === "yes" ? true : first(query.demo) === "no" ? false : undefined;
  const { accounts, total, page, pages } = await listAccounts(database.runner, {
    search,
    state,
    planTierId: plan || undefined,
    demo,
    page: Number.parseInt(first(query.page), 10) || 1,
  });
  const filtered = Boolean(search || state || plan || demo !== undefined);

  const hrefFor = (target: number): string => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (state) params.set("state", state);
    if (plan) params.set("plan", plan);
    if (demo !== undefined) params.set("demo", demo ? "yes" : "no");
    if (target > 1) params.set("page", String(target));
    const text = params.toString();
    return text ? `/admin/accounts?${text}` : "/admin/accounts";
  };
  const date = (value: string | null) => (value ? formatDateForLocale(locale, value) : t("Never"));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("Owner administration")}
        title={t("Accounts")}
        description={t("Everyone who has signed in, newest first. Open an account to change its plan or its state.")}
      />

      <Card title={t("Find an account")} subtitle={t("Search an email address, a name, a company, an organisation, or a full account identifier")}>
        <form method="get" action="/admin/accounts" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr_auto] lg:items-end">
          <div className="sm:col-span-2 lg:col-span-1">
            <label htmlFor="account-search" className={FILTER_LABEL}>{t("Search")}</label>
            <input id="account-search" name="q" type="search" defaultValue={search} maxLength={120} autoComplete="off" className={FILTER_FIELD} />
          </div>
          <div>
            <label htmlFor="account-state" className={FILTER_LABEL}>{t("State")}</label>
            <select id="account-state" name="state" defaultValue={state ?? ""} className={FILTER_FIELD}>
              <option value="">{t("Any state")}</option>
              {ACCOUNT_STATES.map((value) => <option key={value} value={value}>{t(LIFECYCLE_LABEL[value])}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="account-plan-filter" className={FILTER_LABEL}>{t("Plan")}</label>
            <select id="account-plan-filter" name="plan" defaultValue={plan} className={FILTER_FIELD}>
              <option value="">{t("Any plan")}</option>
              {PLANS.map((option) => <option key={option.id} value={option.id}>{t(option.name)}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="account-demo" className={FILTER_LABEL}>{t("Real or demo")}</label>
            <select id="account-demo" name="demo" defaultValue={demo === undefined ? "" : demo ? "yes" : "no"} className={FILTER_FIELD}>
              <option value="">{t("Real and demo")}</option>
              <option value="no">{t("Real only")}</option>
              <option value="yes">{t("Demo only")}</option>
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-brand-700">{t("Apply")}</button>
            {filtered && <Link href="/admin/accounts" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:border-brand-300 hover:bg-brand-50">{t("Clear")}</Link>}
          </div>
        </form>
      </Card>

      <Card bodyClassName="!p-0">
        <p role="status" className="border-b border-slate-100 px-4 py-3 text-sm text-slate-700">
          {filtered ? t("Accounts that match: {count}", { count: total }) : t("Accounts: {count}", { count: total })}
        </p>
        {accounts.length === 0 ? <p className="p-6 text-sm text-slate-600">{t("No account matches. Change the search or clear the filters.")}</p> : (
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={t("Accounts")}>
            <table className="w-full min-w-[920px] text-sm">
              <thead>
                <tr className={TABLE_HEAD}>
                  <th scope="col" className="px-4 py-3 text-start">{t("Account")}</th>
                  <th scope="col" className="px-4 py-3 text-start">{t("Organisation")}</th>
                  <th scope="col" className="px-4 py-3 text-start">{t("State")}</th>
                  <th scope="col" className="px-4 py-3 text-start">{t("Plan")}</th>
                  <th scope="col" className="px-4 py-3 text-end">{t("Candidates")}</th>
                  <th scope="col" className="px-4 py-3 text-end">{t("Registered")}</th>
                  <th scope="col" className="px-4 py-3 text-end">{t("Last active")}</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => (
                  <tr key={account.id} className="border-b border-slate-50 last:border-0">
                    <td className={CELL}>
                      <Link href={`/admin/accounts/${account.id}`} className={ROW_LINK}><bdi dir="ltr" className="break-all">{account.email}</bdi></Link>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                        {account.displayName && <bdi>{account.displayName}</bdi>}
                        {account.role === "ADMIN" && <Badge tone="brand">{t("CodeProof owner")}</Badge>}
                        {account.isDemo && <Badge tone="warning">{t("Demo")}</Badge>}
                      </div>
                    </td>
                    <td className={`${CELL} text-slate-700`}>
                      {account.organization ? (
                        <>
                          <Link href={`/admin/organizations/${account.organization.id}`} className={ROW_LINK}><bdi>{account.organization.name}</bdi></Link>
                          <p className="text-xs text-slate-600">{t(MEMBER_ROLE_LABEL[account.organization.memberRole])}</p>
                        </>
                      ) : account.companyName ? <bdi>{account.companyName}</bdi> : <span className="text-slate-500">{t("None")}</span>}
                    </td>
                    <td className={CELL}><StateBadge state={account.lifecycleState} t={t} /></td>
                    <td className={`${CELL} text-slate-700`}>{t(planById(account.planTierId).name)}</td>
                    <td className={`${CELL} text-end tabular-nums text-slate-700`}>{account.candidates === null ? t("Unavailable") : account.candidates}</td>
                    <td className={`${CELL} whitespace-nowrap text-end text-slate-700`}>{date(account.createdAt)}</td>
                    <td className={`${CELL} whitespace-nowrap text-end text-slate-700`}>{date(account.lastActivityAt ?? account.lastSignInAt)}</td>
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
