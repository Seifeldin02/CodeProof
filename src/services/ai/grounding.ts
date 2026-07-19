import { capEvidenceLevel } from "@/features/repository-analysis/evidence-scoring";
import type { SelectedFile } from "@/types/analysis";
import type { AiAnalysisOutput } from "./provider";
import { aiAnalysisSchema } from "./schema";

export interface GroundingResult {
  output: AiAnalysisOutput;
  architectureGrounded: boolean;
  rejectedPathCount: number;
  downgradedSkillCount: number;
}

export function groundAiOutput(raw: unknown, selectedFiles: SelectedFile[]): GroundingResult {
  const validated = aiAnalysisSchema.parse(raw);
  const fileByPath = new Map(selectedFiles.map((file) => [file.path, file]));
  let rejectedPathCount = 0;
  let downgradedSkillCount = 0;
  const onlyAllowed = (paths: string[]): string[] => paths.filter((path) => {
    const valid = fileByPath.has(path);
    if (!valid) rejectedPathCount += 1;
    return valid;
  });

  const skills = validated.skills
    .map((skill) => {
      const evidence = skill.evidence.filter((item) => {
        const valid = fileByPath.has(item.file);
        if (!valid) rejectedPathCount += 1;
        return valid;
      });
      const groundedFiles = evidence.flatMap((item) => {
        const file = fileByPath.get(item.file);
        return file ? [file] : [];
      });
      const level = capEvidenceLevel(skill.level, groundedFiles);
      if (level !== skill.level) downgradedSkillCount += 1;
      return {
        ...skill,
        level,
        explanation: level === skill.level
          ? skill.explanation
          : `${skill.explanation} Evidence level was capped at ${level} by CodeProof's deterministic grounding rules.`,
        evidence,
      };
    })
    .filter((skill) => skill.evidence.length > 0 && skill.level !== "Insufficient Evidence");

  const interviewQuestions = validated.interviewQuestions
    .map((question) => ({ ...question, files: onlyAllowed(question.files) }))
    .filter((question) => question.files.length > 0);

  const importantFiles = onlyAllowed(validated.architecture.importantFiles);
  const boundaries = validated.architecture.boundaries.filter((boundary) => {
    if (!boundary.includes("/") && !boundary.includes(".")) return true;
    const valid = fileByPath.has(boundary);
    if (!valid) rejectedPathCount += 1;
    return valid;
  });
  const gaps = validated.gaps
    .map((gap) => ({ ...gap, checkedFiles: onlyAllowed(gap.checkedFiles) }))
    .filter((gap) => gap.checkedFiles.length > 0);

  return {
    output: {
      architecture: { ...validated.architecture, importantFiles, boundaries },
      skills,
      gaps,
      interviewQuestions,
    },
    architectureGrounded: importantFiles.length > 0,
    rejectedPathCount,
    downgradedSkillCount,
  };
}
