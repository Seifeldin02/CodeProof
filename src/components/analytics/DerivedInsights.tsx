import type { DerivedInsight } from '../../features/hiring-analytics/types';

const TONE_DOT: Record<DerivedInsight['tone'], string> = {
  positive: 'bg-emerald-500',
  warning: 'bg-amber-500',
  neutral: 'bg-slate-400',
};

export default function DerivedInsights({ items }: { items: DerivedInsight[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-slate-400">Not enough pipeline data to surface signals yet.</p>;
  }

  return (
    <ul className="space-y-4">
      {items.map((it) => (
        <li key={it.id} className="flex gap-3">
          <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${TONE_DOT[it.tone]}`} />
          <p className="text-sm leading-relaxed text-slate-600">{it.text}</p>
        </li>
      ))}
    </ul>
  );
}
