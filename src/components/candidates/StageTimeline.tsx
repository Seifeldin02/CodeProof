import { type StageEvent, STAGE_LABELS } from '../../features/hiring-analytics/types';
import { formatDate } from '../../lib/format';

export default function StageTimeline({ events }: { events: StageEvent[] }) {
  return (
    <ol className="relative space-y-4 border-l border-slate-200 pl-5">
      {events.map((e, i) => {
        const isLast = i === events.length - 1;
        return (
          <li key={e.stage} className="relative">
            <span
              className={`absolute -left-[26px] top-1 h-3 w-3 rounded-full border-2 border-white ${
                isLast ? 'bg-brand-600' : 'bg-slate-300'
              }`}
            />
            <div className="flex items-center justify-between gap-3">
              <span className={`text-sm font-medium ${isLast ? 'text-slate-900' : 'text-slate-600'}`}>
                {STAGE_LABELS[e.stage]}
              </span>
              <span className="tnum text-xs text-slate-400">{formatDate(e.enteredAt)}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
