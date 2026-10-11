import type { CvDiscovery } from "@/features/resume-matching/discovery";

/**
 * Coverage is the share of applicants whose CV names code CodeProof can read.
 * It decides whether code evidence is useful for a role at all, so it is worth
 * measuring on a batch of CVs before anything else.
 *
 * The census only counts links. It reads no repository, stores nothing, and
 * says nothing about ability or about who wrote the code.
 */

export type CoverageCategory =
  /** Names at least one public GitHub repository: readable today. */
  | "repository"
  /** Names a GitHub profile but no repository: the candidate has to say which to read. */
  | "profile_only"
  /** Names only a portfolio or another code host, which cannot be read as evidence yet. */
  | "other_source_only"
  | "no_link"
  /** No text could be extracted, for example a scanned PDF. Counted apart. */
  | "unreadable";

export const COVERAGE_CATEGORIES: CoverageCategory[] = ["repository", "profile_only", "other_source_only", "no_link", "unreadable"];

export function classifyCv(discovery: Pick<CvDiscovery, "repositories" | "profiles" | "otherSources">): Exclude<CoverageCategory, "unreadable"> {
  if (discovery.repositories.length > 0) return "repository";
  if (discovery.profiles.length > 0) return "profile_only";
  return discovery.otherSources.length > 0 ? "other_source_only" : "no_link";
}

export interface CoverageSummary {
  total: number;
  /** CVs whose text could be read. Every share below uses this as its denominator. */
  readable: number;
  counts: Record<CoverageCategory, number>;
}

export function summarizeCoverage(categories: readonly CoverageCategory[]): CoverageSummary {
  const counts: Record<CoverageCategory, number> = { repository: 0, profile_only: 0, other_source_only: 0, no_link: 0, unreadable: 0 };
  for (const category of categories) counts[category] += 1;
  return { total: categories.length, readable: categories.length - counts.unreadable, counts };
}

/** A share of the readable CVs, rounded half up to one decimal. Null when there is nothing to divide by. */
export function coverageShare(count: number, readable: number): number | null {
  return readable === 0 ? null : Math.round((count * 1000) / readable) / 10;
}
