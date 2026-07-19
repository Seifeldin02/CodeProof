import { type StageDropOffMetric, STAGE_LABELS } from '../../features/hiring-analytics/types';

export default function StageDropoff({ data }: { data: StageDropOffMetric[] }) {
  const worst = Math.max(0, ...data.map((d) => d.dropRate));

  return (
    <div className="space-y-3.5">
      {data.map((d) => {
        const isWorst = d.dropRate === worst && d.dropped > 0;
        return (
          <div key={d.fromStage}>
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="font-medium text-slate-600">
                {STAGE_LABELS[d.fromStage]} <span className="text-slate-300">→</span>{' '}
                {STAGE_LABELS[d.toStage]}
              </span>
              <span className="tnum text-slate-400">
                <span className={isWorst ? 'font-semibold text-rose-600' : 'font-semibold text-slate-700'}>
                  {d.dropRate}%
                </span>{' '}
                · {d.dropped} exited
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className={`chart-bar h-full rounded-full ${isWorst ? 'bg-rose-500' : 'bg-amber-400'}`}
                style={{ width: `${Math.max(d.dropRate, 1)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
