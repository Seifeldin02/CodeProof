import { describe, expect, it } from "vitest";
import type { CandidateRecord } from "./types";
import { computeStageDropOff } from "./analytics";

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
