/**
 * Domain types for the recruiter/business-intelligence layer.
 *
 * These describe candidate pipeline records and the analytics derived
 * from them (funnel, time-to-hire, drop-off, source quality, and the
 * verified-skill vs. hiring-outcome signal that ties back to CodeProof
 * evidence). Analytics are computed from records — never hard-coded — so
 * the numbers stay internally consistent.
 */

/** Canonical recruiting pipeline stages, in order. */
export const PIPELINE_STAGES = [
  'applied',
  'screening',
  'code_review',
  'interview',
  'offer',
  'hired',
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const STAGE_LABELS: Record<PipelineStage, string> = {
  applied: 'Applied',
  screening: 'Screening',
  code_review: 'Code Review',
  interview: 'Interview',
  offer: 'Offer',
  hired: 'Hired',
};

export type CandidateOutcome = 'in_progress' | 'hired' | 'rejected' | 'withdrawn';

/** Channels a candidate can originate from. */
export const SOURCE_CHANNELS = [
  'Referral',
  'CodeProof',
  'LinkedIn',
  'Job Board',
  'Careers Site',
] as const;
export type SourceChannel = (typeof SOURCE_CHANNELS)[number];

export const ROLES = [
  'Frontend Engineer',
  'Backend Engineer',
  'Full-Stack Engineer',
  'Data Engineer',
  'DevOps Engineer',
] as const;
export type Role = (typeof ROLES)[number];

export interface StageEvent {
  stage: PipelineStage;
  /** ISO date (YYYY-MM-DD) the candidate entered this stage. */
  enteredAt: string;
}

/**
 * What a candidate's analysed code supports, as counts of distinct skills at
 * each evidence level. It describes the code that was read and is never
 * collapsed into one number for the person.
 */
export interface EvidenceProfile {
  strong: number;
  good: number;
  partial: number;
  limited: number;
  /** Repositories that were analysed. Zero means no code has been read yet. */
  repositories: number;
}

export interface CandidateRecord {
  id: string;
  name: string;
  role: Role;
  source: SourceChannel;
  /**
   * Stored weighted index (0–100) of the analysed skills. Kept for storage
   * compatibility only: it is not shown, because CodeProof does not rate
   * people. Screens use `evidence` instead.
   */
  verifiedSkillScore: number;
  /** Attached by pages that load analyses. Absent means it was not loaded. */
  evidence?: EvidenceProfile;
  appliedAt: string;
  outcome: CandidateOutcome;
  /** Furthest stage reached (highest index in PIPELINE_STAGES). */
  furthestStage: PipelineStage;
  /** Ordered progression from 'applied' up to `furthestStage`. */
  stageHistory: StageEvent[];
  repositoryCount?: number;
  verifiedClaimCount?: number;
  isDemo?: boolean;
  /**
   * Portfolio and non-GitHub links named on the CV that CodeProof cannot read.
   * Recorded so they surface as an explicit unknown, never as a deficit.
   */
  unanalyzedSources?: string[];
  /**
   * When the recruiter confirmed they opened the cited evidence for this
   * candidate (ISO timestamp), or null. Cleared whenever new repository
   * evidence is recorded, so a stale check never covers unseen files.
   */
  evidenceReviewedAt?: string | null;
}

/* ----------------------------- Analytics outputs ----------------------------- */

export interface HiringSummary {
  totalCandidates: number;
  activePipeline: number;
  hires: number;
  avgTimeToHireDays: number | null;
  /** hired / offers extended, as a percentage. */
  offerAcceptanceRate: number | null;
}

export interface FunnelStageMetric {
  stage: PipelineStage;
  reached: number;
  /** % of the previous stage that reached this stage (100 for the first). */
  conversionFromPrev: number;
  /** Share of the top of funnel still present at this stage (%). */
  shareOfTop: number;
}

export interface StageDropOffMetric {
  fromStage: PipelineStage;
  toStage: PipelineStage;
  dropped: number;
  /** % of candidates at `fromStage` that did not reach `toStage`. */
  dropRate: number;
}

export interface SourceMetric {
  source: SourceChannel;
  applicants: number;
  hires: number;
  hireRate: number;
  avgTimeToHireDays: number | null;
  /** Applicants from this source with at least one analysed repository. */
  withCodeRead: number;
  /** Applicants from this source with at least one skill at strong or good evidence. */
  withStrongOrGood: number;
}

export interface TimeToHireMonthly {
  monthKey: string; // 'YYYY-MM'
  label: string;
  hires: number;
  avgDays: number | null;
}

export interface TimeInStageMetric {
  stage: PipelineStage;
  avgDays: number | null;
}

/** How much the analysed code supports, as a category rather than a number. */
export type EvidenceGroup = 'no_code_read' | 'lighter_signals' | 'strong_or_good';

export interface EvidenceGroupOutcome {
  group: EvidenceGroup;
  candidates: number;
  hired: number;
  hireRate: number;
}

export interface DerivedInsight {
  id: string;
  tone: 'positive' | 'warning' | 'neutral';
  text: string;
}
