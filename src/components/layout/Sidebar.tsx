"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import BrandMark from "./BrandMark";
import { navItems } from "./navItems";
import { useI18n } from "../i18n/LocaleProvider";

export default function Sidebar() {
  const pathname = usePathname() ?? "";
  const { t } = useI18n();
  return (
    <aside className="workspace-sidebar no-print fixed inset-y-0 start-0 z-40 hidden h-dvh w-64 flex-col overflow-y-auto overscroll-contain border-r border-white/10 bg-[#0b1210] text-white shadow-[18px_0_50px_rgba(15,23,42,.08)] lg:flex">
      <div className="flex h-20 items-center border-b border-white/10 px-5"><BrandMark /></div>
      <nav className="flex-1 space-y-1 px-3 py-5">
        <p className="px-3 pb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{t("Recruiting workspace")}</p>
        {navItems.map((item) => {
          const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
          return (
            <Link key={item.to} href={item.to} className={`group relative flex items-center gap-3 overflow-hidden rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-300 ${active ? "bg-white text-slate-950 shadow-lg shadow-black/20" : "text-slate-400 hover:translate-x-0.5 hover:bg-white/[.06] hover:text-white"}`}>
              {active && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-brand-500" />}
              <item.icon className="h-[18px] w-[18px] shrink-0" />
              <span>{t(item.label)}</span>
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-white/10 px-5 py-5">
        <div className="rounded-xl border border-white/[.07] bg-white/[.035] p-3.5">
          <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.14em] text-lime-300"><span className="live-dot" /> {t("Safe analysis")}</div>
          <p className="text-[11px] leading-relaxed text-slate-500">{t("Public code is inspected as bounded text data. Repository code is never executed.")}</p>
          <Link href="/about" className="mt-3 inline-flex text-[11px] font-semibold text-slate-300 hover:text-lime-300">{t("How it works")} <span className="directional-icon ms-1">→</span></Link>
        </div>
      </div>
    </aside>
  );
}
