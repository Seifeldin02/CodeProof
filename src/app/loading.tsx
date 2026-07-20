import { getI18n } from "@/i18n/server";

export default async function Loading() {
  const { t } = await getI18n();
  return (
    <div className="space-y-5" role="status" aria-live="polite" aria-label={t("Loading workspace")}>
      <div className="skeleton-surface h-44 rounded-[28px] bg-slate-900/90">
        <span className="skeleton-line start-6 top-8 h-2 w-28 bg-white/15" />
        <span className="skeleton-line start-6 top-14 h-8 w-2/3 bg-white/10" />
        <span className="skeleton-line start-6 top-28 h-3 w-1/2 bg-white/10" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="skeleton-surface h-28 rounded-2xl border border-slate-200 bg-white/80">
            <span className="skeleton-line start-5 top-5 h-2 w-24" />
            <span className="skeleton-line start-5 top-12 h-7 w-16" />
            <span className="skeleton-line start-5 top-[84px] h-2 w-32" />
          </div>
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <div className="skeleton-surface h-80 rounded-2xl border border-slate-200 bg-white/80" />
        <div className="skeleton-surface h-80 rounded-2xl border border-slate-200 bg-white/80" />
      </div>
      <span className="sr-only">{t("Loading recruiter evidence workspace")}</span>
    </div>
  );
}
