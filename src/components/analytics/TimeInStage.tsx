import { type TimeInStageMetric, STAGE_LABELS } from '../../features/hiring-analytics/types';

export default function TimeInStage({ data }: { data: TimeInStageMetric[] }) {
  const max = Math.max(1, ...data.map((d) => d.avgDays ?? 0));

  return (
    <div className="space-y-3.5">
      {data.map((d) => (
        <div key={d.stage} className="flex items-center gap-3">
          <span className="w-24 shrink-0 text-sm text-slate-600">{STAGE_LABELS[d.stage]}</span>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-brand-500"
              style={{ width: `${((d.avgDays ?? 0) / max) * 100}%` }}
            />
          </div>
          <span className="tnum w-10 shrink-0 text-right text-sm text-slate-500">
            {d.avgDays === null ? '—' : `${d.avgDays}d`}
          </span>
        </div>
      ))}
    </div>
  );
}
