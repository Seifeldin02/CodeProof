import { describe, expect, it } from "vitest";
import { extractResumeClaims, statedRoleOf, verifyResumeClaims } from "./claims";
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

describe("candidate-reported CV role headlines", () => {
  it("captures an explicit headline without inventing a role from unrelated skills", () => {
    expect(extractResumeClaims("Amina Hassan\nFull-Stack Engineer -- DEMO SAMPLE CV\nTypeScript, Node.js"))
      .toContainEqual({ claim: "Full-Stack Engineer", category: "role", source: "Candidate Claim" });
    expect(extractResumeClaims("Amina Hassan\nTypeScript, Node.js, React")
      .filter((claim) => claim.category === "role")).toEqual([]);
  });

  it("reads a headline with a seniority, a place or an employer around the title", () => {
    const stated = (text: string) => statedRoleOf(extractResumeClaims(text));
    expect(stated("Omar Example\nSenior Full-Stack Developer | Riyadh, Saudi Arabia")).toBe("Full-Stack Engineer");
    expect(stated("Omar Example\nLead Android Developer at Example Co")).toBe("Mobile Engineer");
    expect(stated("Omar Example\nData Analyst")).toBe("Data Analyst");
    expect(stated("Omar Example\nSoftware Engineer, Example Bank")).toBe("Software Engineer");
    // A sentence that merely contains a title is not a headline.
    expect(stated("Omar Example\nI worked with every backend engineer on the team")).toBeNull();
  });
});

describe("the skills a CV names", () => {
  it("reads them in the CV's order, in the listed spelling, without everyday words", () => {
    const text = "Omar Example\nBackend Engineer\nHappy to go the extra mile.\nSkills: NodeJS, Postgres, Docker, K8s\nSpring 2019 intern";
    expect(extractResumeClaims(text).filter((claim) => claim.category === "technology").map((claim) => claim.claim))
      .toEqual(["Node.js", "PostgreSQL", "Docker", "Kubernetes"]);
  });

  it("keeps sentences about the work even when the CV lists many skills", () => {
    const many = ["JavaScript", "TypeScript", "Python", "Java", "Kotlin", "PHP", "Scala", "Perl", "Bash", "SQL", "HTML", "CSS", "React", "Vue", "Angular", "Svelte",
      "Redux", "jQuery", "Webpack", "Figma", "Fastify", "Django", "Flask", "Laravel", "Symfony", "GraphQL", "gRPC", "Kafka", "Redis", "Prisma", "MySQL", "MongoDB",
      "Docker", "Kubernetes", "Terraform", "Ansible", "AWS", "Azure", "Linux", "Nginx", "Jest", "Cypress", "Selenium", "Agile", "Jira"];
    const claims = extractResumeClaims(`${many.join(", ")}\nBuilt the billing platform for three markets.`);
    expect(claims.filter((claim) => claim.category === "technology")).toHaveLength(40);
    expect(claims.map((claim) => claim.claim)).toContain("Built the billing platform for three markets.");
  });
});
