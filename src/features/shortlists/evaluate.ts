import type { CandidateDetail } from "@/features/candidates/types";
import { readJobBrief, strongerImportance } from "@/features/job-matching/brief";
import {
  canRollUpEvidence,
  getCapabilityTaxonomyVersion,
  getPinnedCapabilityTaxonomy,
  resolveCapabilityAliasInTaxonomy,
  type CapabilityTaxonomyVersion,
} from "@/features/repository-analysis/capability-taxonomy";
import { skillsNamedBy } from "@/features/resume-matching/claims";
import { statedWorkMonths } from "@/features/resume-matching/experience";
import { skillsCoveredBy } from "@/features/resume-matching/skills";
import type { EvidenceCitation } from "@/types/remediation";
import type { ExtractedResumeClaim } from "@/types/analysis";

export type RoleImportance = "required" | "preferred" | "context";
export const IMPORTANCE_ORDER: Record<RoleImportance, number> = { required: 0, preferred: 1, context: 2 };

export interface RoleCriterion {
  id: string;
  /** The capability CodeProof can look for in code. Null for a skill it can only compare with what a CV states. */
  capabilityId: string | null;
  label: string;
  importance: RoleImportance;
}

export interface RoleBrief {
  id: string;
  versionId: string;
  title: string;
  description: string;
  taxonomyVersion: string;
  criteria: RoleCriterion[];
  unassessedRequirements: string[];
  /** The most years of experience the brief asks for, or null when it asks for none. */
  minimumYears: number | null;
  createdAt: string;
}

export interface CriterionReview {
  criterion: RoleCriterion;
  /** What public code shows. "not_checkable" means no code check exists for this skill, so only the CV can speak to it. */
  status: "cited_evidence" | "attribution_pending" | "not_observed" | "not_checkable";
  citations: Array<Pick<EvidenceCitation, "filePath" | "sourceLink" | "evidenceLevel" | "repositoryName">>;
  /** Relevant public-code citations whose relationship to this candidate is not established. Never counted as verified. */
  observedCitations?: Array<Pick<EvidenceCitation, "filePath" | "sourceLink" | "evidenceLevel" | "repositoryName">>;
  /** The CV's own words that cover this criterion: "Django" for Python. Empty when the CV does not state it. */
  statedAs: string[];
}

export interface CandidateRoleReview {
  candidateId: string;
  candidateName: string;
  candidateRole: string;
  isDemo: boolean;
  evidenceReviewedAt: string | null;
  criteria: CriterionReview[];
  requiredCount: number;
  citedRequiredCount: number;
  citedCriterionCount: number;
  signaledRequiredCount: number;
  signaledCriterionCount: number;
  reportedCriteria: string[];
  reportedUnassessedRequirements: string[];
  /** Whole months of dated work on the CV, or null when the CV dates none. Candidate-reported, and never part of the order. */
  statedWorkMonths: number | null;
}

/** A CV claim can earn review attention without being misrepresented as verified code. */
export function compareCandidateRoleReviews(left: CandidateRoleReview, right: CandidateRoleReview): number {
  return Number(left.isDemo) - Number(right.isDemo)
    || right.signaledRequiredCount - left.signaledRequiredCount
    || right.citedRequiredCount - left.citedRequiredCount
    || right.signaledCriterionCount - left.signaledCriterionCount
    || right.citedCriterionCount - left.citedCriterionCount
    || left.candidateName.localeCompare(right.candidateName);
}

/** Alphabetical tie-breaking keeps rendering stable, but does not imply one tied applicant is a better fit. */
export function sameReviewPriority(left: CandidateRoleReview, right: CandidateRoleReview): boolean {
  return left.isDemo === right.isDemo
    && left.signaledRequiredCount === right.signaledRequiredCount
    && left.citedRequiredCount === right.citedRequiredCount
    && left.signaledCriterionCount === right.signaledCriterionCount
    && left.citedCriterionCount === right.citedCriterionCount;
}

/** The count shown for a candidate: against the required criteria when the brief marks any, otherwise against all of them. */
export function reviewCoverage(review: CandidateRoleReview): { covered: number; total: number; scope: "required" | "all" } {
  return review.requiredCount > 0
    ? { covered: review.signaledRequiredCount, total: review.requiredCount, scope: "required" }
    : { covered: review.signaledCriterionCount, total: review.criteria.length, scope: "all" };
}

/** Orders the roles one candidate could be looked at for: by the share of that count covered, then by the count itself. */
export function compareRoleCoverage(left: CandidateRoleReview, right: CandidateRoleReview): number {
  const share = (review: CandidateRoleReview): number => {
    const { covered, total } = reviewCoverage(review);
    return total > 0 ? covered / total : 0;
  };
  return share(right) - share(left) || reviewCoverage(right).covered - reviewCoverage(left).covered;
}

/**
 * Every skill a brief names becomes a criterion. Where the taxonomy knows the skill it can also be checked against
 * code; elsewhere it can only be compared with what a CV states, and says so.
 */
export function extractRoleCriteria(description: string, taxonomy: CapabilityTaxonomyVersion = getPinnedCapabilityTaxonomy()): {
  criteria: Array<Omit<RoleCriterion, "id">>;
  unassessedRequirements: string[];
  minimumYears: number | null;
} {
  const brief = readJobBrief(description);
  const criteria = new Map<string, Omit<RoleCriterion, "id">>();
  for (const skill of brief.skills) {
    const node = resolveCapabilityAliasInTaxonomy(skill.name, taxonomy);
    const key = node?.id ?? skill.name;
    criteria.set(key, {
      capabilityId: node?.id ?? null,
      label: node?.labels.en ?? skill.name,
      importance: strongerImportance(criteria.get(key)?.importance, skill.importance),
    });
  }
  return { criteria: [...criteria.values()], unassessedRequirements: brief.humanReview, minimumYears: brief.minimumYears };
}

const CONCLUSIVE_LEVELS = new Set(["strong", "good", "partial"]);

/** Review-order signals are about available evidence, never ability or hire/no-hire decisions. */
export function evaluateCandidateForRole(
  candidate: CandidateDetail,
  role: RoleBrief,
  storedResumeClaims: ExtractedResumeClaim[] = [],
  today: string = new Date().toISOString().slice(0, 10),
): CandidateRoleReview {
  const taxonomy = getCapabilityTaxonomyVersion(role.taxonomyVersion);
  const analysisClaims = candidate.analyses.map((analysis) => analysis.result.resumeVerification?.claims ?? []);
  const claimNames = new Set([storedResumeClaims, ...analysisClaims].flatMap((claims) => claims.map((claim) => claim.claim)));
  const stated = skillsCoveredBy(new Set([storedResumeClaims, ...analysisClaims].flatMap((claims) => skillsNamedBy(claims))));
  // The same statements, by the capability each one names.
  const statedCapabilities = new Map<string, string[]>();
  for (const [name, via] of [...stated, ...[...claimNames].map((claim) => [claim, [claim]] as const)]) {
    const node = resolveCapabilityAliasInTaxonomy(name, taxonomy);
    if (node && !statedCapabilities.has(node.id)) statedCapabilities.set(node.id, [...via]);
  }
  const verifiedUrls = new Set(candidate.repositories
    .filter((repository) => repository.attributionStatus === "verified_contributor")
    .map((repository) => repository.repositoryUrl));
  const criteria = role.criteria.map((criterion): CriterionReview => {
    const capabilityId = criterion.capabilityId;
    if (!capabilityId) return { criterion, status: "not_checkable", citations: [], statedAs: stated.get(criterion.label) ?? [] };
    const cited: CriterionReview["citations"] = [];
    const observed: CriterionReview["citations"] = [];
    let attributionPending = false;
    const seen = new Set<string>();
    for (const analysis of candidate.analyses) {
      const bundle = analysis.result.canonicalEvidence;
      if (!bundle) continue;
      const findingIds = new Set(bundle.findings
        .filter((finding) => canRollUpEvidence(finding.capabilityId, capabilityId, bundle.taxonomyVersion))
        .map((finding) => finding.id));
      for (const citation of bundle.citations) {
        if (!findingIds.has(citation.findingId) || citation.repositoryUrl !== analysis.repositoryUrl) continue;
        if (!CONCLUSIVE_LEVELS.has(citation.evidenceLevel)) continue;
        if (citation.attributionStatus !== "verified_contributor" || !verifiedUrls.has(analysis.repositoryUrl)) {
          attributionPending = true;
          const key = `${citation.repositoryUrl}:${citation.revision ?? ""}:${citation.filePath}`;
          if (!seen.has(key)) {
            seen.add(key);
            observed.push({ filePath: citation.filePath, sourceLink: citation.sourceLink, evidenceLevel: citation.evidenceLevel, repositoryName: citation.repositoryName });
          }
          continue;
        }
        const key = `${citation.repositoryUrl}:${citation.revision ?? ""}:${citation.filePath}`;
        if (seen.has(key)) continue;
        seen.add(key);
        cited.push({ filePath: citation.filePath, sourceLink: citation.sourceLink, evidenceLevel: citation.evidenceLevel, repositoryName: citation.repositoryName });
      }
    }
    return {
      criterion,
      status: cited.length > 0 ? "cited_evidence" : attributionPending ? "attribution_pending" : "not_observed",
      citations: cited.slice(0, 3),
      observedCitations: observed.slice(0, 3),
      statedAs: statedCapabilities.get(capabilityId) ?? [],
    };
  });
  const signaled = criteria.filter((item) => item.status === "cited_evidence" || item.statedAs.length > 0);
  const required = criteria.filter((item) => item.criterion.importance === "required");
  return {
    candidateId: candidate.id,
    candidateName: candidate.name,
    candidateRole: candidate.role,
    isDemo: Boolean(candidate.isDemo),
    evidenceReviewedAt: candidate.evidenceReviewedAt ?? null,
    criteria,
    requiredCount: required.length,
    citedRequiredCount: required.filter((item) => item.status === "cited_evidence").length,
    citedCriterionCount: criteria.filter((item) => item.status === "cited_evidence").length,
    signaledRequiredCount: signaled.filter((item) => item.criterion.importance === "required").length,
    signaledCriterionCount: signaled.length,
    // What the role requires comes first, so a reader shown only the first few names sees the ones that matter most.
    reportedCriteria: criteria.filter((item) => item.statedAs.length > 0)
      .sort((left, right) => IMPORTANCE_ORDER[left.criterion.importance] - IMPORTANCE_ORDER[right.criterion.importance])
      .map((item) => item.criterion.label),
    reportedUnassessedRequirements: role.unassessedRequirements.filter((requirement) => [...claimNames].some((claim) => claim.toLowerCase() === requirement.toLowerCase())),
    statedWorkMonths: statedWorkMonths(storedResumeClaims, today),
  };
}
