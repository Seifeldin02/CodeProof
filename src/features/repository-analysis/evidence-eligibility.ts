import type { CandidateDetail, CandidateRepositoryAnalysis } from "@/features/candidates/types";
import type { AttributionStatus, CandidateConclusion, EvidenceCitation } from "@/types/remediation";

/** The sole attribution state allowed to support candidate-level conclusions. */
export function isConclusionEligibleAttribution(status: AttributionStatus): boolean {
  return status === "verified_contributor";
}

export function isCitationEligibleForConclusion(citation: Pick<EvidenceCitation, "attributionStatus">): boolean {
  return isConclusionEligibleAttribution(citation.attributionStatus);
}

export function filterEligibleCitations<T extends Pick<EvidenceCitation, "attributionStatus">>(
  citations: readonly T[],
): readonly T[] {
  return citations.filter(isCitationEligibleForConclusion);
}

export function conclusionHasEligibleCitation(
  conclusion: Pick<CandidateConclusion, "citationIds">,
  citations: readonly Pick<EvidenceCitation, "id" | "attributionStatus">[],
): boolean {
  const eligibleIds = new Set(citations.filter(isCitationEligibleForConclusion).map((citation) => citation.id));
  return conclusion.citationIds.some((citationId) => eligibleIds.has(citationId));
}

/** Raw analyses remain reviewable; only verified contribution analyses enter conclusions/ranking. */
export function eligibleCandidateAnalyses(candidate: Pick<CandidateDetail, "analyses" | "repositories">): readonly CandidateRepositoryAnalysis[] {
  const eligibleUrls = new Set(candidate.repositories
    .filter((repository) => isConclusionEligibleAttribution(repository.attributionStatus))
    .map((repository) => repository.repositoryUrl));
  return candidate.analyses.filter((analysis) => (
    eligibleUrls.has(analysis.repositoryUrl)
    && analysis.result.canonicalEvidence?.citations.some((citation) => isCitationEligibleForConclusion(citation)) === true
  ));
}
