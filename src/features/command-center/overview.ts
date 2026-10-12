import type { CandidateDetail } from "@/features/candidates/types";
import { interviewActionState, type InterviewDecision, type InterviewSession } from "@/features/interviews/contracts";
import {
  compareCandidateRoleReviews,
  compareRoleCoverage,
  evaluateCandidateForRole,
  IMPORTANCE_ORDER,
  reviewCoverage,
  type CandidateRoleReview,
  type RoleBrief,
} from "@/features/shortlists/evaluate";
import { statedRoleOf } from "@/features/resume-matching/claims";
import { statementsOf } from "@/features/resume-matching/experience";
import type { ExtractedResumeClaim } from "@/types/analysis";

/** How many roles, applicants per role, interviews and recent applicants the first screen shows. */
const MAX_BOARDS = 4;
const MAX_LEADS = 3;
const MAX_ATTENTION = 6;
const MAX_APPLICANTS = 6;

/** Against the criteria the brief marks required, or against all of them when it marks none. */
export type Coverage = ReturnType<typeof reviewCoverage>;

/** One applicant in a role's review order, with where each signal comes from. */
export interface RoleLead {
  candidateId: string;
  candidateName: string;
  /** Criteria with a CV claim or a verified citation, counted the way the role review counts them. */
  coverage: Coverage;
  /** Criteria in that count backed by code whose authorship is verified. */
  cited: number;
  /** Some relevant code was read, but nobody has checked who wrote it. */
  attributionPending: boolean;
  /** Criteria the CV mentions. Candidate-reported, not verified. */
  reported: string[];
}

export interface RoleBoard {
  roleId: string;
  title: string;
  /** Labels of the criteria the brief names, required ones first. */
  criteria: string[];
  /** Job-brief requirements left to a person: years, degrees, ways of working. */
  needsHumanReview: number;
  poolSize: number;
  /** Applicants with at least one signal for this role, in review order. */
  leads: RoleLead[];
}

export type AttentionState = "overdue" | "communicate" | "prepare";

export interface AttentionItem {
  sessionId: string;
  candidateName: string;
  roleTitle: string;
  state: AttentionState;
  followUpOn: string | null;
  decision: InterviewDecision | null;
  isDemo: boolean;
}

export interface ApplicantRow {
  id: string;
  name: string;
  role: string;
  /** The role the CV's own headline states, when it has one. */
  statedRole: string | null;
  appliedAt: string;
  hasPublicCode: boolean;
  claimCount: number;
  /** The saved role this applicant's CV claims and verified code cover best. A lead to explore, not a verdict. */
  closestRole: { roleId: string; title: string; coverage: Coverage } | null;
}

export interface CommandCenter {
  /** True when the workspace holds only labelled sample records, so every figure describes samples. */
  demoOnly: boolean;
  pool: { total: number; withPublicCode: number; cvOnly: number; demoExcluded: number };
  roles: number;
  /**
   * `awaiting` and `readyToCommunicate` are counted the way the interview desk counts its own tiles,
   * so the two screens always agree. The other four split every interview by what it needs next.
   */
  interviews: { awaiting: number; readyToCommunicate: number; prepare: number; communicate: number; overdue: number; done: number };
  boards: RoleBoard[];
  attention: AttentionItem[];
  applicants: ApplicantRow[];
}

export interface CommandCenterInput {
  candidates: CandidateDetail[];
  roles: RoleBrief[];
  resumeClaims: Map<string, ExtractedResumeClaim[]>;
  sessions: InterviewSession[];
  /** ISO date (YYYY-MM-DD) used to tell which follow-ups are overdue. */
  today: string;
}

function lead(review: CandidateRoleReview): RoleLead {
  const coverage = reviewCoverage(review);
  return {
    candidateId: review.candidateId,
    candidateName: review.candidateName,
    coverage,
    cited: coverage.scope === "required" ? review.citedRequiredCount : review.citedCriterionCount,
    attributionPending: review.criteria.some((item) => item.status === "attribution_pending"),
    reported: review.reportedCriteria.slice(0, 4),
  };
}

const ATTENTION_ORDER: Record<AttentionState, number> = { overdue: 0, communicate: 1, prepare: 2 };

/**
 * Everything the recruiter's first screen shows, worked out from saved records only.
 * Sample records are used only when the workspace has no real applicant, and are flagged.
 */
export function buildCommandCenter(input: CommandCenterInput): CommandCenter {
  const real = input.candidates.filter((candidate) => !candidate.isDemo);
  const demoOnly = real.length === 0 && input.candidates.length > 0;
  const pool = demoOnly ? input.candidates : real;
  const claimsFor = (candidate: CandidateDetail): ExtractedResumeClaim[] => input.resumeClaims.get(candidate.id) ?? [];

  const reviewsByRole = new Map<string, CandidateRoleReview[]>(input.roles.map((role) => [
    role.id,
    pool.map((candidate) => evaluateCandidateForRole(candidate, role, claimsFor(candidate))).sort(compareCandidateRoleReviews),
  ]));

  const boards = input.roles.slice(0, MAX_BOARDS).map((role): RoleBoard => {
    const reviews = reviewsByRole.get(role.id) ?? [];
    const ordered = [...role.criteria].sort((left, right) => IMPORTANCE_ORDER[left.importance] - IMPORTANCE_ORDER[right.importance]);
    return {
      roleId: role.id,
      title: role.title,
      criteria: ordered.map((criterion) => criterion.label),
      needsHumanReview: role.unassessedRequirements.length,
      poolSize: reviews.length,
      leads: reviews.filter((review) => review.signaledCriterionCount > 0).slice(0, MAX_LEADS).map(lead),
    };
  });

  const states = input.sessions.map((session) => ({ session, state: interviewActionState(session, input.today) }));
  const pending = input.sessions.filter((session) => !session.communicatedAt);
  const interviews = { awaiting: pending.length, readyToCommunicate: pending.filter((session) => session.status === "completed").length, prepare: 0, communicate: 0, overdue: 0, done: 0 };
  for (const { state } of states) interviews[state] += 1;
  const attention = states
    .flatMap(({ session, state }): AttentionItem[] => state === "done" ? [] : [{
      sessionId: session.id,
      candidateName: session.preparation.candidateName,
      roleTitle: session.preparation.roleTitle,
      state,
      followUpOn: session.assessment.followUpOn,
      decision: session.assessment.decision,
      isDemo: session.isDemo,
    }])
    .sort((left, right) => ATTENTION_ORDER[left.state] - ATTENTION_ORDER[right.state]
      || (left.followUpOn ?? "9999").localeCompare(right.followUpOn ?? "9999")
      || left.candidateName.localeCompare(right.candidateName))
    .slice(0, MAX_ATTENTION);

  const applicants = [...pool]
    .sort((left, right) => right.appliedAt.localeCompare(left.appliedAt) || left.name.localeCompare(right.name))
    .slice(0, MAX_APPLICANTS)
    .map((candidate): ApplicantRow => {
      const claims = claimsFor(candidate);
      const closest = input.roles
        .map((role) => ({ role, review: (reviewsByRole.get(role.id) ?? []).find((review) => review.candidateId === candidate.id) }))
        .filter((item): item is { role: RoleBrief; review: CandidateRoleReview } => Boolean(item.review && reviewCoverage(item.review).covered > 0))
        .sort((left, right) => compareRoleCoverage(left.review, right.review) || left.role.title.localeCompare(right.role.title))[0];
      return {
        id: candidate.id,
        name: candidate.name,
        role: candidate.role,
        statedRole: statedRoleOf(claims),
        appliedAt: candidate.appliedAt,
        hasPublicCode: candidate.analyses.length > 0,
        claimCount: statementsOf(claims).length,
        closestRole: closest ? { roleId: closest.role.id, title: closest.role.title, coverage: reviewCoverage(closest.review) } : null,
      };
    });

  const withPublicCode = pool.filter((candidate) => candidate.analyses.length > 0).length;
  return {
    demoOnly,
    pool: { total: pool.length, withPublicCode, cvOnly: pool.length - withPublicCode, demoExcluded: demoOnly ? 0 : input.candidates.length - real.length },
    roles: input.roles.length,
    interviews,
    boards,
    attention,
    applicants,
  };
}
