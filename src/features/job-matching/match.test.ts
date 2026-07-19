import { describe, expect, it } from "vitest";
import { matchJobDescription } from "./match";
import type { SkillEvidence, TechnologySignal } from "@/types/analysis";

describe("matchJobDescription", () => {
  it("matches requirements independently without an opaque score", () => {
    const technologies: TechnologySignal[] = [{ name: "Docker", category: "infrastructure", evidence: ["Dockerfile"] }];
    const skills: SkillEvidence[] = [{
      skill: "TypeScript", level: "Strong Evidence", explanation: "Types", origin: "ai_interpretation",
      evidence: [{ file: "src/app.ts", summary: "Types", implementationExample: "Typed service", origin: "ai_interpretation" }],
    }];
    const result = matchJobDescription("Required: TypeScript and AWS\nPreferred: Docker", technologies, skills, null);
    expect(result.strongMatches.map((item) => item.requirement)).toContain("TypeScript");
    expect(result.partialMatches.map((item) => item.requirement)).toContain("Docker");
    expect(result.unsupportedRequirements.map((item) => item.requirement)).toContain("AWS");
    expect(result.scoringMethod).toContain("No opaque fit score");
  });
});
