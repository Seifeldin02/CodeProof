import { loadAdminOverview } from "@/features/admin/overview";
import AccountLifecycleControl from "@/components/admin/AccountLifecycleControl";
import { requireAdminPage } from "@/features/auth/admin-guard";
import { getI18n } from "@/i18n/server";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const actor = await requireAdminPage();
  const [{ locale }, overview] = await Promise.all([getI18n(), loadAdminOverview()]);
  const ar = locale === "ar";
  const copy = ar ? {
    eyebrow: "مساحة المالك المحمية", title: "عمليات CodeProof",
    description: "بيانات فعلية محفوظة في النظام. لا يُخلط المرشحون التجريبيون بالمرشحين الحقيقيين.",
    accounts: "الحسابات", activeAccounts: "الحسابات النشطة", realCandidates: "المرشحون الحقيقيون",
    demoCandidates: "المرشحون التجريبيون", repositoryAnalyses: "تحليلات المستودعات",
    completedInterviews: "المقابلات المكتملة", recentAccounts: "أحدث الحسابات",
    recentDescription: "آخر 50 حسابًا حسب تاريخ الإنشاء. لا تُعرض كلمات المرور أو السير الذاتية هنا.",
    company: "الشركة", tier: "الخطة", joined: "تاريخ الانضمام", activity: "آخر نشاط",
    noActivity: "لا يوجد نشاط مسجل", noAccounts: "لا توجد حسابات بعد.", demo: "تجريبي",
    active: "نشط", suspended: "موقوف", soft_deleted: "محذوف مؤقتًا",
    ADMIN: "مالك", RECRUITER: "مسؤول توظيف",
  } : {
    eyebrow: "Protected owner workspace", title: "CodeProof operations",
    description: "Persisted activity only. Demo candidates remain separate from real candidates.",
    accounts: "Accounts", activeAccounts: "Active accounts", realCandidates: "Real candidates",
    demoCandidates: "Demo candidates", repositoryAnalyses: "Repository analyses",
    completedInterviews: "Completed interviews", recentAccounts: "Recent accounts",
    recentDescription: "Most recent 50 accounts by creation date. Passwords and CVs are never shown here.",
    company: "Company", tier: "Plan", joined: "Joined", activity: "Last activity",
    noActivity: "No activity recorded", noAccounts: "No accounts yet.", demo: "Demo",
    active: "Active", suspended: "Suspended", soft_deleted: "Soft deleted",
    ADMIN: "Owner", RECRUITER: "Recruiter",
  };
  const cards = [
    { label: copy.accounts, value: overview.totals.accounts },
    { label: copy.activeAccounts, value: overview.totals.activeAccounts },
    { label: copy.realCandidates, value: overview.totals.realCandidates },
    { label: copy.demoCandidates, value: overview.totals.demoCandidates },
    { label: copy.repositoryAnalyses, value: overview.totals.repositoryAnalyses },
    { label: copy.completedInterviews, value: overview.totals.completedInterviews },
  ];
  const date = new Intl.DateTimeFormat(ar ? "ar-SA" : "en-US", { dateStyle: "medium" });

  return <div className="min-w-0 space-y-6">
    <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-card sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-[.16em] text-emerald-700">{copy.eyebrow}</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-[-.04em] text-slate-950">{copy.title}</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">{copy.description}</p>
    </header>
    <section aria-label={copy.title} className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      {cards.map((card) => <div key={card.label} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-card sm:p-5">
        <p className="text-xs font-medium leading-5 text-slate-600">{card.label}</p>
        <p className="mt-2 text-3xl font-semibold tabular-nums text-slate-950">{card.value}</p>
      </div>)}
    </section>
    <section className="min-w-0 rounded-3xl border border-slate-200 bg-white p-5 shadow-card sm:p-7">
      <h2 className="text-xl font-semibold text-slate-950">{copy.recentAccounts}</h2>
      <p className="mt-1 text-sm leading-6 text-slate-600">{copy.recentDescription}</p>
      {overview.accounts.length === 0 ? <p className="mt-5 text-sm text-slate-600">{copy.noAccounts}</p> :
        <ul className="mt-5 divide-y divide-slate-100">
          {overview.accounts.map((account) => <li key={account.id} className="grid min-w-0 gap-3 py-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] sm:items-center">
            <div className="min-w-0">
              <bdi dir="ltr" className="block break-all text-start text-sm font-semibold text-slate-900">{account.email}</bdi>
              <p className="mt-1 text-xs text-slate-600">{copy[account.role]} · {copy[account.lifecycleState]}{account.isDemo ? ` · ${copy.demo}` : ""}</p>
              {account.companyName && <p className="mt-1 break-words text-xs text-slate-600">{copy.company}: {account.companyName}</p>}
            </div>
            <dl className="grid grid-cols-2 gap-2 text-xs sm:text-end">
              <div><dt className="text-slate-500">{copy.tier}</dt><dd dir="ltr" className="mt-1 break-all text-start font-medium text-slate-800 sm:text-end">{account.planTierId}</dd></div>
              <div><dt className="text-slate-500">{copy.joined}</dt><dd className="mt-1 font-medium text-slate-800">{date.format(new Date(account.createdAt))}</dd></div>
              <div className="col-span-2"><dt className="text-slate-500">{copy.activity}</dt><dd className="mt-1 text-slate-800">{account.lastActivityAt ? date.format(new Date(account.lastActivityAt)) : copy.noActivity}</dd></div>
            </dl>
            {account.role === "RECRUITER" && account.id !== actor.userId && account.lifecycleState !== "soft_deleted" &&
              <AccountLifecycleControl id={account.id} email={account.email} state={account.lifecycleState} />}
          </li>)}
        </ul>}
    </section>
  </div>;
}
