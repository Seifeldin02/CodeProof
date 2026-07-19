'use client';

import { useI18n } from '@/components/i18n/LocaleProvider';
import type { SourceMetric } from '../../features/hiring-analytics/types';

function scoreToneClass(score: number): string {
  if (score >= 78) return 'bg-emerald-50 text-emerald-700';
  if (score >= 62) return 'bg-brand-50 text-brand-700';
  return 'bg-amber-50 text-amber-700';
}

export default function SourceQualityTable({ data }: { data: SourceMetric[] }) {
  const { t } = useI18n();
  return (
    <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={t('Source quality')}>
      <table className="w-full min-w-[460px] text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-start text-xs font-medium uppercase tracking-wide text-slate-400">
            <th className="pb-2.5 font-medium">{t('Source')}</th>
            <th className="pb-2.5 text-end font-medium">{t('Applicants')}</th>
            <th className="pb-2.5 text-end font-medium">{t('Hire rate')}</th>
            <th className="pb-2.5 text-end font-medium">{t('Avg time-to-hire')}</th>
            <th className="pb-2.5 text-end font-medium">{t('Evidence index')}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((s) => (
            <tr key={s.source} className="border-b border-slate-50 last:border-0">
              <td className="py-2.5 font-medium text-slate-700">{t(s.source)}</td>
              <td className="tnum py-2.5 text-end text-slate-600">{s.applicants}</td>
              <td className="tnum py-2.5 text-end font-medium text-slate-800">{s.hireRate}%</td>
              <td className="tnum py-2.5 text-end text-slate-600">
                {s.avgTimeToHireDays === null ? '—' : t('{count} days', { count: s.avgTimeToHireDays })}
              </td>
              <td className="py-2.5 text-end">
                <span
                  className={`tnum inline-block rounded px-1.5 py-0.5 text-xs font-semibold ${scoreToneClass(s.avgVerifiedScore)}`}
                >
                  {s.avgVerifiedScore}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
