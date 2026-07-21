"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import Badge from "../ui/Badge";
import BrandMark from "./BrandMark";
import { navItems } from "./navItems";
import LanguageToggle from "../i18n/LanguageToggle";
import { useI18n } from "../i18n/LocaleProvider";
import type { AuthUser } from "@/features/auth/store";

export default function Topbar({ user }: { user: AuthUser }) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const { t } = useI18n();
  const current = navItems.find((item) => item.to === "/" ? pathname === "/" : pathname.startsWith(item.to));
  const initials = user.email.slice(0, 2).toUpperCase();
  async function logout(): Promise<void> {
    setLoggingOut(true);
    const response = await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    if (!response?.ok) {
      setLoggingOut(false);
      return;
    }
    router.replace("/");
    router.refresh();
  }
  return (
    <header role="banner" className="sticky top-0 z-30 flex h-20 items-center justify-between gap-3 border-b border-slate-200/80 bg-white/80 px-4 shadow-[0_1px_20px_rgba(15,23,42,.035)] backdrop-blur-xl lg:px-8">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-slate-950 p-1.5 lg:hidden"><BrandMark compact /></div>
        <div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">{t("CodeProof workspace")}</p><p className="mt-1 text-sm font-semibold text-slate-900">{t(current?.label ?? "Recruiter workspace")}</p></div>
      </div>
      <div className="flex items-center gap-3">
        <span className="hidden sm:inline-flex"><Badge tone="positive">{t("Free deterministic engine")}</Badge></span>
        <LanguageToggle />
        <button type="button" onClick={logout} disabled={loggingOut} aria-label={t("Sign out")} className="group flex min-h-11 items-center gap-2 rounded-xl px-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" title={t("Sign out")}>
          <span className="hidden max-w-40 truncate text-xs text-slate-500 xl:block" dir="ltr">{user.email}</span>
          <span className="avatar-ring grid h-9 w-9 place-items-center rounded-full bg-slate-900 text-xs font-semibold text-white group-hover:bg-brand-700">{initials}</span>
        </button>
      </div>
    </header>
  );
}
