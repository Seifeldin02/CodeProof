import type { ReactNode } from "react";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import MobileNav from "./MobileNav";
import AmbientCanvas from "./AmbientCanvas";

export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen overflow-hidden bg-[#f3f5f2]">
      <AmbientCanvas />
      <Sidebar />
      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <Topbar />
        <MobileNav />
        <main className="flex-1">
          <div className="mx-auto w-full max-w-[1480px] px-4 py-6 lg:px-8 lg:py-9">{children}</div>
        </main>
      </div>
    </div>
  );
}
