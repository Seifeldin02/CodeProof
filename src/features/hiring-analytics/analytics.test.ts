import { describe, expect, it } from "vitest";
import type { CandidateRecord } from "./types";
import { computeEvidenceGroups, computeSourceMetrics, computeStageDropOff } from "./analytics";

function candidate(outcome: CandidateRecord["outcome"]): CandidateRecord {
  return {
    id: outcome,
    name: "Candidate",
    role: "Frontend Engineer",
    source: "CodeProof",
    verifiedSkillScore: 50,
    appliedAt: "2026-07-20",
    outcome,
    furthestStage: "code_review",
    stageHistory: [
      { stage: "applied", enteredAt: "2026-07-20" },
      { stage: "screening", enteredAt: "2026-07-20" },
      { stage: "code_review", enteredAt: "2026-07-20" },
    ],
  };
}

describe("computeStageDropOff", () => {
  it("does not label an active candidate waiting in a stage as a drop-off", () => {
    const transition = computeStageDropOff([candidate("in_progress")]).find((item) => item.fromStage === "code_review");
    expect(transition).toMatchObject({ dropped: 0, dropRate: 0 });
  });

  it("counts a terminal rejected candidate as a resolved drop-off", () => {
    const transition = computeStageDropOff([candidate("rejected")]).find((item) => item.fromStage === "code_review");
    expect(transition).toMatchObject({ dropped: 1, dropRate: 100 });
  });
});

describe("evidence and outcomes", () => {
  const withEvidence = (id: string, outcome: CandidateRecord["outcome"], evidence: CandidateRecord["evidence"]): CandidateRecord => ({ ...candidate(outcome), id, evidence });

  it("groups candidates by what the code supports and keeps no code read as its own group", () => {
    const groups = computeEvidenceGroups([
      withEvidence("a", "hired", { strong: 1, good: 0, partial: 0, limited: 0, repositories: 1 }),
      withEvidence("b", "in_progress", { strong: 0, good: 2, partial: 1, limited: 0, repositories: 2 }),
      withEvidence("c", "rejected", { strong: 0, good: 0, partial: 1, limited: 2, repositories: 1 }),
      withEvidence("d", "hired", { strong: 0, good: 0, partial: 0, limited: 0, repositories: 0 }),
      withEvidence("e", "in_progress", undefined),
    ]);
    expect(groups).toEqual([
      { group: "no_code_read", candidates: 2, hired: 1, hireRate: 50 },
      { group: "lighter_signals", candidates: 1, hired: 0, hireRate: 0 },
      { group: "strong_or_good", candidates: 2, hired: 1, hireRate: 50 },
    ]);
  });

  it("reports code coverage per source as counts, not as an average", () => {
    const [source] = computeSourceMetrics([
      withEvidence("a", "hired", { strong: 1, good: 0, partial: 0, limited: 0, repositories: 1 }),
      withEvidence("b", "in_progress", { strong: 0, good: 0, partial: 1, limited: 0, repositories: 1 }),
      withEvidence("c", "in_progress", { strong: 0, good: 0, partial: 0, limited: 0, repositories: 0 }),
    ]);
    expect(source).toMatchObject({ source: "CodeProof", applicants: 3, withCodeRead: 2, withStrongOrGood: 1 });
  });
});
