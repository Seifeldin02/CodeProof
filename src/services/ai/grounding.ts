import type { AiAnalysisOutput } from "./provider";

export interface GroundingResult {
  output: AiAnalysisOutput;
  rejectedPathCount: number;
}

export function groundAiOutput(raw: AiAnalysisOutput, selectedPaths: string[]): GroundingResult {
  const allowed = new Set(selectedPaths);
  let rejectedPathCount = 0;
  const onlyAllowed = (paths: string[]): string[] => paths.filter((path) => {
    const valid = allowed.has(path);
    if (!valid) rejectedPathCount += 1;
    return valid;
  });

  const skills = raw.skills
    .map((skill) => ({ ...skill, evidence: skill.evidence.filter((item) => {
      const valid = allowed.has(item.file);
      if (!valid) rejectedPathCount += 1;
      return valid;
    }) }))
    .filter((skill) => skill.evidence.length > 0);

  const interviewQuestions = raw.interviewQuestions
    .map((question) => ({ ...question, files: onlyAllowed(question.files) }))
    .filter((question) => question.files.length > 0);

  return {
    output: {
      architecture: {
        ...raw.architecture,
        importantFiles: onlyAllowed(raw.architecture.importantFiles),
        boundaries: raw.architecture.boundaries.filter((boundary) => {
          if (!boundary.includes("/") && !boundary.includes(".")) return true;
          const valid = allowed.has(boundary);
          if (!valid) rejectedPathCount += 1;
          return valid;
        }),
      },
      skills,
      gaps: raw.gaps.map((gap) => ({ ...gap, checkedFiles: onlyAllowed(gap.checkedFiles) })),
      interviewQuestions,
    },
    rejectedPathCount,
  };
}
