import Link from "next/link";
import { getI18n } from "@/i18n/server";

export default async function NotFound() {
  const { t } = await getI18n();
  return <div className="mx-auto max-w-xl rounded-[28px] border border-slate-200 bg-white p-8 text-center shadow-card"><span className="font-mono text-xs font-semibold text-brand-700">404</span><h1 className="mt-4 text-3xl font-semibold tracking-[-.04em] text-slate-950">{t("Page not found")}</h1><p className="mt-3 text-sm leading-6 text-slate-500">{t("This candidate or workspace view is not available.")}</p><Link href="/" className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white">{t("Return to dashboard")}</Link></div>;
}
