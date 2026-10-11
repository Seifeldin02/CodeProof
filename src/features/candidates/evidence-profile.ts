import type { EvidenceGroup, EvidenceProfile } from "@/features/hiring-analytics/types";
import type { EvidenceLevel, SkillEvidence } from "@/types/analysis";

/**
 * CodeProof does not rate people. Where a screen needs a short summary of a
 * candidate's code evidence, it shows how many distinct skills the analysed
 * code supports at each level, and says plainly when no code was read.
 */

const LEVEL_ORDER: Record<EvidenceLevel, number> = {
  "Strong Evidence": 4,
  "Good Evidence": 3,
  "Partial Evidence": 2,
  "Limited Evidence": 1,
  "Insufficient Evidence": 0,
};

export const EMPTY_EVIDENCE_PROFILE: EvidenceProfile = { strong: 0, good: 0, partial: 0, limited: 0, repositories: 0 };

type SkillLevel = Pick<SkillEvidence, "skill" | "level">;

/** Keeps each skill once, at the strongest level found across repositories. */
export function strongestSkillLevels(repositories: ReadonlyArray<ReadonlyArray<SkillLevel>>): Map<string, EvidenceLevel> {
  const strongest = new Map<string, EvidenceLevel>();
  for (const skills of repositories) {
    for (const { skill, level } of skills) {
      const current = strongest.get(skill);
      if (!current || LEVEL_ORDER[level] > LEVEL_ORDER[current]) strongest.set(skill, level);
    }
  }
  return strongest;
}

/** One entry per analysed repository; an empty list means no code was read. */
export function buildEvidenceProfile(repositories: ReadonlyArray<ReadonlyArray<SkillLevel>>): EvidenceProfile {
  const profile: EvidenceProfile = { ...EMPTY_EVIDENCE_PROFILE, repositories: repositories.length };
  for (const level of strongestSkillLevels(repositories).values()) {
    if (level === "Strong Evidence") profile.strong += 1;
    else if (level === "Good Evidence") profile.good += 1;
    else if (level === "Partial Evidence") profile.partial += 1;
    else if (level === "Limited Evidence") profile.limited += 1;
  }
  return profile;
}

export function strongOrGoodSkills(profile: EvidenceProfile): number {
  return profile.strong + profile.good;
}

export function lighterSignals(profile: EvidenceProfile): number {
  return profile.partial + profile.limited;
}

/** A category for charts. A candidate whose profile was not loaded counts as no code read. */
export function evidenceGroup(profile: EvidenceProfile | undefined): EvidenceGroup {
  if (!profile || profile.repositories === 0) return "no_code_read";
  return strongOrGoodSkills(profile) > 0 ? "strong_or_good" : "lighter_signals";
}
