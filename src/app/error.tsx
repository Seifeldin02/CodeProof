"use client";

import { useI18n } from "@/components/i18n/LocaleProvider";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useI18n();
  return <div className="hero-grid mx-auto max-w-2xl overflow-hidden rounded-[28px] bg-slate-950 p-8 text-white shadow-2xl"><span className="font-mono text-[10px] font-semibold uppercase tracking-[.18em] text-rose-300">{t("Workspace error")}</span><h1 className="mt-4 text-3xl font-semibold tracking-[-.04em]">{t("This view could not be assembled.")}</h1><p className="mt-3 text-sm leading-6 text-slate-400">{t("The candidate data has not been changed. Retry the view, then confirm the local server and database are available if the issue continues.")}</p><button type="button" onClick={reset} className="mt-6 min-h-11 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-lime-300">{t("Retry view")}</button></div>;
}
