import { describe, expect, it } from "vitest";
import type { AiAnalysisOutput } from "./provider";
import { groundAiOutput } from "./grounding";

const output: AiAnalysisOutput = {
  architecture: {
    purpose: "Test", overview: "Test", majorModules: ["src"], boundaries: ["src/api.ts", "invented.ts"],
    dataFlow: [], engineeringDecisions: [], importantFiles: ["src/api.ts", "ghost.ts"], origin: "ai_interpretation",
  },
  skills: [
    { skill: "TypeScript", level: "Good Evidence", explanation: "Typed service", origin: "ai_interpretation", evidence: [
      { file: "src/api.ts", summary: "Real", implementationExample: "Typed handler", origin: "ai_interpretation" },
      { file: "ghost.ts", summary: "Fake", implementationExample: "Invented", origin: "ai_interpretation" },
    ] },
    { skill: "Kubernetes", level: "Strong Evidence", explanation: "Invented", origin: "ai_interpretation", evidence: [
      { file: "deployment.yaml", summary: "Fake", implementationExample: "Invented", origin: "ai_interpretation" },
    ] },
  ],
  gaps: [{ area: "Tests", explanation: "Limited", checkedFiles: ["src/api.ts", "fake.test.ts"], origin: "ai_interpretation" }],
  interviewQuestions: [
    { question: "Real?", relatedSkill: "API", difficulty: "Intermediate", files: ["src/api.ts"], relevance: "Real", origin: "ai_interpretation" },
    { question: "Fake?", relatedSkill: "K8s", difficulty: "Advanced", files: ["deployment.yaml"], relevance: "Fake", origin: "ai_interpretation" },
  ],
};

describe("groundAiOutput", () => {
  it("removes every hallucinated file reference and drops unsupported claims", () => {
    const grounded = groundAiOutput(output, ["src/api.ts"]);
    expect(grounded.rejectedPathCount).toBe(6);
    expect(grounded.output.architecture.importantFiles).toEqual(["src/api.ts"]);
    expect(grounded.output.architecture.boundaries).toEqual(["src/api.ts"]);
    expect(grounded.output.skills).toHaveLength(1);
    expect(grounded.output.skills[0].evidence).toHaveLength(1);
    expect(grounded.output.interviewQuestions).toHaveLength(1);
    expect(grounded.output.gaps[0].checkedFiles).toEqual(["src/api.ts"]);
  });
});
