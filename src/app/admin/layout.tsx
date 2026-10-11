import type { ReactNode } from "react";
import Link from "next/link";
import { requireAdminPage } from "@/features/auth/admin-guard";
import { getI18n } from "@/i18n/server";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const [actor, { locale }] = await Promise.all([requireAdminPage(), getI18n()]);
  const copy = locale === "ar"
    ? { area: "إدارة المالك", overview: "نظرة عامة", accounts: "الحسابات", organizations: "المؤسسات", plans: "الخطط", audit: "سجل التدقيق" }
    : { area: "Owner administration", overview: "Overview", accounts: "Accounts", organizations: "Organisations", plans: "Plans", audit: "Audit log" };
  const link = "inline-flex min-h-11 items-center rounded-lg px-3 py-2 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2";
  return (
    <section className="min-w-0" aria-label={copy.area}>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-300 bg-slate-950 px-5 py-4 text-white">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.16em] text-emerald-300">{copy.area}</p>
          <bdi className="mt-1 block text-sm text-slate-300">{actor.email}</bdi>
        </div>
        <nav aria-label={copy.area} className="flex flex-wrap items-center gap-1 text-sm font-semibold">
          <Link className={link} href="/admin">{copy.overview}</Link>
          <Link className={link} href="/admin/accounts">{copy.accounts}</Link>
          <Link className={link} href="/admin/organizations">{copy.organizations}</Link>
          <Link className={link} href="/admin/plans">{copy.plans}</Link>
          <Link className={link} href="/admin/audit">{copy.audit}</Link>
        </nav>
      </div>
      {children}
    </section>
  );
}
