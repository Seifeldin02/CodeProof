"use client";

import { type StageEvent, STAGE_LABELS } from '../../features/hiring-analytics/types';
import { formatDate } from '../../lib/format';
import { useI18n } from '@/components/i18n/LocaleProvider';
import { formatDateForLocale } from '@/i18n/translations';

export default function StageTimeline({ events }: { events: StageEvent[] }) {
  const { t, locale } = useI18n();
  return (
    <ol className="relative space-y-4 border-s border-slate-200 ps-5">
      {events.map((e, i) => {
        const isLast = i === events.length - 1;
        return (
          <li key={e.stage} className="relative">
            <span
              className={`absolute -start-[26px] top-1 h-3 w-3 rounded-full border-2 border-white ${
                isLast ? 'bg-brand-600' : 'bg-slate-300'
              }`}
            />
            <div className="flex items-center justify-between gap-3">
              <span className={`text-sm font-medium ${isLast ? 'text-slate-900' : 'text-slate-600'}`}>
                {t(STAGE_LABELS[e.stage])}
              </span>
              <span className="tnum text-xs text-slate-400">{locale === "en" ? formatDate(e.enteredAt) : formatDateForLocale(locale, e.enteredAt)}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
