import { describe, expect, it } from "vitest";
import { translate } from "@/i18n/translations";
import { measurementIsStale, summarizeTrust, TRUST_MEASUREMENTS, type RepositoryMeasurement, type TrustMeasurements } from "./measurements";
import { CHECK_LABEL, TRUST_WORDING } from "./wording";

const repository = (overrides: Partial<RepositoryMeasurement>): RepositoryMeasurement => ({
  repository: "owner/name", status: "measured", runs: 5, identical: true, skills: 2, citedFiles: 10, missingFiles: 0, reason: null, ...overrides,
});

describe("trust measurements", () => {
  it("summarises only repositories whose runs could be compared", () => {
    const measurements: TrustMeasurements = {
      measuredAt: "2026-10-10T00:00:00.000Z",
      engineVersion: "3.2.1",
      runsPerRepository: 5,
      repositories: [
        repository({ repository: "a/one" }),
        repository({ repository: "a/two", identical: false, citedFiles: 20, missingFiles: 2 }),
        repository({ repository: "a/moved", status: "changed", identical: null, citedFiles: 30, missingFiles: 4 }),
        repository({ repository: "a/huge", status: "unreadable", identical: null, runs: 0, citedFiles: 0 }),
      ],
      checks: [{ id: "no_code_is_unknown", passed: true }, { id: "cv_wording_adds_no_evidence", passed: false }],
    };
    expect(summarizeTrust(measurements)).toEqual({
      measuredRepositories: 2,
      identicalRepositories: 1,
      excludedRepositories: 2,
      citedFiles: 30,
      missingFiles: 2,
      checksPassed: 1,
      checksTotal: 2,
    });
  });

  it("knows when the figures were measured on a different engine", () => {
    const measurements = { ...TRUST_MEASUREMENTS, engineVersion: "3.2.1" };
    expect(measurementIsStale(measurements, "3.2.1")).toBe(false);
    expect(measurementIsStale(measurements, "3.3.0")).toBe(true);
  });

  it("names every check that the recorded measurement contains, in both languages", () => {
    expect(TRUST_MEASUREMENTS.checks.filter((check) => !(check.id in CHECK_LABEL)).map((check) => check.id)).toEqual([]);
    expect(TRUST_WORDING.filter((key) => translate("ar", key) === key)).toEqual([]);
  });
});
