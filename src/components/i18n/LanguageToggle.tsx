"use client";

import { useI18n } from "./LocaleProvider";

export default function LanguageToggle() {
  const { locale, setLocale, isPending, t } = useI18n();
  const next = locale === "en" ? "ar" : "en";
  return <button type="button" onClick={() => setLocale(next)} disabled={isPending} aria-label={t(locale === "en" ? "Switch to Arabic" : "Switch to English")} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-brand-300 hover:bg-brand-50 disabled:opacity-60"><span className="tech-ltr">{locale === "en" ? "العربية" : "EN"}</span></button>;
}
