"use client";

import Badge from '../ui/Badge';
import { lighterSignals, strongOrGoodSkills } from '../../features/candidates/evidence-profile';
import type { CandidateOutcome, EvidenceProfile } from '../../features/hiring-analytics/types';
import { useI18n } from '@/components/i18n/LocaleProvider';

type Tone = 'brand' | 'positive' | 'neutral' | 'warning';

const OUTCOME: Record<CandidateOutcome, { tone: Tone; label: string }> = {
  in_progress: { tone: 'brand', label: 'In progress' },
  hired: { tone: 'positive', label: 'Hired' },
  rejected: { tone: 'neutral', label: 'Rejected' },
  withdrawn: { tone: 'warning', label: 'Withdrawn' },
};

export function OutcomeBadge({ outcome }: { outcome: CandidateOutcome }) {
  const { t } = useI18n();
  const o = OUTCOME[outcome];
  return <Badge tone={o.tone}>{t(o.label)}</Badge>;
}

/**
 * A short summary of what the analysed code supports. It counts skills and is
 * never a number for the person: a candidate with no code read is shown as
 * exactly that, in a neutral tone.
 */
export function EvidenceProfileChip({ profile }: { profile: EvidenceProfile | undefined }) {
  const { t } = useI18n();
  if (!profile || profile.repositories === 0) {
    return (
      <span className="inline-flex items-center rounded border border-dashed border-slate-300 bg-slate-50 px-1.5 py-0.5 text-xs font-medium text-slate-600">
        {t("No code read yet")}
      </span>
    );
  }
  const strong = strongOrGoodSkills(profile);
  const lighter = lighterSignals(profile);
  const label = strong > 0
    ? t("Strong or good: {count}", { count: strong })
    : lighter > 0
      ? t("Lighter signals: {count}", { count: lighter })
      : t("No skill signals found");
  return (
    <span
      className={`tnum inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold ${strong > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}
      title={t("Skills by evidence level: strong {strong}, good {good}, partial {partial}, limited {limited}. Repositories read: {repositories}. This counts skills in the code and does not rate the person.", { ...profile })}
    >
      {label}
    </span>
  );
}
