"use client";

import { usePathname } from "next/navigation";
import Badge from "../ui/Badge";
import BrandMark from "./BrandMark";
import { navItems } from "./navItems";

export default function Topbar() {
  const pathname = usePathname() ?? "";
  const current = navItems.find((item) => item.to === "/" ? pathname === "/" : pathname.startsWith(item.to));
  return (
    <header className="sticky top-0 z-30 flex h-20 items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur lg:px-8">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-slate-950 p-1.5 lg:hidden"><BrandMark compact /></div>
        <div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">CodeProof workspace</p><p className="mt-1 text-sm font-semibold text-slate-900">{current?.label ?? "Recruiter intelligence"}</p></div>
      </div>
      <div className="flex items-center gap-3">
        <Badge tone="positive">Free deterministic engine</Badge>
        <span className="grid h-9 w-9 place-items-center rounded-full bg-slate-900 text-xs font-semibold text-white" title="Recruiter workspace">RM</span>
      </div>
    </header>
  );
}
