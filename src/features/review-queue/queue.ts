import type { CandidateDetail } from "@/features/candidates/types";
import type { Role } from "@/features/hiring-analytics/types";
import { matchJobDescription } from "@/features/job-matching/match";
import type { ExtractedJobRequirement, JobRequirementMatch } from "@/types/analysis";
import type { CandidateEvidenceContext } from "@/features/evidence-requests/service";
import { repositoryOwnerConfirmed } from "@/features/evidence-requests/types";

/**
 * Drafts the order in which a recruiter should open candidate dossiers.
 *
 * The order is a starting point for a human decision, not a ranking, and it
 * follows three rules that keep it honest:
 *
 * 1. Only file-backed evidence can move a candidate up. An input that was never
 *    provided (no CV text, no company requirements, a repository that could not
 *    be analyzed) is reported as *unknown* and never pushes a candidate below a
 *    peer who has less evidence. Unknown counts as zero, the same as "nothing
 *    found", never as a penalty.
 * 2. Role fit is recomputed against the requirements saved *today*, using the
 *    same deterministic matcher the analysis pipeline uses, so the queue never
 *    disagrees with the dossier and never depends on when a candidate was
 *    analyzed relative to when the requirements were written.
 * 3. Nothing a candidate can write moves them. The wording of a CV, the number
 *    of technologies it lists and the candidate's name never enter the order.
 *    Equal evidence is settled by who was added first.
 */

export type ReviewTier = "review_first" | "review" | "verify_in_interview" | "evidence_incomplete";

export type UnknownSignal =
  | "no_repositories"
  | "failed_repositories"
  | "no_cv"
  | "no_requirements"
  | "sources_not_analyzed"
  | "evidence_requested"
  | "work_confidential";

/**
 * The drafted next step for the recruiter. Code evidence decides who can go
 * straight to an interview and who still needs a test or more evidence; it
 * never decides the outcome.
 */
export type NextStep = "interview_on_evidence" | "review_then_decide" | "test_or_verify" | "ask_for_evidence";

const NEXT_STEP: Record<ReviewTier, NextStep> = {
  review_first: "interview_on_evidence",
  review: "review_then_decide",
  verify_in_interview: "test_or_verify",
  evidence_incomplete: "ask_for_evidence",
};

/** A candidate who already said their work is confidential is not asked again. */
function nextStepFor(tier: ReviewTier, evidence: CandidateEvidenceContext | undefined): NextStep {
  return tier === "evidence_incomplete" && evidence?.confidential ? "test_or_verify" : NEXT_STEP[tier];
}

export interface RequirementCoverage {
  /** Requirements the order is judged against: the required ones, or all when none are marked required. */
  judged: number;
  strong: number;
  partial: number;
  unsupported: number;
  /** Requirement names with no repository evidence, for interview follow-up. */
  unsupportedNames: string[];
}

export interface ReviewQueueEntry {
  id: string;
  name: string;
  role: Role;
  isDemo: boolean;
  /** When the candidate was added. Settles equal evidence: first in, first reviewed. */
  appliedAt: string;
  tier: ReviewTier;
  nextStep: NextStep;
  /** Null when no company requirements are saved: role fit is unknown, not zero. */
  requirements: RequirementCoverage | null;
  /** Skills with Strong or Good implementation evidence across analyzed repositories. */
  strongSkills: number;
  /** Null when no CV text was provided: claim verification is unknown. */
  claims: { grounded: number; unverified: number } | null;
  /** Strong/Good skills the CV never mentions: the code says more than the résumé. */
  undersold: string[];
  repositories: { analyzed: number; failed: number };
  /** Portfolio / non-GitHub links from the CV or from the candidate that CodeProof cannot read yet. */
  unanalyzedSources: string[];
  /** Up to four source files that back the strongest evidence. */
  citedFiles: string[];
  /** Analysed repositories that sit under a GitHub account the candidate proved is theirs. */
  confirmedRepositories: number;
  /** When an evidence request was sent that the candidate has not answered yet. */
  evidenceRequestedAt: string | null;
  unknowns: UnknownSignal[];
  evidenceReviewedAt: string | null;
}

export interface ReviewQueue {
  entries: ReviewQueueEntry[];
  requirementsSaved: boolean;
  summary: {
    ready: number;
    incomplete: number;
    reviewed: number;
    demo: number;
    /** Candidates whose code shows strong or good skills their CV never mentions. */
    undersold: number;
    nextSteps: Record<NextStep, number>;
  };
}

const SUPPORT_RANK: Record<JobRequirementMatch["support"], number> = { "Strong match": 2, "Partial match": 1, "No repository evidence": 0 };

function mentions(text: string, skill: string): boolean {
  const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(text);
}

function coverage(candidate: CandidateDetail, requirements: ExtractedJobRequirement[]): RequirementCoverage | null {
  if (requirements.length === 0) return null;
  const best = new Map<string, JobRequirementMatch>();
  for (const analysis of candidate.analyses) {
    const { result } = analysis;
    const match = matchJobDescription("", result.technologies, result.skills, result.resumeVerification, requirements);
    for (const item of [...match.strongMatches, ...match.partialMatches, ...match.unsupportedRequirements]) {
      const current = best.get(item.requirement);
      if (!current || SUPPORT_RANK[item.support] > SUPPORT_RANK[current.support]) best.set(item.requirement, item);
    }
  }
  const required = requirements.filter((item) => item.importance === "required");
  const judgedSet = new Set((required.length ? required : requirements).map((item) => item.requirement));
  const judged = [...best.values()].filter((item) => judgedSet.has(item.requirement));
  const unsupported = judged.filter((item) => item.support === "No repository evidence");
  return {
    judged: judgedSet.size,
    strong: judged.filter((item) => item.support === "Strong match").length,
    partial: judged.filter((item) => item.support === "Partial match").length,
    // Requirements never seen by any analysis (no analyzed repository) are unsupported too.
    unsupported: judgedSet.size - judged.length + unsupported.length,
    unsupportedNames: unsupported.map((item) => item.requirement),
  };
}

function tierFor(entry: Pick<ReviewQueueEntry, "repositories" | "requirements">): ReviewTier {
  if (entry.repositories.analyzed === 0) return "evidence_incomplete";
  const { requirements } = entry;
  if (!requirements || requirements.judged === 0) return "review";
  if (requirements.unsupported === 0 && requirements.strong > 0) return "review_first";
  if (requirements.strong + requirements.partial > 0) return "review";
  return "verify_in_interview";
}

export function buildReviewEntry(
  candidate: CandidateDetail,
  requirements: ExtractedJobRequirement[],
  evidence?: CandidateEvidenceContext,
): ReviewQueueEntry {
  const analyzed = candidate.repositoryOutcomes.filter((outcome) => outcome.status === "analyzed").length;
  const failed = candidate.repositoryOutcomes.filter((outcome) => outcome.status === "failed").length;

  const strongSkillMap = new Map<string, string[]>();
  for (const analysis of candidate.analyses) {
    for (const skill of analysis.result.skills) {
      if (skill.level !== "Strong Evidence" && skill.level !== "Good Evidence") continue;
      const files = strongSkillMap.get(skill.skill) ?? [];
      strongSkillMap.set(skill.skill, [...files, ...skill.evidence.map((item) => item.file)]);
    }
  }

  const verifications = candidate.analyses.map((analysis) => analysis.result.resumeVerification).filter((item) => item !== null);
  const claimSupport = new Map<string, boolean>();
  for (const verification of verifications) {
    for (const claim of verification.claims) {
      claimSupport.set(claim.claim, (claimSupport.get(claim.claim) ?? false) || claim.support !== "No Repository Evidence");
    }
  }
  const claims = verifications.length
    ? { grounded: [...claimSupport.values()].filter(Boolean).length, unverified: [...claimSupport.values()].filter((supported) => !supported).length }
    : null;
  const claimText = [...claimSupport.keys()].join("\n");
  const undersold = claims ? [...strongSkillMap.keys()].filter((skill) => !mentions(claimText, skill)).sort() : [];

  const requirementCoverage = coverage(candidate, requirements);
  const unanalyzedSources = [...new Set([...(candidate.unanalyzedSources ?? []), ...(evidence?.otherLinks ?? [])])];
  const unknowns: UnknownSignal[] = [];
  if (analyzed === 0) unknowns.push("no_repositories");
  if (failed > 0) unknowns.push("failed_repositories");
  if (!claims) unknowns.push("no_cv");
  if (!requirementCoverage) unknowns.push("no_requirements");
  if (unanalyzedSources.length > 0) unknowns.push("sources_not_analyzed");
  if (evidence?.requestedAt) unknowns.push("evidence_requested");
  if (evidence?.confidential) unknowns.push("work_confidential");

  const repositories = { analyzed, failed };
  const tier = tierFor({ repositories, requirements: requirementCoverage });
  return {
    id: candidate.id,
    name: candidate.name,
    role: candidate.role,
    isDemo: Boolean(candidate.isDemo),
    appliedAt: candidate.appliedAt,
    tier,
    nextStep: nextStepFor(tier, evidence),
    requirements: requirementCoverage,
    strongSkills: strongSkillMap.size,
    claims,
    undersold,
    repositories,
    unanalyzedSources,
    citedFiles: [...new Set([...strongSkillMap.values()].flat())].slice(0, 4),
    confirmedRepositories: candidate.repositoryOutcomes.filter((outcome) => outcome.status === "analyzed" && repositoryOwnerConfirmed(outcome.repositoryUrl, evidence?.confirmedLogins ?? [])).length,
    evidenceRequestedAt: evidence?.requestedAt ?? null,
    unknowns,
    evidenceReviewedAt: candidate.evidenceReviewedAt ?? null,
  };
}

/**
 * Higher tuples review earlier. Unknown inputs contribute zero, never a negative.
 * Only repository evidence appears here: CV claims are checked and shown, but
 * listing more technologies on a CV must not move a candidate up.
 */
function rank(entry: ReviewQueueEntry): number[] {
  return [
    entry.repositories.analyzed > 0 ? 1 : 0,
    entry.requirements?.strong ?? 0,
    entry.requirements ? entry.requirements.strong + entry.requirements.partial : 0,
    entry.strongSkills,
  ];
}

export function compareReviewEntries(a: ReviewQueueEntry, b: ReviewQueueEntry): number {
  const left = rank(a);
  const right = rank(b);
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return right[index] - left[index];
  }
  // Equal evidence: first in, first reviewed. The id only makes the order stable.
  return a.appliedAt.localeCompare(b.appliedAt) || a.id.localeCompare(b.id);
}

export function buildReviewQueue(
  candidates: CandidateDetail[],
  requirements: ExtractedJobRequirement[],
  evidenceByCandidate: ReadonlyMap<string, CandidateEvidenceContext> = new Map(),
): ReviewQueue {
  const entries = candidates.map((candidate) => buildReviewEntry(candidate, requirements, evidenceByCandidate.get(candidate.id))).sort(compareReviewEntries);
  return {
    entries,
    requirementsSaved: requirements.length > 0,
    summary: {
      ready: entries.filter((entry) => entry.tier !== "evidence_incomplete").length,
      incomplete: entries.filter((entry) => entry.tier === "evidence_incomplete").length,
      reviewed: entries.filter((entry) => entry.evidenceReviewedAt !== null).length,
      demo: entries.filter((entry) => entry.isDemo).length,
      undersold: entries.filter((entry) => entry.undersold.length > 0).length,
      nextSteps: {
        interview_on_evidence: entries.filter((entry) => entry.nextStep === "interview_on_evidence").length,
        review_then_decide: entries.filter((entry) => entry.nextStep === "review_then_decide").length,
        test_or_verify: entries.filter((entry) => entry.nextStep === "test_or_verify").length,
        ask_for_evidence: entries.filter((entry) => entry.nextStep === "ask_for_evidence").length,
      },
    },
  };
}
