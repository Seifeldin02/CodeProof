"use client";

import Badge from '../ui/Badge';
import type { CandidateOutcome } from '../../features/hiring-analytics/types';
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

export function VerifiedScoreChip({ score }: { score: number }) {
  const { t } = useI18n();
  const tone =
    score >= 78
      ? 'bg-emerald-50 text-emerald-700'
      : score >= 60
        ? 'bg-brand-50 text-brand-700'
        : 'bg-amber-50 text-amber-700';
  return (
    <span
      className={`tnum inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold ${tone}`}
      title={t("Weighted evidence index: Strong 4, Good 3, Partial 2, Limited 1")}
    >
      {score}
    </span>
  );
}
