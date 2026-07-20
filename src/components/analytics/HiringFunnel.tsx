'use client';

import { useI18n } from '@/components/i18n/LocaleProvider';
import { type FunnelStageMetric, STAGE_LABELS } from '../../features/hiring-analytics/types';

export default function HiringFunnel({ data }: { data: FunnelStageMetric[] }) {
  const { t } = useI18n();
  return (
    <div className="space-y-1">
      {data.map((d, i) => (
        <div key={d.stage}>
          {i > 0 && (
            <div className="flex items-center gap-2 py-1 ps-28">
              <span className="tnum text-[11px] font-medium text-slate-400">
                {d.conversionFromPrev}% {t('advanced')}
              </span>
              <span className="h-px flex-1 bg-slate-100" />
            </div>
          )}
          <div className="flex items-center gap-3" role="img" aria-label={t("{stage}: {count} candidates reached, {share}% of top", { stage: t(STAGE_LABELS[d.stage]), count: d.reached, share: d.shareOfTop })}>
            <span className="w-28 shrink-0 text-sm font-medium text-slate-600">
              {t(STAGE_LABELS[d.stage])}
            </span>
            <div className="h-8 flex-1 overflow-hidden rounded-lg bg-slate-100">
              <div
                className="chart-bar h-full rounded-lg bg-brand-600"
                style={{ width: `${Math.max(d.shareOfTop, 2)}%`, animationDelay: `${i * 70}ms` }}
                aria-hidden="true"
              />
            </div>
            <span className="tnum w-20 shrink-0 text-end text-sm">
              <span className="font-semibold text-slate-800">{d.reached}</span>
              <span className="ms-1.5 text-slate-400">{d.shareOfTop}%</span>
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
