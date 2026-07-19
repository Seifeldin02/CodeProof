import { getI18n } from "@/i18n/server";

export default async function Loading() {
  const { t } = await getI18n();
  return <div className="space-y-5" aria-label={t("Loading workspace")}><div className="h-44 animate-pulse rounded-[28px] bg-slate-900/90" /><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-28 animate-pulse rounded-2xl border border-slate-200 bg-white/80" />)}</div><div className="grid gap-5 xl:grid-cols-2"><div className="h-80 animate-pulse rounded-2xl border border-slate-200 bg-white/80" /><div className="h-80 animate-pulse rounded-2xl border border-slate-200 bg-white/80" /></div><span className="sr-only">{t("Loading recruiter evidence workspace")}</span></div>;
}
