import type { CanonicalAnalysisBundle, CanonicalInvariantError } from "@/features/repository-analysis/invariant-validator";
import { validateCanonicalAnalysisBundle } from "@/features/repository-analysis/invariant-validator";

export type CanonicalPersistenceEngine = "sqlite" | "postgresql";

export interface CanonicalAnalysisPersistenceTransaction {
  writeCanonicalAnalysis(bundle: CanonicalAnalysisBundle): Promise<void> | void;
}

export interface CanonicalAnalysisPersistenceAdapter {
  readonly engine: CanonicalPersistenceEngine;
  transaction<T>(
    operation: (transaction: CanonicalAnalysisPersistenceTransaction) => Promise<T>,
  ): Promise<T>;
}

export class CanonicalAnalysisRejectedError extends Error {
  readonly code = "CANONICAL_ANALYSIS_REJECTED";

  constructor(readonly validationErrors: readonly CanonicalInvariantError[]) {
    super("Canonical analysis failed pre-persistence validation.");
    this.name = "CanonicalAnalysisRejectedError";
  }
}

/**
 * The single write gate for canonical analysis bundles.
 *
 * Validation intentionally completes before either persistence adapter opens a
 * transaction. A rejected bundle therefore cannot create a partial analysis,
 * finding, citation, conclusion, projection, or metric row on either engine.
 */
export async function persistCanonicalAnalysisBundle(
  adapter: CanonicalAnalysisPersistenceAdapter,
  bundle: CanonicalAnalysisBundle,
): Promise<void> {
  const validation = validateCanonicalAnalysisBundle(bundle);
  if (!validation.eligibleForCanonicalPersistence) {
    throw new CanonicalAnalysisRejectedError(validation.errors);
  }

  await adapter.transaction(async (transaction) => {
    await transaction.writeCanonicalAnalysis(bundle);
  });
}
