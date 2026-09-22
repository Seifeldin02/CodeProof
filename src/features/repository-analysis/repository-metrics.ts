import type { RepositoryMetricProjection } from "@/types/analysis";
import type { AttributionCounts, RepositoryCorpusMetrics, RepositoryRunMetrics } from "@/types/remediation";

function ratioPercent(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return Math.round((numerator * 1_000) / denominator) / 10;
}

export function projectRepositoryMetrics(metrics: RepositoryCorpusMetrics): RepositoryMetricProjection[] {
  const projections: Array<Omit<RepositoryMetricProjection, "value" | "roundingRule" | "attributionFilter">> = [
    {
      id: "selection_coverage",
      stage: "selection",
      eligiblePopulation: "eligible text files after safety and type exclusions",
      weighting: "per_file",
      numerator: metrics.selectedFileCount,
      denominator: metrics.eligibleTextFileCount,
    },
    {
      id: "analysis_coverage",
      stage: "analysis",
      eligiblePopulation: "selected files",
      weighting: "per_file",
      numerator: metrics.analyzedFileCount,
      denominator: metrics.selectedFileCount,
    },
    {
      id: "analyzed_byte_coverage",
      stage: "analysis",
      eligiblePopulation: "selected text bytes",
      weighting: "per_byte",
      numerator: metrics.analyzedTextBytes,
      denominator: metrics.selectedTextBytes,
    },
  ];
  return projections.map((projection) => ({
    ...projection,
    attributionFilter: "all_ingested_repository_content",
    value: ratioPercent(projection.numerator, projection.denominator),
    roundingRule: "half_up_1dp",
  }));
}

export function reconcileRepositoryRunMetrics(
  state: RepositoryRunMetrics["state"],
  selectedRepositoryCount: number,
  successfulRepositoryCount: number,
  failedRepositoryCount: number,
  attributionCounts: AttributionCounts,
): RepositoryRunMetrics {
  const completed = successfulRepositoryCount + failedRepositoryCount;
  if (completed > selectedRepositoryCount) throw new Error("Repository run completed count exceeds its selected count.");
  const pendingRepositoryCount = selectedRepositoryCount - completed;
  if (state === "completed" && pendingRepositoryCount !== 0) throw new Error("A completed repository run cannot contain pending repositories.");
  const attributionTotal = Object.values(attributionCounts).reduce((total, count) => total + count, 0);
  if (attributionTotal !== selectedRepositoryCount) throw new Error("Repository attribution counts do not reconcile with selected repositories.");
  return {
    state,
    selectedRepositoryCount,
    successfulRepositoryCount,
    failedRepositoryCount,
    pendingRepositoryCount,
    attributionCounts,
  };
}
