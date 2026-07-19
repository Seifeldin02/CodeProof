import type { ComponentType, SVGProps } from 'react';

type IconTone = 'brand' | 'positive' | 'warning';

const ICON_TONE: Record<IconTone, string> = {
  brand: 'bg-brand-50 text-brand-600',
  positive: 'bg-emerald-50 text-emerald-600',
  warning: 'bg-amber-50 text-amber-600',
};

interface KpiTileProps {
  label: string;
  value: string;
  hint?: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  iconTone?: IconTone;
}

export default function KpiTile({ label, value, hint, icon: Icon, iconTone = 'brand' }: KpiTileProps) {
  return (
    <div className="flex items-start gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-card">
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${ICON_TONE[iconTone]}`}>
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <p className="tnum mt-1 text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
        {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
      </div>
    </div>
  );
}
