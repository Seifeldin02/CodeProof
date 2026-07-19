import type { SourceMetric } from '../../features/hiring-analytics/types';
import { categorical, chart } from '../../theme/colors';

const SIZE = 176;
const STROKE = 22;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;
const CENTER = SIZE / 2;

export default function SourceDonut({ data }: { data: SourceMetric[] }) {
  const total = data.reduce((s, d) => s + d.applicants, 0);

  let cumulative = 0;
  const segments = data.map((d, i) => {
    const fraction = total === 0 ? 0 : d.applicants / total;
    const seg = { ...d, fraction, offset: cumulative, color: categorical[i % categorical.length] };
    cumulative += fraction * C;
    return seg;
  });

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="h-44 w-44 shrink-0"
        role="img"
        aria-label="Applicant distribution by source"
      >
        <circle cx={CENTER} cy={CENTER} r={R} fill="none" stroke={chart.track} strokeWidth={STROKE} />
        <g transform={`rotate(-90 ${CENTER} ${CENTER})`}>
          {segments.map((s) => (
            <circle
              key={s.source}
              cx={CENTER}
              cy={CENTER}
              r={R}
              fill="none"
              stroke={s.color}
              strokeWidth={STROKE}
              strokeDasharray={`${s.fraction * C} ${C - s.fraction * C}`}
              strokeDashoffset={-s.offset}
            >
              <title>{`${s.source}: ${s.applicants} applicants`}</title>
            </circle>
          ))}
        </g>
        <text x={CENTER} y={CENTER - 1} textAnchor="middle" fontSize={26} fontWeight={700} fill={chart.ink}>
          {total}
        </text>
        <text x={CENTER} y={CENTER + 16} textAnchor="middle" fontSize={11} fill={chart.muted}>
          applicants
        </text>
      </svg>

      <ul className="w-full flex-1 space-y-2.5">
        {segments.map((s) => (
          <li key={s.source} className="flex items-center gap-2.5 text-sm">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
            <span className="flex-1 text-slate-600">{s.source}</span>
            <span className="tnum font-medium text-slate-700">{s.applicants}</span>
            <span className="tnum w-10 text-right text-slate-400">
              {Math.round(s.fraction * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
