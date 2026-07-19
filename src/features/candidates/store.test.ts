import { describe, expect, it } from "vitest";
import type { AnalysisResult } from "@/types/analysis";
import { calculateEvidenceIndex, CandidateStore } from "./store";

function result(levels: AnalysisResult["skills"][number]["level"][]): AnalysisResult {
  return { skills: levels.map((level, index) => ({ skill: `Skill ${index}`, level })), resumeVerification: null } as unknown as AnalysisResult;
}

describe("candidate evidence persistence", () => {
  it("computes a transparent weighted evidence index", () => {
    expect(calculateEvidenceIndex([result(["Strong Evidence", "Good Evidence", "Limited Evidence"])] )).toBe(67);
    expect(calculateEvidenceIndex([result([])])).toBe(0);
  });

  it("starts with an empty candidate database", () => {
    const store = new CandidateStore(":memory:");
    expect(store.listCandidates()).toEqual([]);
    store.db.close();
  });
});
