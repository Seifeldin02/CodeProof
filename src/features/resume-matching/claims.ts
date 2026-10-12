import type {
  ExtractedResumeClaim,
  ResumeClaimVerification,
  ResumeVerification,
  SkillEvidence,
  TechnologySignal,
} from "@/types/analysis";
import { skillsIn } from "./skills";

/** Technology claims use the skill list shared with job-brief reading, so both sides spell a skill the same way. */
const MAX_SKILL_CLAIMS = 40;
const MAX_CLAIMS = 60;

/** "Senior Backend Developer | Riyadh" and "Backend Engineer at Example" both state the role of a backend engineer. */
function headline(title: string): RegExp {
  return new RegExp(`^(?:(?:senior|junior|lead|principal|staff|associate|mid[- ]level|sr\\.?|jr\\.?)\\s+)?(?:${title})(?:\\s*(?:--|[—–|,(@-]|\\bat\\b).*)?$`, "i");
}

const CV_ROLE_HEADLINES = [
  ["Frontend Engineer", headline("front[- ]?end (?:engineer|developer)")],
  ["Backend Engineer", headline("back[- ]?end (?:engineer|developer)")],
  ["Full-Stack Engineer", headline("full[- ]?stack (?:engineer|developer)")],
  ["Data Engineer", headline("data engineer")],
  ["DevOps Engineer", headline("devops engineer|site reliability engineer|cloud engineer")],
  ["Mobile Engineer", headline("(?:mobile|android|ios|flutter|react native) (?:engineer|developer)")],
  ["QA Engineer", headline("(?:qa|test|test automation|quality assurance) engineer|sdet")],
  ["Machine Learning Engineer", headline("(?:machine learning|ml|ai) engineer")],
  ["Data Scientist", headline("data scientist")],
  ["Data Analyst", headline("(?:data|business intelligence|bi) analyst")],
  ["Software Engineer", headline("software (?:engineer|developer)|web developer|programmer")],
] as const;

const CV_ROLE_TITLES: ReadonlySet<string> = new Set(CV_ROLE_HEADLINES.map(([role]) => role));

/** The role a CV's headline states, in the candidate's favour or not. A lead to explore, never a verdict on fit. */
export function statedRoleOf(claims: ExtractedResumeClaim[]): string | null {
  return claims.find((claim) => claim.category === "role" && CV_ROLE_TITLES.has(claim.claim))?.claim ?? null;
}

export function extractResumeClaims(text: string): ExtractedResumeClaim[] {
  const claims: ExtractedResumeClaim[] = skillsIn(text).slice(0, MAX_SKILL_CLAIMS).map((claim) => ({
    claim,
    category: "technology" as const,
    source: "Candidate Claim" as const,
  }));

  // A CV headline is a candidate-stated role, not an inferred hiring fit.
  const headlineLines = text.split(/\r?\n/).slice(0, 8).map((line) => line.trim());
  for (const [role, pattern] of CV_ROLE_HEADLINES) {
    if (headlineLines.some((line) => pattern.test(line))) {
      claims.push({ claim: role, category: "role", source: "Candidate Claim" });
    }
  }

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
  return claims.filter((item, index, all) => all.findIndex((candidate) => candidate.claim.toLowerCase() === item.claim.toLowerCase()) === index).slice(0, MAX_CLAIMS);
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
