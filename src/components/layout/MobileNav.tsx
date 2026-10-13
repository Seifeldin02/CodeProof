"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navItems } from "./navItems";
import { useI18n } from "../i18n/LocaleProvider";
import NavPendingHint from "./NavPendingHint";
import { ShieldCheckIcon } from "../ui/icons";

export default function MobileNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname() ?? "";
  const { t, locale } = useI18n();
  return (
    <nav className="no-print fixed inset-x-0 bottom-0 z-40 flex overflow-x-auto border-t border-slate-200 bg-white/95 px-1 pb-[max(.35rem,env(safe-area-inset-bottom))] pt-1.5 shadow-[0_-10px_30px_rgba(15,23,42,.08)] backdrop-blur-xl lg:hidden" aria-label={t("Recruiting workspace")}>
      {navItems.map((item) => {
        const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
        return <Link key={item.to} href={item.to} className={`relative flex min-h-14 min-w-[64px] flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[9px] font-semibold transition ${active ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"}`}><item.icon className="h-4 w-4" /><span className="max-w-full truncate">{t(item.mobileLabel ?? item.label)}</span><NavPendingHint mobile /></Link>;
      })}
      {isAdmin && <Link href="/admin" className={`relative flex min-h-14 min-w-[64px] flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[9px] font-semibold ${pathname.startsWith("/admin") ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"}`}>
        <ShieldCheckIcon className="h-4 w-4" /><span>{locale === "ar" ? "المالك" : "Owner"}</span><NavPendingHint mobile />
      </Link>}
    </nav>
  );
}
