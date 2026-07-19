import { type FunnelStageMetric, STAGE_LABELS } from '../../features/hiring-analytics/types';

export default function HiringFunnel({ data }: { data: FunnelStageMetric[] }) {
  return (
    <div className="space-y-1">
      {data.map((d, i) => (
        <div key={d.stage}>
          {i > 0 && (
            <div className="flex items-center gap-2 py-1 pl-28">
              <span className="tnum text-[11px] font-medium text-slate-400">
                {d.conversionFromPrev}% advanced
              </span>
              <span className="h-px flex-1 bg-slate-100" />
            </div>
          )}
          <div className="flex items-center gap-3">
            <span className="w-28 shrink-0 text-sm font-medium text-slate-600">
              {STAGE_LABELS[d.stage]}
            </span>
            <div className="h-8 flex-1 overflow-hidden rounded-lg bg-slate-100">
              <div
                className="chart-bar h-full rounded-lg bg-brand-600"
                style={{ width: `${Math.max(d.shareOfTop, 2)}%` }}
              />
            </div>
            <span className="tnum w-20 shrink-0 text-right text-sm">
              <span className="font-semibold text-slate-800">{d.reached}</span>
              <span className="ml-1.5 text-slate-400">{d.shareOfTop}%</span>
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
