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

describe("files cited for a claim", () => {
  it("cites no file when a language was only counted by file extension", () => {
    const languageOnly: TechnologySignal[] = [
      { name: "Ruby", category: "language", evidence: ["Archive file-extension statistics"], source: "Deterministic Fact" },
      { name: "React", category: "framework", evidence: ["package.json: react", "src/App.tsx"], source: "Deterministic Fact" },
    ];
    const result = verifyResumeClaims("Ruby, React", languageOnly, []);
    expect(result.claims.find((item) => item.claim === "Ruby")).toMatchObject({ support: "Supported", files: [] });
    expect(result.claims.find((item) => item.claim === "React")?.files).toEqual(["package.json", "src/App.tsx"]);
  });
});
