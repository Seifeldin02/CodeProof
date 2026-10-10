/**
 * Pure analytics functions for the recruiter intelligence layer.
 *
 * Every metric is derived from `CandidateRecord[]` so the dashboard numbers
 * stay internally consistent — no hard-coded or fabricated scores.
 */
import { evidenceGroup } from '@/features/candidates/evidence-profile';
import {
  type CandidateRecord,
  type DerivedInsight,
  type EvidenceGroup,
  type EvidenceGroupOutcome,
  type FunnelStageMetric,
  type HiringSummary,
  PIPELINE_STAGES,
  type PipelineStage,
  SOURCE_CHANNELS,
  type SourceMetric,
  STAGE_LABELS,
  type StageDropOffMetric,
  type TimeInStageMetric,
  type TimeToHireMonthly,
} from './types';

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const round1 = (n: number) => Math.round(n * 10) / 10;
const avg = (nums: number[]) => nums.reduce((s, n) => s + n, 0) / nums.length;
const stageIndex = (s: PipelineStage) => PIPELINE_STAGES.indexOf(s);

function reachedStage(c: CandidateRecord, stage: PipelineStage): boolean {
  return stageIndex(c.furthestStage) >= stageIndex(stage);
}

function stageEntryDate(c: CandidateRecord, stage: PipelineStage): string | undefined {
  return c.stageHistory.find((e) => e.stage === stage)?.enteredAt;
}

const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

function timeToHire(c: CandidateRecord): number | null {
  if (c.outcome !== 'hired') return null;
  const hiredAt = stageEntryDate(c, 'hired');
  return hiredAt ? daysBetween(c.appliedAt, hiredAt) : null;
}

function monthLabel(monthKey: string): string {
  const m = Number(monthKey.slice(5, 7));
  return MONTHS[m - 1] ?? monthKey;
}

/* ------------------------------- Summary KPIs ------------------------------- */

export function computeSummary(candidates: CandidateRecord[]): HiringSummary {
  const hires = candidates.filter((c) => c.outcome === 'hired');
  const tths = hires.map(timeToHire).filter((d): d is number => d !== null);
  const offersMade = candidates.filter((c) => reachedStage(c, 'offer')).length;
  return {
    totalCandidates: candidates.length,
    activePipeline: candidates.filter((c) => c.outcome === 'in_progress').length,
    hires: hires.length,
    avgTimeToHireDays: tths.length ? Math.round(avg(tths)) : null,
    offerAcceptanceRate: offersMade === 0 ? null : round1((hires.length / offersMade) * 100),
  };
}

/* --------------------------------- Funnel ---------------------------------- */

export function computeFunnel(candidates: CandidateRecord[]): FunnelStageMetric[] {
  const top = candidates.filter((c) => reachedStage(c, PIPELINE_STAGES[0])).length;
  return PIPELINE_STAGES.map((stage, i) => {
    const reached = candidates.filter((c) => reachedStage(c, stage)).length;
    if (i === 0) {
      return { stage, reached, conversionFromPrev: 100, shareOfTop: 100 };
    }
    const prevReached = candidates.filter((c) => reachedStage(c, PIPELINE_STAGES[i - 1])).length;
    return {
      stage,
      reached,
      conversionFromPrev: prevReached === 0 ? 0 : round1((reached / prevReached) * 100),
      shareOfTop: top === 0 ? 0 : round1((reached / top) * 100),
    };
  });
}

export function computeStageDropOff(candidates: CandidateRecord[]): StageDropOffMetric[] {
  const out: StageDropOffMetric[] = [];
  for (let i = 0; i < PIPELINE_STAGES.length - 1; i++) {
    const fromStage = PIPELINE_STAGES[i];
    const toStage = PIPELINE_STAGES[i + 1];
    const reachedTo = candidates.filter((c) => reachedStage(c, toStage)).length;
    const dropped = candidates.filter((candidate) =>
      reachedStage(candidate, fromStage) &&
      !reachedStage(candidate, toStage) &&
      (candidate.outcome === 'rejected' || candidate.outcome === 'withdrawn'),
    ).length;
    const resolvedAtTransition = reachedTo + dropped;
    out.push({
      fromStage,
      toStage,
      dropped,
      dropRate: resolvedAtTransition === 0 ? 0 : round1((dropped / resolvedAtTransition) * 100),
    });
  }
  return out;
}

/* ------------------------------ Time to hire ------------------------------- */

export function computeTimeToHireTrend(candidates: CandidateRecord[]): TimeToHireMonthly[] {
  const byMonth = new Map<string, number[]>();
  for (const c of candidates) {
    if (c.outcome !== 'hired') continue;
    const hiredAt = stageEntryDate(c, 'hired');
    const tth = timeToHire(c);
    if (!hiredAt || tth === null) continue;
    const key = hiredAt.slice(0, 7);
    const arr = byMonth.get(key) ?? [];
    arr.push(tth);
    byMonth.set(key, arr);
  }
  return [...byMonth.keys()]
    .sort()
    .map((monthKey) => {
      const arr = byMonth.get(monthKey) ?? [];
      return {
        monthKey,
        label: monthLabel(monthKey),
        hires: arr.length,
        avgDays: arr.length ? Math.round(avg(arr)) : null,
      };
    });
}

export function computeTimeInStage(candidates: CandidateRecord[]): TimeInStageMetric[] {
  const result: TimeInStageMetric[] = [];
  for (let i = 0; i < PIPELINE_STAGES.length - 1; i++) {
    const stage = PIPELINE_STAGES[i];
    const next = PIPELINE_STAGES[i + 1];
    const durations: number[] = [];
    for (const c of candidates) {
      const a = stageEntryDate(c, stage);
      const b = stageEntryDate(c, next);
      if (a && b) durations.push(daysBetween(a, b));
    }
    result.push({ stage, avgDays: durations.length ? Math.round(avg(durations)) : null });
  }
  return result;
}

/* --------------------------------- Sources --------------------------------- */

export function computeSourceMetrics(candidates: CandidateRecord[]): SourceMetric[] {
  return SOURCE_CHANNELS.map((source) => {
    const group = candidates.filter((c) => c.source === source);
    const hires = group.filter((c) => c.outcome === 'hired');
    const tths = hires.map(timeToHire).filter((d): d is number => d !== null);
    return {
      source,
      applicants: group.length,
      hires: hires.length,
      hireRate: group.length === 0 ? 0 : round1((hires.length / group.length) * 100),
      avgTimeToHireDays: tths.length ? Math.round(avg(tths)) : null,
      withCodeRead: group.filter((c) => evidenceGroup(c.evidence) !== 'no_code_read').length,
      withStrongOrGood: group.filter((c) => evidenceGroup(c.evidence) === 'strong_or_good').length,
    };
  })
    .filter((m) => m.applicants > 0)
    .sort((a, b) => b.applicants - a.applicants);
}

/* --------------------- Code evidence vs. hiring outcome --------------------- */

const EVIDENCE_GROUPS: EvidenceGroup[] = ['no_code_read', 'lighter_signals', 'strong_or_good'];

/**
 * Observed outcomes by what the analysed code supports. Candidates are grouped
 * by category, never by a number, and a candidate with no code read is its own
 * group rather than the bottom of a scale.
 */
export function computeEvidenceGroups(candidates: CandidateRecord[]): EvidenceGroupOutcome[] {
  return EVIDENCE_GROUPS.map((group) => {
    const inGroup = candidates.filter((c) => evidenceGroup(c.evidence) === group);
    const hired = inGroup.filter((c) => c.outcome === 'hired').length;
    return {
      group,
      candidates: inGroup.length,
      hired,
      hireRate: inGroup.length ? round1((hired / inGroup.length) * 100) : 0,
    };
  });
}

/* ---------------------------- Derived insights ----------------------------- */

/**
 * Rule-based signals derived from the current pipeline. These are honest,
 * explainable heuristics over the data — not fabricated AI output.
 */
export function deriveInsights(candidates: CandidateRecord[]): DerivedInsight[] {
  const insights: DerivedInsight[] = [];

  const worstDrop = [...computeStageDropOff(candidates)]
    .filter((d) => d.dropped > 0)
    .sort((a, b) => b.dropRate - a.dropRate)[0];
  if (worstDrop) {
    insights.push({
      id: 'biggest-dropoff',
      tone: 'warning',
      text: `Biggest resolved drop-off is ${STAGE_LABELS[worstDrop.fromStage]} → ${STAGE_LABELS[worstDrop.toStage]}: ${worstDrop.dropRate}% of candidates with a recorded outcome ended there.`,
    });
  }

  const sources = computeSourceMetrics(candidates).filter((s) => s.applicants >= 5);
  const bestSource = [...sources].sort((a, b) => b.hireRate - a.hireRate)[0];
  if (bestSource && bestSource.hireRate > 0) {
    insights.push({
      id: 'best-source',
      tone: 'positive',
      text: `${bestSource.source} is your strongest channel — ${bestSource.hireRate}% of its candidates get hired.`,
    });
  }

  const groups = computeEvidenceGroups(candidates);
  const strongGroup = groups.find((g) => g.group === 'strong_or_good');
  const lighterGroup = groups.find((g) => g.group === 'lighter_signals');
  if (strongGroup && lighterGroup && strongGroup.candidates >= 3 && lighterGroup.hireRate > 0) {
    const factor = round1(strongGroup.hireRate / lighterGroup.hireRate);
    if (factor >= 1.3) {
      insights.push({
        id: 'skills-signal',
        tone: 'positive',
        text: `Candidates with strong or good code evidence have an observed hire rate ${factor} times that of candidates with lighter signals in the current dataset.`,
      });
    }
  }

  const trend = computeTimeToHireTrend(candidates).filter((t) => t.avgDays !== null);
  if (trend.length >= 2) {
    const first = trend[0].avgDays as number;
    const last = trend[trend.length - 1].avgDays as number;
    const delta = first - last;
    if (Math.abs(delta) >= 2) {
      insights.push({
        id: 'tth-trend',
        tone: delta > 0 ? 'positive' : 'warning',
        text:
          delta > 0
            ? `Time-to-hire improved by ${delta} days since ${trend[0].label}.`
            : `Time-to-hire slowed by ${Math.abs(delta)} days since ${trend[0].label}.`,
      });
    }
  }

  return insights;
}

/** Distinct roles present in the dataset (for filtering), sorted. */
export function availableRoles(candidates: CandidateRecord[]): string[] {
  return [...new Set(candidates.map((c) => c.role))].sort();
}

export function filterByRole(candidates: CandidateRecord[], role: string | 'all'): CandidateRecord[] {
  return role === 'all' ? candidates : candidates.filter((c) => c.role === role);
}
