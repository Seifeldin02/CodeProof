"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navItems } from "./navItems";
import { useI18n } from "../i18n/LocaleProvider";

export default function MobileNav() {
  const pathname = usePathname() ?? "";
  const { t } = useI18n();
  return (
    <nav className="no-print fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 border-t border-slate-200 bg-white/95 px-1 pb-[max(.35rem,env(safe-area-inset-bottom))] pt-1.5 shadow-[0_-10px_30px_rgba(15,23,42,.08)] backdrop-blur-xl lg:hidden" aria-label={t("Recruiting workspace")}>
      {navItems.map((item) => {
        const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
        return <Link key={item.to} href={item.to} className={`flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[9px] font-semibold transition ${active ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"}`}><item.icon className="h-4 w-4" /><span className="max-w-full truncate">{t(item.mobileLabel ?? item.label)}</span></Link>;
      })}
    </nav>
  );
}
