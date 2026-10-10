import { describe, expect, it } from "vitest";
import { localizeAnalysisText } from "@/i18n/translations";
import type { SkillEvidence } from "@/types/analysis";
import { matchJobDescription } from "./match";

const skill = (name: string, level: SkillEvidence["level"]): SkillEvidence => ({ skill: name, level, explanation: "", evidence: [] }) as unknown as SkillEvidence;

describe("requirement verdicts in Arabic", () => {
  it("has Arabic for every sentence the matcher can write, since they are built at run time", () => {
    const skills = [skill("TypeScript", "Good Evidence"), skill("Docker", "Limited Evidence")];
    const labelled = matchJobDescription("TypeScript is required.\nDocker is required.\nMust know PostgreSQL.", [], skills, null);
    const unlabelled = matchJobDescription("We use TypeScript, Docker and PostgreSQL.", [], skills, null);

    const sentences = [labelled, unlabelled].flatMap((match) => [
      match.summary,
      match.scoringMethod,
      ...[...match.strongMatches, ...match.partialMatches, ...match.unsupportedRequirements].map((item) => item.explanation),
    ]);
    // Three kinds of explanation, two kinds of summary, one method note.
    expect(new Set(sentences).size).toBe(6);
    expect(sentences.filter((sentence) => localizeAnalysisText("ar", sentence) === sentence)).toEqual([]);
  });

  it("keeps the counts when the summary is put into Arabic", () => {
    expect(localizeAnalysisText("ar", "2 of 3 explicitly required skills have at least partial evidence. Review each evidence trail and unsupported requirement before making a decision."))
      .toBe("لدى 2 من 3 من المهارات المطلوبة صراحةً أدلة جزئية على الأقل. راجع مسار كل دليل وكل متطلب غير مدعوم قبل اتخاذ القرار.");
  });
});
