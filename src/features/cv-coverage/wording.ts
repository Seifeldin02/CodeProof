import type { CoverageCategory } from "./census";

/** Recruiter-facing wording for the coverage check. Every string is a translation key. */

export const COVERAGE_LABEL: Record<CoverageCategory, string> = {
  repository: "Names a public repository",
  profile_only: "GitHub profile only",
  other_source_only: "Portfolio or another host only",
  no_link: "No code link",
  unreadable: "Could not be read",
};

export const COVERAGE_MEANING: Record<CoverageCategory, string> = {
  repository: "CodeProof can read this code today.",
  profile_only: "The candidate has to say which repositories to read.",
  other_source_only: "Recorded as unknown. CodeProof cannot read it yet.",
  no_link: "Unknown, not negative. Ask the candidate, or use your test.",
  unreadable: "Usually a scanned PDF. Left out of every share.",
};

/** Every key above, for the translation coverage check. */
export const COVERAGE_WORDING: string[] = [...Object.values(COVERAGE_LABEL), ...Object.values(COVERAGE_MEANING)];
