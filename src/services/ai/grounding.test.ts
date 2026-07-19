import { describe, expect, it } from "vitest";
import type { AiAnalysisOutput } from "./provider";
import { groundAiOutput } from "./grounding";

const output: AiAnalysisOutput = {
  architecture: {
    purpose: "Test", overview: "Test", majorModules: ["src"], boundaries: ["src/api.ts", "invented.ts"],
    dataFlow: [], engineeringDecisions: [], importantFiles: ["src/api.ts", "ghost.ts"], origin: "ai_interpretation",
    source: "AI Interpretation",
  },
  skills: [
    { skill: "TypeScript", level: "Good Evidence", explanation: "Typed service", origin: "ai_interpretation", evidence: [
      { file: "src/api.ts", summary: "Real", implementationExample: "Typed handler", origin: "ai_interpretation", source: "AI Interpretation" },
      { file: "ghost.ts", summary: "Fake", implementationExample: "Invented", origin: "ai_interpretation", source: "AI Interpretation" },
    ], source: "AI Interpretation" },
    { skill: "Kubernetes", level: "Strong Evidence", explanation: "Invented", origin: "ai_interpretation", evidence: [
      { file: "deployment.yaml", summary: "Fake", implementationExample: "Invented", origin: "ai_interpretation", source: "AI Interpretation" },
    ], source: "AI Interpretation" },
  ],
  gaps: [{ area: "Tests", explanation: "Limited", checkedFiles: ["src/api.ts", "fake.test.ts"], origin: "ai_interpretation", source: "AI Interpretation" }],
  interviewQuestions: [
    { question: "Real?", relatedSkill: "API", difficulty: "Intermediate", files: ["src/api.ts"], relevance: "Real", origin: "ai_interpretation", source: "AI Interpretation" },
    { question: "Fake?", relatedSkill: "K8s", difficulty: "Advanced", files: ["deployment.yaml"], relevance: "Fake", origin: "ai_interpretation", source: "AI Interpretation" },
  ],
};

describe("groundAiOutput", () => {
  it("removes every hallucinated file reference and drops unsupported claims", () => {
    const grounded = groundAiOutput(output, [{
      path: "src/api.ts",
      size: 500,
      sha: "abc",
      content: "export async function handler(input: Request) { const data = await service.load(input); return Response.json(data); }".repeat(3),
      truncated: false,
      selectionReason: "Request routing or API boundary",
    }]);
    expect(grounded.rejectedPathCount).toBe(6);
    expect(grounded.output.architecture.importantFiles).toEqual(["src/api.ts"]);
    expect(grounded.output.architecture.boundaries).toEqual(["src/api.ts"]);
    expect(grounded.output.skills).toHaveLength(1);
    expect(grounded.output.skills[0].evidence).toHaveLength(1);
    expect(grounded.output.skills[0].level).toBe("Partial Evidence");
    expect(grounded.downgradedSkillCount).toBe(2);
    expect(grounded.output.interviewQuestions).toHaveLength(1);
    expect(grounded.output.gaps[0].checkedFiles).toEqual(["src/api.ts"]);
  });
});
