import type { CandidateDetail } from "@/features/candidates/types";
import { extractJobRequirements } from "@/features/job-matching/match";
import {
  canRollUpEvidence,
  getCapabilityTaxonomyVersion,
  getPinnedCapabilityTaxonomy,
  resolveCapabilityAliasInTaxonomy,
} from "@/features/repository-analysis/capability-taxonomy";
import type { EvidenceCitation } from "@/types/remediation";
import type { ExtractedResumeClaim } from "@/types/analysis";

export type RoleImportance = "required" | "preferred" | "context";

export interface RoleCriterion {
  id: string;
  capabilityId: string;
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
  createdAt: string;
}

export interface CriterionReview {
  criterion: RoleCriterion;
  status: "cited_evidence" | "attribution_pending" | "not_observed";
  citations: Array<Pick<EvidenceCitation, "filePath" | "sourceLink" | "evidenceLevel" | "repositoryName">>;
}

export interface CandidateRoleReview {
  candidateId: string;
  candidateName: string;
  candidateRole: string;
  isDemo: boolean;
  evidenceReviewedAt: string | null;
  criteria: CriterionReview[];
  citedRequiredCount: number;
  citedCriterionCount: number;
  signaledRequiredCount: number;
  signaledCriterionCount: number;
  reportedCriteria: string[];
  reportedUnassessedRequirements: string[];
}

/** A CV claim can earn review attention without being misrepresented as verified code. */
export function compareCandidateRoleReviews(left: CandidateRoleReview, right: CandidateRoleReview): number {
  return Number(left.isDemo) - Number(right.isDemo)
    || right.signaledRequiredCount - left.signaledRequiredCount
    || right.signaledCriterionCount - left.signaledCriterionCount
    || left.candidateName.localeCompare(right.candidateName);
}

/** Only exact, taxonomy-recognized technical requirements can be checked against code. */
export function extractRoleCriteria(description: string): {
  criteria: Array<Omit<RoleCriterion, "id">>;
  unassessedRequirements: string[];
} {
  const taxonomy = getPinnedCapabilityTaxonomy();
  const extracted = extractJobRequirements(description);
  // A full stop ends a clause only before a space or the end of a line, so "Next.js" and "Node.js" stay whole.
  const clauses = description.split(/[;!?\n]+|\.(?=\s|$)/).map((clause) => clause.trim()).filter(Boolean);
  const criteria = new Map<string, Omit<RoleCriterion, "id">>();
  const unassessedRequirements: string[] = [];
  for (const item of extracted) {
    const node = item.category === "skill" ? resolveCapabilityAliasInTaxonomy(item.requirement, taxonomy) : null;
    if (!node) {
      if (item.category === "skill") unassessedRequirements.push(item.requirement);
      else unassessedRequirements.push(...clauses.filter((clause) => /\b(\d+\+? years?|degree|leadership|mentor|communication)\b/i.test(clause)));
      continue;
    }
    const clause = clauses.find((part) => part.toLowerCase().includes(item.requirement.toLowerCase())) ?? "";
    const required = /\b(required|must|need|essential|mandatory)\b/i.test(clause);
    const preferred = /\b(preferred|nice to have|bonus|ideally)\b/i.test(clause);
    // A mixed clause needs recruiter interpretation; do not silently promote it to a must-have.
    const detectedImportance: RoleImportance = required && preferred ? "context" : required ? "required" : preferred ? "preferred" : item.importance;
    const previous = criteria.get(node.id);
    const importance = previous?.importance === "required" || detectedImportance === "required"
      ? "required" : previous?.importance === "preferred" || detectedImportance === "preferred" ? "preferred" : "context";
    criteria.set(node.id, { capabilityId: node.id, label: node.labels.en, importance });
  }
  return { criteria: [...criteria.values()], unassessedRequirements: [...new Set(unassessedRequirements)] };
}

const CONCLUSIVE_LEVELS = new Set(["strong", "good", "partial"]);

/** Review-order signals are about available evidence, never ability or hire/no-hire decisions. */
export function evaluateCandidateForRole(
  candidate: CandidateDetail,
  role: RoleBrief,
  storedResumeClaims: ExtractedResumeClaim[] = [],
): CandidateRoleReview {
  const taxonomy = getCapabilityTaxonomyVersion(role.taxonomyVersion);
  const claimNames = new Set([
    ...storedResumeClaims.map((claim) => claim.claim),
    ...candidate.analyses.flatMap((analysis) => analysis.result.resumeVerification?.claims.map((claim) => claim.claim) ?? []),
  ]);
  const reportedCapabilities = new Set([...claimNames].flatMap((claim) => {
    const node = resolveCapabilityAliasInTaxonomy(claim, taxonomy);
    return node ? [node.id] : [];
  }));
  const verifiedUrls = new Set(candidate.repositories
    .filter((repository) => repository.attributionStatus === "verified_contributor")
    .map((repository) => repository.repositoryUrl));
  const criteria = role.criteria.map((criterion): CriterionReview => {
    const cited: CriterionReview["citations"] = [];
    let attributionPending = false;
    const seen = new Set<string>();
    for (const analysis of candidate.analyses) {
      const bundle = analysis.result.canonicalEvidence;
      if (!bundle) continue;
      const findingIds = new Set(bundle.findings
        .filter((finding) => canRollUpEvidence(finding.capabilityId, criterion.capabilityId, bundle.taxonomyVersion))
        .map((finding) => finding.id));
      for (const citation of bundle.citations) {
        if (!findingIds.has(citation.findingId) || citation.repositoryUrl !== analysis.repositoryUrl) continue;
        if (!CONCLUSIVE_LEVELS.has(citation.evidenceLevel)) continue;
        if (citation.attributionStatus !== "verified_contributor" || !verifiedUrls.has(analysis.repositoryUrl)) {
          attributionPending = true;
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
    };
  });
  return {
    candidateId: candidate.id,
    candidateName: candidate.name,
    candidateRole: candidate.role,
    isDemo: Boolean(candidate.isDemo),
    evidenceReviewedAt: candidate.evidenceReviewedAt ?? null,
    criteria,
    citedRequiredCount: criteria.filter((item) => item.criterion.importance === "required" && item.status === "cited_evidence").length,
    citedCriterionCount: criteria.filter((item) => item.status === "cited_evidence").length,
    signaledRequiredCount: criteria.filter((item) => item.criterion.importance === "required"
      && (item.status === "cited_evidence" || reportedCapabilities.has(item.criterion.capabilityId))).length,
    signaledCriterionCount: criteria.filter((item) => item.status === "cited_evidence"
      || reportedCapabilities.has(item.criterion.capabilityId)).length,
    reportedCriteria: role.criteria.filter((criterion) => reportedCapabilities.has(criterion.capabilityId)).map((criterion) => criterion.label),
    reportedUnassessedRequirements: role.unassessedRequirements.filter((requirement) => [...claimNames].some((claim) => claim.toLowerCase() === requirement.toLowerCase())),
  };
}
