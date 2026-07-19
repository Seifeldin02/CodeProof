import { describe, expect, it } from "vitest";
import { verifyResumeClaims } from "./claims";
import type { SkillEvidence, TechnologySignal } from "@/types/analysis";

const technologies: TechnologySignal[] = [{ name: "React", category: "framework", evidence: ["package.json: react"], source: "Deterministic Fact" }];
const skills: SkillEvidence[] = [{
  skill: "TypeScript", level: "Good Evidence", explanation: "Types", origin: "deterministic",
  evidence: [{ file: "src/app.ts", summary: "Types", implementationExample: "Typed input", origin: "deterministic", source: "Deterministic Fact" }],
  source: "Deterministic Fact",
}];

describe("verifyResumeClaims", () => {
  it("distinguishes strong, signal-only and absent repository evidence", () => {
    const result = verifyResumeClaims("TypeScript, React, AWS", technologies, skills);
    expect(result.claims.find((item) => item.claim === "TypeScript")?.support).toBe("Strongly Supported");
    expect(result.claims.find((item) => item.claim === "React")?.support).toBe("Supported");
    expect(result.claims.find((item) => item.claim === "AWS")?.support).toBe("No Repository Evidence");
    expect(result.disclaimer).toContain("does not mean");
  });
});
