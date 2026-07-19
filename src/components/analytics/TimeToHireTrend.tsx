import type { TimeToHireMonthly } from '../../features/hiring-analytics/types';
import { chart } from '../../theme/colors';

const W = 560;
const H = 220;
const PAD = { left: 30, right: 14, top: 18, bottom: 28 };

function niceMax(v: number): number {
  if (v <= 0) return 10;
  const step = v <= 20 ? 5 : v <= 60 ? 10 : 20;
  return Math.ceil(v / step) * step;
}

type Point = TimeToHireMonthly & { avgDays: number };

export default function TimeToHireTrend({ data }: { data: TimeToHireMonthly[] }) {
  const points = data.filter((d): d is Point => d.avgDays !== null);

  if (points.length === 0) {
    return <p className="py-10 text-center text-sm text-slate-400">No hires in the selected range.</p>;
  }

  const yMax = niceMax(Math.max(...points.map((p) => p.avgDays)));
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const baseline = PAD.top + innerH;

  const x = (i: number) =>
    points.length === 1 ? PAD.left + innerW / 2 : PAD.left + (i / (points.length - 1)) * innerW;
  const y = (v: number) => PAD.top + (1 - v / yMax) * innerH;

  const line = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.avgDays).toFixed(1)}`)
    .join(' ');
  const area = `${line} L ${x(points.length - 1).toFixed(1)} ${baseline} L ${x(0).toFixed(1)} ${baseline} Z`;
  const gridVals = [0, yMax / 2, yMax];

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label="Average time-to-hire by month"
      >
        {gridVals.map((gv) => (
          <g key={gv}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(gv)} y2={y(gv)} stroke={chart.grid} strokeWidth={1} />
            <text x={PAD.left - 6} y={y(gv) + 3} textAnchor="end" fontSize={10} fill={chart.subtle}>
              {Math.round(gv)}
            </text>
          </g>
        ))}

        <path d={area} fill={chart.accentSoft} opacity={0.6} />
        <path
          d={line}
          fill="none"
          stroke={chart.accent}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {points.map((p, i) => (
          <g key={p.monthKey}>
            <circle cx={x(i)} cy={y(p.avgDays)} r={3.5} fill="white" stroke={chart.accent} strokeWidth={2}>
              <title>{`${p.label}: ${p.avgDays}d avg · ${p.hires} hire${p.hires === 1 ? '' : 's'}`}</title>
            </circle>
            <text
              x={x(i)}
              y={y(p.avgDays) - 9}
              textAnchor="middle"
              fontSize={10}
              fontWeight={600}
              fill={chart.ink}
            >
              {p.avgDays}
            </text>
            <text x={x(i)} y={H - 8} textAnchor="middle" fontSize={10} fill={chart.muted}>
              {p.label}
            </text>
          </g>
        ))}
      </svg>
      <p className="mt-1 text-center text-[11px] text-slate-400">
        Average days from application to hire
      </p>
    </div>
  );
}
