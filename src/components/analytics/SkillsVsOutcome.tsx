'use client';

import { useI18n } from '@/components/i18n/LocaleProvider';
import type { EvidenceGroup, EvidenceGroupOutcome } from '../../features/hiring-analytics/types';

const GROUP_LABEL: Record<EvidenceGroup, string> = {
  no_code_read: 'No code read',
  lighter_signals: 'Lighter signals',
  strong_or_good: 'Strong or good evidence',
};

export default function SkillsVsOutcome({ data }: { data: EvidenceGroupOutcome[] }) {
  const { t } = useI18n();
  const maxRate = Math.max(1, ...data.map((d) => d.hireRate));

  return (
    <div>
      <div className="flex h-44 items-end gap-4">
        {data.map((d, index) => {
          const label = t(GROUP_LABEL[d.group]);
          return (
            <div key={d.group} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
              <span className="tnum text-xs font-semibold text-slate-700">{d.candidates ? `${d.hireRate}%` : '—'}</span>
              <div
                className={`chart-column w-full max-w-[64px] rounded-t-lg ${d.group === 'strong_or_good' ? 'bg-brand-600' : d.group === 'lighter_signals' ? 'bg-brand-300' : 'bg-slate-300'}`}
                style={{ height: `${Math.max((d.hireRate / maxRate) * 100, 2)}%`, animationDelay: `${index * 70}ms` }}
                title={t('{hired} hired of {count}', { hired: d.hired, count: d.candidates })}
                role="img"
                aria-label={`${label}: ${t('{hired} hired of {count}', { hired: d.hired, count: d.candidates })}`}
              />
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex gap-4 border-t border-slate-100 pt-2">
        {data.map((d) => (
          <div key={d.group} className="flex-1 text-center">
            <div className="text-xs font-medium text-slate-600">{t(GROUP_LABEL[d.group])}</div>
            <div className="tnum text-[11px] text-slate-400">n={d.candidates}</div>
          </div>
        ))}
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
        {t('Observed hire rate by what the analysed code supports. No code read is a separate group, not a low result. Sample sizes are shown; this chart does not imply causation.')}
      </p>
    </div>
  );
}
