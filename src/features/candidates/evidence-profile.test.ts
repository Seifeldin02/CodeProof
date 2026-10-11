import { describe, expect, it } from "vitest";
import type { EvidenceLevel } from "@/types/analysis";
import { buildEvidenceProfile, evidenceGroup, lighterSignals, strongOrGoodSkills } from "./evidence-profile";

const skills = (...items: Array<[string, EvidenceLevel]>) => items.map(([skill, level]) => ({ skill, level }));

describe("evidence profile", () => {
  it("counts each skill once, at the strongest level found across repositories", () => {
    const profile = buildEvidenceProfile([
      skills(["TypeScript", "Partial Evidence"], ["Docker", "Limited Evidence"]),
      skills(["TypeScript", "Strong Evidence"], ["React", "Good Evidence"]),
    ]);
    expect(profile).toEqual({ strong: 1, good: 1, partial: 0, limited: 1, repositories: 2 });
    expect(strongOrGoodSkills(profile)).toBe(2);
    expect(lighterSignals(profile)).toBe(1);
  });

  it("keeps no code read apart from code that showed only lighter signals", () => {
    expect(evidenceGroup(buildEvidenceProfile([]))).toBe("no_code_read");
    expect(evidenceGroup(undefined)).toBe("no_code_read");
    expect(evidenceGroup(buildEvidenceProfile([skills(["Docker", "Limited Evidence"])]))).toBe("lighter_signals");
    expect(evidenceGroup(buildEvidenceProfile([[]]))).toBe("lighter_signals");
    expect(evidenceGroup(buildEvidenceProfile([skills(["Go", "Good Evidence"])]))).toBe("strong_or_good");
  });

  it("does not count a skill whose evidence was insufficient", () => {
    expect(buildEvidenceProfile([skills(["Rust", "Insufficient Evidence"])])).toEqual({ strong: 0, good: 0, partial: 0, limited: 0, repositories: 1 });
  });
});
