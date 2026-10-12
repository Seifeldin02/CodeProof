import { describe, expect, it } from "vitest";
import type { CandidateRoleReview, CriterionReview } from "@/features/shortlists/evaluate";
import { criterionSignal, suggestInterviewCriteria } from "./suggest";

function item(id: string, importance: "required" | "preferred" | "context", status: CriterionReview["status"], statedAs: string[] = []): CriterionReview {
  return { criterion: { id, capabilityId: status === "not_checkable" ? null : `capability.${id}`, label: id, importance }, status, citations: [], statedAs };
}

function review(...criteria: CriterionReview[]): CandidateRoleReview {
  return { criteria } as unknown as CandidateRoleReview;
}

describe("what to raise first in an interview", () => {
  it("says what is known about a criterion, with verified code ahead of the CV's word", () => {
    expect(criterionSignal(item("a", "required", "cited_evidence", ["a"]))).toBe("verified");
    expect(criterionSignal(item("a", "required", "not_checkable", ["a"]))).toBe("stated");
    expect(criterionSignal(item("a", "required", "attribution_pending"))).toBe("pending");
    expect(criterionSignal(item("a", "required", "not_observed"))).toBe("none");
  });

  it("starts with what the role requires and nobody has checked", () => {
    const suggestion = suggestInterviewCriteria(review(
      item("verified", "required", "cited_evidence"),
      item("gap", "required", "not_observed"),
      item("claimed", "required", "not_checkable", ["claimed"]),
      item("unattributed", "required", "attribution_pending"),
      item("nice", "preferred", "not_checkable", ["nice"]),
      item("mentioned", "context", "not_checkable", ["mentioned"]),
    ));
    expect(suggestion).toEqual(["claimed", "unattributed", "gap", "verified", "nice"]);
  });

  it("keeps the brief's order between criteria that are alike, and never suggests more than the limit", () => {
    const criteria = ["one", "two", "three", "four", "five", "six"].map((id) => item(id, "required", "not_checkable", [id]));
    expect(suggestInterviewCriteria(review(...criteria))).toEqual(["one", "two", "three", "four", "five"]);
    expect(suggestInterviewCriteria(review(...criteria), 2)).toEqual(["one", "two"]);
    expect(suggestInterviewCriteria(review())).toEqual([]);
  });
});
