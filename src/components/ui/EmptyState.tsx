import Link from "next/link";
import type { ComponentType, SVGProps } from "react";

interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel: string;
  actionHref: string;
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
}

export default function EmptyState({ title, description, actionLabel, actionHref, icon: Icon }: EmptyStateProps) {
  return <div className="empty-state mx-auto max-w-xl px-5 py-14 text-center sm:py-16">
    {Icon && <span className="evidence-node mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-brand-100 bg-brand-50 text-brand-700 shadow-sm"><Icon className="h-6 w-6" /></span>}
    <h2 className="mt-5 text-xl font-semibold tracking-[-.025em] text-slate-950">{title}</h2>
    <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">{description}</p>
    <Link href={actionHref} className="mt-6 inline-flex min-h-12 items-center rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-950/10 transition hover:-translate-y-0.5 hover:bg-brand-700 focus-visible:outline-offset-4">{actionLabel}</Link>
  </div>;
}
