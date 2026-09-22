import { describe, expect, it } from "vitest";
import type { RepositoryCorpusMetrics } from "@/types/remediation";
import { projectRepositoryMetrics, reconcileRepositoryRunMetrics } from "./repository-metrics";

const metrics: RepositoryCorpusMetrics = {
  rawArchiveEntryCount: 10,
  eligibleTextFileCount: 4,
  selectedFileCount: 3,
  analyzedFileCount: 2,
  downloadedArchiveBytes: 500,
  eligibleTextBytes: 200,
  selectedTextBytes: 120,
  analyzedTextBytes: 90,
  excludedByReason: { generated_vendor_or_binary: { files: 6, bytes: 300 } },
  limits: { selectedFiles: 32, selectedBytes: 600_000 },
};

describe("repository metric projections", () => {
  it("discloses exact populations, denominators, weighting, and rounding", () => {
    expect(projectRepositoryMetrics(metrics)).toEqual([
      expect.objectContaining({ id: "selection_coverage", numerator: 3, denominator: 4, value: 75, weighting: "per_file", roundingRule: "half_up_1dp" }),
      expect.objectContaining({ id: "analysis_coverage", numerator: 2, denominator: 3, value: 66.7, weighting: "per_file", roundingRule: "half_up_1dp" }),
      expect.objectContaining({ id: "analyzed_byte_coverage", numerator: 90, denominator: 120, value: 75, weighting: "per_byte", roundingRule: "half_up_1dp" }),
    ]);
  });

  it("represents an absent denominator as unavailable instead of zero", () => {
    const [projection] = projectRepositoryMetrics({ ...metrics, eligibleTextFileCount: 0, selectedFileCount: 0 });
    expect(projection.value).toBeNull();
  });

  it("reconciles running and completed repository counts without merging attribution states", () => {
    expect(reconcileRepositoryRunMetrics("running", 4, 2, 1, {
      unverified: 1, candidate_claimed: 1, verified_owner: 1, verified_contributor: 1,
    })).toMatchObject({ pendingRepositoryCount: 1 });
    expect(reconcileRepositoryRunMetrics("completed", 4, 3, 1, {
      unverified: 1, candidate_claimed: 1, verified_owner: 1, verified_contributor: 1,
    })).toMatchObject({ pendingRepositoryCount: 0 });
    expect(() => reconcileRepositoryRunMetrics("completed", 4, 2, 1, {
      unverified: 1, candidate_claimed: 1, verified_owner: 1, verified_contributor: 1,
    })).toThrow(/pending/u);
    expect(() => reconcileRepositoryRunMetrics("completed", 4, 3, 1, {
      unverified: 0, candidate_claimed: 0, verified_owner: 0, verified_contributor: 3,
    })).toThrow(/attribution/u);
  });
});
