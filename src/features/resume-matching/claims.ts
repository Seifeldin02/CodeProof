import type {
  ExtractedResumeClaim,
  ResumeClaimVerification,
  ResumeVerification,
  SkillEvidence,
  TechnologySignal,
} from "@/types/analysis";

const KNOWN_CLAIMS = [
  "JavaScript", "TypeScript", "React", "Next.js", "Vue", "Nuxt", "Angular", "Svelte", "Node.js", "Express",
  "Fastify", "NestJS", "Python", "Django", "FastAPI", "PHP", "Laravel", "Java", "Spring", "Kotlin", "Go",
  "Rust", "C#", ".NET", "Ruby", "PostgreSQL", "MySQL", "MongoDB", "Redis", "Prisma", "SQLAlchemy",
  "Docker", "Kubernetes", "Terraform", "AWS", "Azure", "Google Cloud", "GitHub Actions", "CI/CD", "Jest",
  "Vitest", "Cypress", "Playwright", "Redux", "Zustand", "GraphQL", "REST", "Microservices",
] as const;

function mentions(text: string, claim: string): boolean {
  const escaped = claim.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(text);
}

export function extractResumeClaims(text: string): ExtractedResumeClaim[] {
  const claims: ExtractedResumeClaim[] = KNOWN_CLAIMS.filter((claim) => mentions(text, claim)).map((claim) => ({
    claim,
    category: "technology" as const,
    source: "Candidate Claim" as const,
  }));

  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length >= 12 && line.length <= 180);
  for (const line of lines) {
    if (/\b(architected|designed|built|implemented|developed|led|owned|migrated|scaled|optimized)\b/i.test(line)) {
      claims.push({
        claim: line.replace(/^[-*•]\s*/, ""),
        category: /\b(led|owned|managed)\b/i.test(line) ? "role" : "engineering",
        source: "Candidate Claim",
      });
    }
  }
  return claims.filter((item, index, all) => all.findIndex((candidate) => candidate.claim.toLowerCase() === item.claim.toLowerCase()) === index).slice(0, 30);
}

export function verifyResumeClaims(
  resumeText: string,
  technologies: TechnologySignal[],
  skills: SkillEvidence[],
  extractedClaims?: ExtractedResumeClaim[],
): ResumeVerification {
  const technologyByName = new Map(technologies.map((item) => [item.name.toLowerCase(), item]));
  const skillByName = new Map(skills.map((item) => [item.skill.toLowerCase(), item]));
  const claims = (extractedClaims ?? extractResumeClaims(resumeText)).map<ResumeClaimVerification>((claim) => {
    const normalized = claim.claim.toLowerCase();
    const skill = skillByName.get(normalized);
    const technology = technologyByName.get(normalized);
    if (skill && (skill.level === "Strong Evidence" || skill.level === "Good Evidence")) {
      return {
        ...claim,
        support: "Strongly Supported",
        explanation: `${claim.claim} is supported by reviewed implementation evidence in this repository.`,
        files: skill.evidence.map((item) => item.file),
      };
    }
    if (skill || technology) {
      return {
        ...claim,
        support: "Supported",
        explanation: `${claim.claim} is supported by repository signals, though this analysis does not verify the full scope of the résumé claim.`,
        files: skill?.evidence.map((item) => item.file) ?? technology?.evidence.map((item) => item.split(": ")[0]).filter((path) => path !== "GitHub language statistics") ?? [],
      };
    }
    const related = skills.find((item) => normalized.includes(item.skill.toLowerCase()) || item.skill.toLowerCase().includes(normalized));
    if (related && claim.category !== "technology") {
      return {
        ...claim,
        support: "Partially Supported",
        explanation: `Some related implementation evidence is visible, but the complete claim cannot be verified from this repository alone.`,
        files: related.evidence.map((item) => item.file),
      };
    }
    return {
      ...claim,
      support: "No Repository Evidence",
      explanation: `${claim.claim} has no repository evidence in the selected files. This repository does not provide enough evidence to verify or reject the claim.`,
      files: [],
    };
  });

  return {
    claims,
    disclaimer: "No Repository Evidence does not mean a résumé claim is false. It means this repository does not provide enough evidence to verify or reject it.",
    extractionMethod: extractedClaims ? "ai" : "deterministic",
  };
}
