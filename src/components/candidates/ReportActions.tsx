"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n/LocaleProvider";

export default function ReportActions() {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  async function copyLink(): Promise<void> {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }
  return <div className="no-print flex flex-wrap gap-2"><button type="button" onClick={() => window.print()} className="min-h-11 rounded-xl bg-slate-950 px-4 py-3 text-xs font-semibold text-white transition hover:bg-brand-700">{t("Print / Save PDF")}</button><button type="button" onClick={copyLink} className="min-h-11 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-semibold text-slate-700 transition hover:border-brand-300">{copied ? t("Link copied") : t("Copy share link")}</button></div>;
}
