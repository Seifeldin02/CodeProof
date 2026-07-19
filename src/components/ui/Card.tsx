import type { ReactNode } from 'react';

interface CardProps {
  title?: string;
  subtitle?: string;
  /** Right-aligned header slot (e.g. a badge or control). */
  action?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}

/** Neutral surface used for every dashboard panel. */
export default function Card({
  title,
  subtitle,
  action,
  className,
  bodyClassName,
  children,
}: CardProps) {
  const hasHeader = Boolean(title || action);
  return (
    <section
      className={`surface-card flex flex-col rounded-2xl border border-slate-200/80 bg-white/95 shadow-card ${className ?? ''}`}
    >
      {hasHeader && (
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4.5">
          <div className="min-w-0">
            {title && <h3 className="text-sm font-semibold tracking-[-.01em] text-slate-900">{title}</h3>}
            {subtitle && <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{subtitle}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      <div className={`flex-1 px-5 py-5 ${bodyClassName ?? ''}`}>{children}</div>
    </section>
  );
}
