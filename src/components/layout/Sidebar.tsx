"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import BrandMark from "./BrandMark";
import { navItems } from "./navItems";

export default function Sidebar() {
  const pathname = usePathname() ?? "";
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-slate-950 text-white lg:flex">
      <div className="flex h-20 items-center border-b border-white/10 px-5"><BrandMark /></div>
      <nav className="flex-1 space-y-1 px-3 py-5">
        <p className="px-3 pb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Recruiting workspace</p>
        {navItems.map((item) => {
          const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
          return (
            <Link key={item.to} href={item.to} className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${active ? "bg-white text-slate-950" : "text-slate-400 hover:bg-white/5 hover:text-white"}`}>
              <item.icon className="h-[18px] w-[18px] shrink-0" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-white/10 px-5 py-5">
        <p className="text-[11px] leading-relaxed text-slate-500">Public code is inspected as bounded text data. Repository code is never executed.</p>
      </div>
    </aside>
  );
}
