import data from "./measurements.json";
import type { ManipulationCheckResult } from "./manipulation-checks";

/**
 * The published reliability measurement. `measurements.json` is written by
 * `npm run trust:measure`, which runs the real pipeline against public
 * repositories. Nothing in it is typed in by hand.
 */

export interface RepositoryMeasurement {
  /** `owner/name` on GitHub. */
  repository: string;
  /**
   * `measured`: every run read the same archive, so the runs can be compared.
   * `changed`: the repository changed while it was being measured.
   * `unreadable`: the archive could not be read within the safety limits.
   */
  status: "measured" | "changed" | "unreadable";
  runs: number;
  /** Whether every run produced the same evidence. Null when the runs cannot be compared. */
  identical: boolean | null;
  skills: number;
  /** Distinct file paths the analysis cited. */
  citedFiles: number;
  /** Cited paths that are not in the repository's archive. */
  missingFiles: number;
  reason: string | null;
}

export interface TrustMeasurements {
  measuredAt: string;
  engineVersion: string;
  runsPerRepository: number;
  repositories: RepositoryMeasurement[];
  checks: ManipulationCheckResult[];
}

export interface TrustSummary {
  measuredRepositories: number;
  identicalRepositories: number;
  excludedRepositories: number;
  citedFiles: number;
  missingFiles: number;
  checksPassed: number;
  checksTotal: number;
}

export const TRUST_MEASUREMENTS = data as unknown as TrustMeasurements;

export function summarizeTrust(measurements: TrustMeasurements): TrustSummary {
  const measured = measurements.repositories.filter((item) => item.status === "measured");
  return {
    measuredRepositories: measured.length,
    identicalRepositories: measured.filter((item) => item.identical === true).length,
    excludedRepositories: measurements.repositories.length - measured.length,
    citedFiles: measured.reduce((sum, item) => sum + item.citedFiles, 0),
    missingFiles: measured.reduce((sum, item) => sum + item.missingFiles, 0),
    checksPassed: measurements.checks.filter((check) => check.passed).length,
    checksTotal: measurements.checks.length,
  };
}

/** True when the measurement was taken on a different engine than the one now running. */
export function measurementIsStale(measurements: TrustMeasurements, runningEngineVersion: string): boolean {
  return measurements.engineVersion !== runningEngineVersion;
}
