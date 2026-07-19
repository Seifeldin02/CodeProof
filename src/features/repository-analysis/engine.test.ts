import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { AiAnalysisOutput, AiProvider } from "@/services/ai";
import type { IngestedRepository } from "@/services/github";
import { FileAnalysisCache, MemoryAnalysisCache } from "./cache";
import { analyzeRepository, buildAnalysisCacheKey } from "./engine";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

function fixture(commitSha = "commit-a"): IngestedRepository {
  const packageContent = JSON.stringify({ dependencies: { express: "5" }, devDependencies: { vitest: "4" } });
  return {
    metadata: {
      owner: "example", name: "service", url: "https://github.com/example/service", description: "Test service",
      defaultBranch: "main", commitSha, stars: 1, forks: 0, openIssues: 0, license: "MIT",
      updatedAt: "2026-01-01T00:00:00Z", isFork: false,
    },
    languages: { TypeScript: 10_000 },
    treePaths: ["package.json", "src/service.ts", "src/api/route.ts", "tests/service.test.ts"],
    treeFileCount: 4,
    treeTruncated: false,
    files: [
      { path: "package.json", size: packageContent.length, sha: "1", content: packageContent, truncated: false, selectionReason: "Project manifest" },
      { path: "src/service.ts", size: 900, sha: "2", content: "export class Service { async load() { return this.repository.findAll(); } }\n".repeat(12), truncated: false, selectionReason: "Service or domain logic" },
      { path: "src/api/route.ts", size: 900, sha: "3", content: "import express from 'express'; export const route = express().get('/', handler);\n".repeat(12), truncated: false, selectionReason: "Request routing or API boundary" },
      { path: "tests/service.test.ts", size: 900, sha: "4", content: "import { describe, expect, it } from 'vitest'; describe('service', () => { it('loads', () => expect(true).toBe(true)); });\n".repeat(10), truncated: false, selectionReason: "Test implementation" },
    ],
  };
}

describe("analysis caching and fallback", () => {
  it("marks deep AI sections unavailable without failing when no provider is configured", async () => {
    const result = await analyzeRepository(
      { repositoryUrl: "https://github.com/example/service" },
      { github: { ingest: async () => fixture() }, aiProvider: null, cache: false },
    );
    expect(result.metadata.aiStatus).toBe("unavailable_not_configured");
    expect(result.metadata.warnings.map((warning) => warning.code)).toContain("AI_NOT_CONFIGURED");
    expect(result.skills.length).toBeGreaterThan(0);
  });

  it("hits identical inputs and misses for CV, job, and commit changes", async () => {
    let repository = fixture();
    const source = { ingest: async () => repository };
    const cacheStore = new MemoryAnalysisCache();
    const base = { repositoryUrl: repository.metadata.url };

    expect((await analyzeRepository(base, { github: source, aiProvider: null, cacheStore })).metadata.cacheHit).toBe(false);
    expect((await analyzeRepository(base, { github: source, aiProvider: null, cacheStore })).metadata.cacheHit).toBe(true);
    expect((await analyzeRepository({ ...base, resumeText: "TypeScript" }, { github: source, aiProvider: null, cacheStore })).metadata.cacheHit).toBe(false);
    expect((await analyzeRepository({ ...base, jobDescription: "TypeScript required" }, { github: source, aiProvider: null, cacheStore })).metadata.cacheHit).toBe(false);
    repository = fixture("commit-b");
    expect((await analyzeRepository(base, { github: source, aiProvider: null, cacheStore })).metadata.cacheHit).toBe(false);
  });

  it("persists completed analyses across filesystem cache instances and respects versions", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "codeproof-cache-"));
    temporaryDirectories.push(directory);
    const repository = fixture();
    const source = { ingest: async () => repository };
    const input = { repositoryUrl: repository.metadata.url };
    await analyzeRepository(input, { github: source, aiProvider: null, cacheStore: new FileAnalysisCache(directory) });
    const persisted = await analyzeRepository(input, { github: source, aiProvider: null, cacheStore: new FileAnalysisCache(directory) });
    expect(persisted.metadata.cacheHit).toBe(true);

    const key = buildAnalysisCacheKey(repository, input, null);
    expect(await new FileAnalysisCache(directory).get(key, "older-version")).toBeUndefined();
  });

  it("returns deterministic analysis when AI output is malformed", async () => {
    const malformedProvider: AiProvider = {
      name: "Malformed",
      model: "test-model",
      analyze: async () => ({ invalid: true }) as unknown as AiAnalysisOutput,
    };
    const result = await analyzeRepository(
      { repositoryUrl: "https://github.com/example/service" },
      { github: { ingest: async () => fixture() }, aiProvider: malformedProvider, cache: false },
    );
    expect(result.metadata.aiStatus).toBe("unavailable_failed");
    expect(result.architecture.source).toBe("Deterministic Fact");
    expect(result.metadata.warnings.map((warning) => warning.code)).toContain("AI_ANALYSIS_FAILED");
  });

  it("uses strict AI-extracted candidate and job inputs when available", async () => {
    const extractionProvider: AiProvider = {
      name: "Extraction",
      model: "test-model",
      analyze: async () => { throw new Error("repository AI unavailable"); },
      extractResumeClaims: async () => [{ claim: "5 years of TypeScript", category: "experience", source: "Candidate Claim" }],
      extractJobRequirements: async () => [{ requirement: "TypeScript", importance: "required", category: "skill", source: "Job Requirement" }],
    };
    const result = await analyzeRepository(
      { repositoryUrl: "https://github.com/example/service", resumeText: "5 years of TypeScript", jobDescription: "TypeScript required" },
      { github: { ingest: async () => fixture() }, aiProvider: extractionProvider, cache: false },
    );
    expect(result.resumeVerification?.extractionMethod).toBe("ai");
    expect(result.resumeVerification?.claims[0].source).toBe("Candidate Claim");
    expect(result.jobMatch?.extractionMethod).toBe("ai");
    expect(result.jobMatch?.strongMatches[0].source).toBe("Job Requirement");
  });

  it("falls back when AI context extraction fails structured validation", async () => {
    const malformedExtraction: AiProvider = {
      name: "Malformed extraction",
      model: "test-model",
      analyze: async () => { throw new Error("repository AI unavailable"); },
      extractResumeClaims: async () => [{ claim: "TypeScript", category: "invented", source: "Candidate Claim" }] as never,
      extractJobRequirements: async () => [{ requirement: "TypeScript", importance: "must", category: "skill", source: "Job Requirement" }] as never,
    };
    const result = await analyzeRepository(
      { repositoryUrl: "https://github.com/example/service", resumeText: "TypeScript", jobDescription: "TypeScript required" },
      { github: { ingest: async () => fixture() }, aiProvider: malformedExtraction, cache: false },
    );
    expect(result.resumeVerification?.extractionMethod).toBe("deterministic");
    expect(result.jobMatch?.extractionMethod).toBe("deterministic");
    expect(result.metadata.warnings.map((warning) => warning.code)).toEqual(expect.arrayContaining([
      "AI_RESUME_EXTRACTION_FAILED",
      "AI_JOB_EXTRACTION_FAILED",
    ]));
  });
});
