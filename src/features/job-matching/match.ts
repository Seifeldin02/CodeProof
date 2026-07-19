import type {
  JobMatch,
  JobRequirementMatch,
  ResumeVerification,
  SkillEvidence,
  TechnologySignal,
} from "@/types/analysis";

const SKILLS = [
  "JavaScript", "TypeScript", "React", "Next.js", "Vue", "Angular", "Node.js", "Express", "Fastify", "NestJS",
  "Python", "Django", "FastAPI", "PHP", "Laravel", "Java", "Spring", "Kotlin", "Go", "Rust", "C#", ".NET",
  "PostgreSQL", "MySQL", "MongoDB", "Redis", "Prisma", "SQLAlchemy", "Docker", "Kubernetes", "Terraform", "AWS",
  "Azure", "Google Cloud", "GitHub Actions", "CI/CD", "Jest", "Vitest", "Cypress", "Playwright", "Redux", "Zustand",
  "GraphQL", "REST", "Microservices", "Accessibility", "Security", "Testing",
] as const;

function contains(text: string, value: string): boolean {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(text);
}

export function extractJobRequirements(text: string): Array<{ requirement: string; importance: JobRequirementMatch["importance"] }> {
  const requirements: Array<{ requirement: string; importance: JobRequirementMatch["importance"] }> = [];
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (const skill of SKILLS) {
    if (!contains(text, skill)) continue;
    const matchingLine = lines.find((line) => contains(line, skill)) ?? "";
    const importance = /preferred|nice to have|bonus|ideally/i.test(matchingLine)
      ? "preferred"
      : /required|must|minimum|need|proficien|experience with/i.test(matchingLine)
        ? "required"
        : "context";
    requirements.push({ requirement: skill, importance });
  }

  for (const line of lines.filter((item) => /\b(\d+\+? years?|degree|leadership|mentor|communication)\b/i.test(item))) {
    requirements.push({ requirement: line.replace(/^[-*•]\s*/, "").slice(0, 180), importance: /preferred|nice/i.test(line) ? "preferred" : "context" });
  }
  return requirements.filter((item, index, all) => all.findIndex((candidate) => candidate.requirement.toLowerCase() === item.requirement.toLowerCase()) === index).slice(0, 30);
}

export function matchJobDescription(
  jobDescription: string,
  technologies: TechnologySignal[],
  skills: SkillEvidence[],
  resume: ResumeVerification | null,
): JobMatch {
  const technologyMap = new Map(technologies.map((item) => [item.name.toLowerCase(), item]));
  const skillMap = new Map(skills.map((item) => [item.skill.toLowerCase(), item]));
  const resumeMap = new Map(resume?.claims.map((item) => [item.claim.toLowerCase(), item]) ?? []);
  const matches = extractJobRequirements(jobDescription).map<JobRequirementMatch>(({ requirement, importance }) => {
    const key = requirement.toLowerCase();
    const skill = skillMap.get(key);
    const technology = technologyMap.get(key);
    const resumeClaim = resumeMap.get(key);
    if (skill && (skill.level === "Strong Evidence" || skill.level === "Good Evidence")) {
      return { requirement, importance, support: "Strong match", explanation: "Implementation evidence directly supports this requirement.", files: skill.evidence.map((item) => item.file) };
    }
    if (skill || technology || (resumeClaim && resumeClaim.support !== "No Repository Evidence")) {
      return {
        requirement,
        importance,
        support: "Partial match",
        explanation: "The available repository or résumé evidence supports part of this requirement, but not its full expected depth.",
        files: skill?.evidence.map((item) => item.file) ?? technology?.evidence.map((item) => item.split(": ")[0]).filter((path) => path !== "GitHub language statistics") ?? resumeClaim?.files ?? [],
      };
    }
    return {
      requirement,
      importance,
      support: "No repository evidence",
      explanation: "No supporting evidence was found in this repository. This is not evidence that the candidate lacks the skill.",
      files: [],
    };
  });
  const strongMatches = matches.filter((item) => item.support === "Strong match");
  const partialMatches = matches.filter((item) => item.support === "Partial match");
  const unsupportedRequirements = matches.filter((item) => item.support === "No repository evidence");
  const required = matches.filter((item) => item.importance === "required");
  const supportedRequired = required.filter((item) => item.support !== "No repository evidence").length;
  return {
    strongMatches,
    partialMatches,
    unsupportedRequirements,
    summary: required.length
      ? `${supportedRequired} of ${required.length} explicitly required skills have at least partial evidence. Review each evidence trail and unsupported requirement before making a decision.`
      : `${strongMatches.length} strong and ${partialMatches.length} partial matches were found. The description did not clearly label required skills.`,
    scoringMethod: "No opaque fit score is used. Requirements are classified independently from implementation evidence, deterministic signals, and résumé claims.",
  };
}
