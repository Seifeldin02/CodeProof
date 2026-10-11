import { CELL, TABLE_HEAD } from "@/components/admin/AdminParts";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import PageHeader from "@/components/ui/PageHeader";
import { getAccountsDatabase } from "@/features/accounts/database";
import { getAdminOverview } from "@/features/admin/console-queries";
import { requireAdminPage } from "@/features/auth/admin-guard";
import { isKnownPlan, planById } from "@/features/plans/catalog";
import { getI18n } from "@/i18n/server";

export const dynamic = "force-dynamic";

/** The plans an account or an organisation can be placed on, and how many real ones are on each. */
export default async function AdminPlansPage() {
  await requireAdminPage();
  const [{ t }, database] = await Promise.all([getI18n(), getAccountsDatabase()]);
  const { plans } = await getAdminOverview(database.runner);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("Owner administration")}
        title={t("Plans")}
        description={t("Plans are placed by hand on an account or an organisation. No payment is taken in the product, and no price is stored here.")}
      />

      <Card bodyClassName="!p-0">
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={t("Plans")}>
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className={TABLE_HEAD}>
                <th scope="col" className="px-4 py-3 text-start">{t("Plan")}</th>
                <th scope="col" className="px-4 py-3 text-start">{t("Who it is for")}</th>
                <th scope="col" className="px-4 py-3 text-end">{t("Seats")}</th>
                <th scope="col" className="px-4 py-3 text-end">{t("Organisations")}</th>
                <th scope="col" className="px-4 py-3 text-end">{t("Accounts")}</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((usage) => {
                const plan = planById(usage.planTierId);
                const known = isKnownPlan(usage.planTierId);
                return (
                  <tr key={usage.planTierId} className="border-b border-slate-50 last:border-0">
                    <th scope="row" className={`${CELL} text-start font-semibold text-slate-900`}>
                      {known ? t(plan.name) : <code dir="ltr">{usage.planTierId}</code>}
                      <div className="mt-1 flex flex-wrap gap-2">
                        {known ? <Badge tone={plan.paid ? "brand" : "neutral"}>{plan.paid ? t("Paid") : t("Free")}</Badge> : <Badge tone="warning">{t("Not in the plan list")}</Badge>}
                      </div>
                    </th>
                    <td className={`${CELL} text-slate-700`}>{known ? t(plan.summary) : t("An identifier stored before this list existed. Treated as unpaid with one seat.")}</td>
                    <td className={`${CELL} text-end tabular-nums text-slate-700`}>{plan.seats}</td>
                    <td className={`${CELL} text-end tabular-nums text-slate-700`}>{usage.organizations}</td>
                    <td className={`${CELL} text-end tabular-nums text-slate-700`}>{usage.accounts}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="text-xs leading-5 text-slate-600">
        {t("Seats are how many people an organisation on the plan may hold, unless a different number is set for that organisation. The counts are real organisations and real accounts, with removed accounts left out; an account in an organisation is counted under the organisation's plan.")}
      </p>
    </div>
  );
}
