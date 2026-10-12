import { IMPORTANCE_ORDER, type CandidateRoleReview, type CriterionReview } from "@/features/shortlists/evaluate";

/** What is known about one criterion before the interview: verified code, the CV's word, unattributed code, or nothing. */
export type CriterionSignal = "verified" | "stated" | "pending" | "none";

export function criterionSignal(item: CriterionReview): CriterionSignal {
  if (item.status === "cited_evidence") return "verified";
  if (item.statedAs.length > 0) return "stated";
  return item.status === "attribution_pending" ? "pending" : "none";
}

/** A conversation adds most where the candidate has said something nobody has checked, and least where code is verified. */
const NEEDS_TALKING = { stated: 0, pending: 1, none: 2, verified: 3 } as const;

/** The criteria to raise first with this candidate for this role: what the role needs most and the evidence settles least. */
export function suggestInterviewCriteria(review: CandidateRoleReview, limit = 5): string[] {
  return review.criteria
    .map((item, index) => ({ item, index }))
    .sort((left, right) => IMPORTANCE_ORDER[left.item.criterion.importance] - IMPORTANCE_ORDER[right.item.criterion.importance]
      || NEEDS_TALKING[criterionSignal(left.item)] - NEEDS_TALKING[criterionSignal(right.item)]
      || left.index - right.index)
    .slice(0, limit)
    .map(({ item }) => item.criterion.id);
}
