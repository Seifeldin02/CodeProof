import type { SkillBandOutcome } from '../../features/hiring-analytics/types';

export default function SkillsVsOutcome({ data }: { data: SkillBandOutcome[] }) {
  const maxRate = Math.max(1, ...data.map((d) => d.hireRate));

  return (
    <div>
      <div className="flex h-44 items-end gap-4">
        {data.map((d) => {
          const isTop = d.min === 80;
          return (
            <div key={d.band} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
              <span className="tnum text-xs font-semibold text-slate-700">{d.hireRate}%</span>
              <div
                className={`w-full max-w-[64px] rounded-t-md ${isTop ? 'bg-brand-600' : 'bg-brand-300'}`}
                style={{ height: `${Math.max((d.hireRate / maxRate) * 100, 2)}%` }}
                title={`${d.hired} hired of ${d.candidates}`}
              />
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex gap-4 border-t border-slate-100 pt-2">
        {data.map((d) => (
          <div key={d.band} className="flex-1 text-center">
            <div className="text-xs font-medium text-slate-600">{d.band}</div>
            <div className="tnum text-[11px] text-slate-400">n={d.candidates}</div>
          </div>
        ))}
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
        Observed hire rate by weighted evidence-index band. Sample sizes are shown; this chart does not imply causation.
      </p>
    </div>
  );
}
