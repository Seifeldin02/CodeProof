"use client";

import { usePathname } from "next/navigation";
import Badge from "../ui/Badge";
import BrandMark from "./BrandMark";
import { navItems } from "./navItems";
import LanguageToggle from "../i18n/LanguageToggle";
import { useI18n } from "../i18n/LocaleProvider";

export default function Topbar() {
  const pathname = usePathname() ?? "";
  const { t } = useI18n();
  const current = navItems.find((item) => item.to === "/" ? pathname === "/" : pathname.startsWith(item.to));
  return (
    <header role="banner" className="sticky top-0 z-30 flex h-20 items-center justify-between gap-3 border-b border-slate-200/80 bg-white/80 px-4 shadow-[0_1px_20px_rgba(15,23,42,.035)] backdrop-blur-xl lg:px-8">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-slate-950 p-1.5 lg:hidden"><BrandMark compact /></div>
        <div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">{t("CodeProof workspace")}</p><p className="mt-1 text-sm font-semibold text-slate-900">{t(current?.label ?? "Recruiter workspace")}</p></div>
      </div>
      <div className="flex items-center gap-3">
        <span className="hidden sm:inline-flex"><Badge tone="positive">{t("Free deterministic engine")}</Badge></span>
        <LanguageToggle />
        <span className="avatar-ring grid h-9 w-9 place-items-center rounded-full bg-slate-900 text-xs font-semibold text-white" title={t("Recruiter workspace")}>RM</span>
      </div>
    </header>
  );
}
