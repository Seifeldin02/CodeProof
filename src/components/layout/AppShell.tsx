import type { ReactNode } from "react";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import MobileNav from "./MobileNav";
import AmbientCanvas from "./AmbientCanvas";
import BrandMark from "./BrandMark";
import LanguageToggle from "../i18n/LanguageToggle";
import type { AuthUser } from "@/features/auth/store";

export default function AppShell({ children, user }: { children: ReactNode; user: AuthUser | null }) {
  if (!user) {
    return (
      <div className="relative min-h-screen overflow-x-clip bg-[#f3f5f2]">
        <AmbientCanvas />
        <header className="relative z-20 flex h-20 items-center justify-between border-b border-slate-200/70 bg-white/75 px-4 backdrop-blur-xl sm:px-8">
          <div className="rounded-xl bg-slate-950 px-3 py-2"><BrandMark /></div>
          <LanguageToggle />
        </header>
        <main className="relative z-10">{children}</main>
      </div>
    );
  }
  return (
    <div className="relative flex min-h-screen overflow-x-clip bg-[#f3f5f2]">
      <AmbientCanvas />
      <Sidebar />
      <div className="relative z-10 flex min-w-0 flex-1 flex-col lg:ms-64">
        <Topbar user={user} />
        <MobileNav />
        <main className="flex-1 pb-20 lg:pb-0">
          <div className="mx-auto w-full max-w-[1480px] px-4 py-6 lg:px-8 lg:py-9">{children}</div>
        </main>
      </div>
    </div>
  );
}
