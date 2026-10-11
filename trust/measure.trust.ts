import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { analyzeRepository } from "@/features/repository-analysis/engine";
import { ANALYSIS_ENGINE_VERSION } from "@/features/repository-analysis/version";
import { runManipulationChecks } from "@/features/trust/manipulation-checks";
import { summarizeTrust, type RepositoryMeasurement, type TrustMeasurements } from "@/features/trust/measurements";
import { GitHubClient, GitHubServiceError, type IngestedRepository } from "@/services/github";
import type { AnalysisResult } from "@/types/analysis";

/**
 * Measures what the trust page reports, on the real pipeline with AI off:
 *
 * 1. Same input, same result. Each repository is downloaded and analysed
 *    several times, and the evidence from every run is compared.
 * 2. Citations exist. Every file path an analysis cites must be in the archive
 *    it was read from.
 * 3. Attempts to move a result without changing the code.
 *
 * The outcome is written to `src/features/trust/measurements.json` whatever it
 * is, and only then asserted, so a bad result is recorded rather than hidden.
 *
 * The repositories are public projects in the languages the engine reads. They
 * stand in for candidates' repositories; nobody is being assessed.
 */

const RUNS = 5;

const REPOSITORIES = [
  "sindresorhus/is",
  "chalk/chalk",
  "sindresorhus/p-limit",
  "pmndrs/zustand",
  "vercel/swr",
  "expressjs/express",
  "pallets/flask",
  "gin-gonic/gin",
  "spring-projects/spring-petclinic",
  "laravel/laravel",
  "sinatra/sinatra",
  "BurntSushi/ripgrep",
];

const CV = "Sample Candidate\nBackend Engineer\nSkills: TypeScript, JavaScript, Python, Go, Java, PHP, Ruby, Rust, React, Express, Docker\n- Built and tested a public library used by other teams";
const REQUIREMENTS = "- TypeScript (required)\n- GitHub Actions (required)\n- PostgreSQL (preferred)\n- Docker (preferred)";
const OUTPUT = fileURLToPath(new URL("../src/features/trust/measurements.json", import.meta.url));

/** Everything a recruiter would read, without run ids, timestamps and timings. */
function evidence(result: AnalysisResult): string {
  return JSON.stringify({
    languages: result.languages,
    technologies: result.technologies,
    projectType: result.projectType,
    architecture: result.architecture,
    patterns: result.patterns,
    complexity: result.complexity,
    strengths: result.strengths,
    skills: result.skills,
    gaps: result.gaps,
    resumeVerification: result.resumeVerification,
    jobMatch: result.jobMatch,
    interviewQuestions: result.interviewQuestions,
    selectedFiles: result.selectedFiles,
  });
}

function citedPaths(result: AnalysisResult): string[] {
  const requirementMatches = result.jobMatch ? [...result.jobMatch.strongMatches, ...result.jobMatch.partialMatches, ...result.jobMatch.unsupportedRequirements] : [];
  return [...new Set([
    ...result.skills.flatMap((skill) => skill.evidence.map((item) => item.file)),
    ...result.strengths.flatMap((strength) => strength.files),
    ...result.patterns.flatMap((pattern) => pattern.files),
    ...result.interviewQuestions.flatMap((question) => question.files),
    ...result.gaps.flatMap((gap) => gap.checkedFiles),
    ...result.architecture.importantFiles,
    ...result.architecture.boundaries,
    ...(result.resumeVerification?.claims.flatMap((claim) => claim.files) ?? []),
    ...requirementMatches.flatMap((match) => match.files),
    ...result.selectedFiles.map((file) => file.path),
  ])];
}

async function measure(repository: string): Promise<RepositoryMeasurement> {
  const client = new GitHubClient();
  const runs: Array<{ result: AnalysisResult; source: IngestedRepository }> = [];
  try {
    for (let run = 0; run < RUNS; run += 1) {
      const read: { source: IngestedRepository | null } = { source: null };
      const result = await analyzeRepository(
        { repositoryUrl: `https://github.com/${repository}`, resumeText: CV, jobDescription: REQUIREMENTS },
        { aiProvider: null, cache: false, github: { ingest: async (url) => (read.source = await client.ingest(url)) } },
      );
      if (!read.source) throw new Error("The repository was not read.");
      runs.push({ result, source: read.source });
    }
  } catch (error) {
    const reason = error instanceof GitHubServiceError ? error.code : "ANALYSIS_FAILED";
    return { repository, status: "unreadable", runs: runs.length, identical: null, skills: 0, citedFiles: 0, missingFiles: 0, reason };
  }

  const [first] = runs;
  const paths = new Set(first.source.treePaths);
  const cited = citedPaths(first.result);
  const base = { repository, runs: runs.length, skills: first.result.skills.length, citedFiles: cited.length, missingFiles: cited.filter((file) => !paths.has(file)).length };
  // The archive hash stands in for a commit. If it moved, the runs read different code.
  if (new Set(runs.map((run) => run.source.metadata.commitSha)).size > 1) {
    return { ...base, status: "changed", identical: null, reason: "The repository changed between runs, so they cannot be compared." };
  }
  return { ...base, status: "measured", identical: new Set(runs.map((run) => evidence(run.result))).size === 1, reason: null };
}

it("measures repeatability, citations and resistance to manipulation, and records the result", async () => {
  const repositories: RepositoryMeasurement[] = [];
  for (const repository of REPOSITORIES) repositories.push(await measure(repository));

  const measurements: TrustMeasurements = {
    measuredAt: new Date().toISOString(),
    engineVersion: ANALYSIS_ENGINE_VERSION,
    runsPerRepository: RUNS,
    repositories,
    checks: await runManipulationChecks(),
  };
  await writeFile(OUTPUT, `${JSON.stringify(measurements, null, 2)}\n`, "utf8");

  const summary = summarizeTrust(measurements);
  console.info(JSON.stringify(summary));
  expect(summary.measuredRepositories).toBeGreaterThan(0);
  expect(summary.identicalRepositories).toBe(summary.measuredRepositories);
  expect(summary.missingFiles).toBe(0);
  expect(summary.checksPassed).toBe(summary.checksTotal);
});
