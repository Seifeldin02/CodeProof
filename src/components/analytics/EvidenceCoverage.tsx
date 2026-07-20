'use client';

import { useI18n } from '@/components/i18n/LocaleProvider';
import { localizeAnalysisText } from '@/i18n/translations';

export interface EvidenceCoverageData {
  repositories: number;
  groundedClaims: number;
  selectedFiles: number;
  strongOrGoodSkills: number;
  patterns: Array<{ category: string; count: number }>;
}

export default function EvidenceCoverage({ data }: { data: EvidenceCoverageData }) {
  const { locale, t } = useI18n();
  const max = Math.max(1, ...data.patterns.map((pattern) => pattern.count));
  return <div><div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><div className="rounded-xl border border-slate-100 bg-slate-50 p-3"><span className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">{t('Repositories')}</span><strong className="tnum mt-2 block text-2xl tracking-tight text-slate-900">{data.repositories}</strong></div><div className="rounded-xl border border-slate-100 bg-slate-50 p-3"><span className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">{t('Grounded claims')}</span><strong className="tnum mt-2 block text-2xl tracking-tight text-slate-900">{data.groundedClaims}</strong></div><div className="rounded-xl border border-slate-100 bg-slate-50 p-3"><span className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">{t('Evidence files')}</span><strong className="tnum mt-2 block text-2xl tracking-tight text-slate-900">{data.selectedFiles}</strong></div><div className="rounded-xl border border-slate-100 bg-slate-50 p-3"><span className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">{t('Good+ skills')}</span><strong className="tnum mt-2 block text-2xl tracking-tight text-slate-900">{data.strongOrGoodSkills}</strong></div></div><div className="mt-5 space-y-3">{data.patterns.length ? data.patterns.map((pattern, index) => <div key={pattern.category}><div className="mb-1.5 flex items-center justify-between text-xs"><span className="font-medium capitalize text-slate-600">{localizeAnalysisText(locale, pattern.category.replace('-', ' '))}</span><span className="font-mono text-[10px] text-slate-400">{pattern.count} {t(pattern.count === 1 ? 'repo' : 'repos')}</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label={localizeAnalysisText(locale, pattern.category.replace('-', ' '))} aria-valuemin={0} aria-valuemax={max} aria-valuenow={pattern.count}><div className="chart-bar h-full rounded-full bg-gradient-to-r from-brand-700 to-brand-400" style={{ width: `${Math.max(4, pattern.count / max * 100)}%`, animationDelay: `${index * 70}ms` }} /></div></div>) : <p className="text-sm text-slate-400">{t('No supported implementation patterns detected yet.')}</p>}</div><p className="mt-4 text-[11px] leading-5 text-slate-400">{t('Coverage counts repositories where each pattern has file-backed implementation evidence.')}</p></div>;
}
