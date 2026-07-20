import type { ReactNode } from "react";

interface PageHeaderProps {
  eyebrow: string;
  title: string;
  description: string;
  badge?: ReactNode;
  actions?: ReactNode;
}

export default function PageHeader({ eyebrow, title, description, badge, actions }: PageHeaderProps) {
  return <header className="page-header relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white/80 px-5 py-6 shadow-[0_18px_55px_rgba(15,23,42,.055)] sm:px-7 sm:py-8">
    <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
      <div className="max-w-3xl">
        <div className="flex flex-wrap items-center gap-2.5"><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-brand-700">{eyebrow}</p>{badge}</div>
        <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-[-.045em] text-slate-950 sm:text-4xl">{title}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500 sm:text-[15px] sm:leading-7">{description}</p>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  </header>;
}
