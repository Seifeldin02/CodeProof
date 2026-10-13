"use client";
import { useI18n } from "@/components/i18n/LocaleProvider";

export default function ReportActions() {
  const { t } = useI18n();
  return <div className="no-print"><button type="button" onClick={() => window.print()} className="min-h-11 rounded-xl bg-slate-950 px-4 py-3 text-xs font-semibold text-white transition hover:bg-brand-700">{t("Print / Save PDF")}</button></div>;
}
