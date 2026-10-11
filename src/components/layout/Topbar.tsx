"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Badge from "../ui/Badge";
import BrandMark from "./BrandMark";
import { navItems } from "./navItems";
import LanguageToggle from "../i18n/LanguageToggle";
import { useI18n } from "../i18n/LocaleProvider";
import type { AuthUser } from "@/features/auth/store";

/** Areas outside the main navigation, so the bar still says where the person is. */
const SECTION_LABELS: Array<[string, string]> = [
  ["/team", "Team"],
  ["/account", "Account"],
  ["/admin", "Owner administration"],
  ["/welcome", "Welcome"],
];

export default function Topbar({ user }: { user: AuthUser }) {
  const pathname = usePathname() ?? "";
  const { t } = useI18n();
  const section = SECTION_LABELS.find(([prefix]) => pathname.startsWith(prefix))?.[1];
  const current = navItems.find((item) => item.to === "/" ? pathname === "/" : pathname.startsWith(item.to));
  const initials = user.email.slice(0, 2).toUpperCase();
  return (
    <header role="banner" className="sticky top-0 z-30 flex h-20 items-center justify-between gap-3 border-b border-slate-200/80 bg-white/80 px-4 shadow-[0_1px_20px_rgba(15,23,42,.035)] backdrop-blur-xl lg:px-8">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-slate-950 p-1.5 lg:hidden"><BrandMark compact /></div>
        <div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">{t("CodeProof workspace")}</p><p className="mt-1 text-sm font-semibold text-slate-900">{t(section ?? current?.label ?? "Recruiter workspace")}</p></div>
      </div>
      <div className="flex items-center gap-3">
        <span className="hidden sm:inline-flex"><Badge tone="positive">{t("Free deterministic engine")}</Badge></span>
        <LanguageToggle />
        <Link href="/account" className="group flex min-h-11 items-center gap-2 rounded-xl px-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" title={t("Account")}>
          <span className="sr-only">{t("Account")}: </span>
          <span className="hidden max-w-40 truncate text-xs text-slate-600 xl:block" dir="ltr">{user.email}</span>
          <span className="avatar-ring grid h-9 w-9 place-items-center rounded-full bg-slate-900 text-xs font-semibold text-white group-hover:bg-brand-700" aria-hidden="true">{initials}</span>
        </Link>
      </div>
    </header>
  );
}
