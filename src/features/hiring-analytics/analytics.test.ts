import { describe, expect, it } from "vitest";
import type { CandidateRecord } from "./types";
import { computeSourceMetrics, computeStageDropOff, deriveInsights, hasSourceComparison } from "./analytics";

function candidate(outcome: CandidateRecord["outcome"]): CandidateRecord {
  return {
    id: outcome,
    name: "Candidate",
    role: "Frontend Engineer",
    source: "Job Board",
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

describe("candidate source channels", () => {
  const from = (source: CandidateRecord["source"], outcome: CandidateRecord["outcome"], index: number): CandidateRecord => ({ ...candidate(outcome), id: `${source}-${outcome}-${index}`, source });
  const group = (source: CandidateRecord["source"], hired: number, open: number) => [
    ...Array.from({ length: hired }, (_item, index) => from(source, "hired", index)),
    ...Array.from({ length: open }, (_item, index) => from(source, "in_progress", index)),
  ];

  it("has nothing to compare while every applicant sits under one channel", () => {
    const records = [...group("Job Board", 3, 5), ...group("Not recorded", 2, 4)];
    expect(hasSourceComparison(computeSourceMetrics(records))).toBe(false);
    expect(deriveInsights(records).some((insight) => insight.id === "best-source")).toBe(false);
  });

  it("compares channels once two of them hold applicants", () => {
    const records = [...group("Job Board", 1, 5), ...group("Referral", 4, 2)];
    expect(hasSourceComparison(computeSourceMetrics(records))).toBe(true);
    expect(deriveInsights(records).find((insight) => insight.id === "best-source")?.text).toContain("Referral is your strongest channel");
  });

  it("does not name a strongest channel when only one holds enough applicants to judge", () => {
    const records = [...group("Job Board", 2, 6), ...group("LinkedIn", 1, 1)];
    expect(hasSourceComparison(computeSourceMetrics(records))).toBe(true);
    expect(deriveInsights(records).some((insight) => insight.id === "best-source")).toBe(false);
  });
});
