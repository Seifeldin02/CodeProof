import type { TranslationValues } from "@/i18n/translations";

type Translate = (key: string, values?: TranslationValues) => string;

/** How much of a role one candidate's CV claims and verified code cover, in the words every screen uses for it. */
export function coverageText(t: Translate, coverage: { covered: number; total: number; scope: "required" | "all" }): string {
  if (coverage.total === 0) return t("The brief names no skill CodeProof recognizes. Review it manually.");
  return coverage.scope === "required"
    ? t("{count} of {total} required criteria have a CV claim or verified citation", { count: coverage.covered, total: coverage.total })
    : t("{count} of {total} role criteria have a CV claim or verified citation", { count: coverage.covered, total: coverage.total });
}

/** Months of dated work as years in half steps, so 56 months reads as 4.5. Null under a year, which is said in words. */
export function yearsOfWork(months: number): number | null {
  return months < 12 ? null : Math.floor(months / 6) / 2;
}
