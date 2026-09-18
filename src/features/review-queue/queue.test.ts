import { describe, expect, it } from "vitest";
import type { CandidateDetail } from "@/features/candidates/types";
import type { AnalysisResult, ExtractedJobRequirement, ResumeVerification } from "@/types/analysis";
import { buildReviewEntry, buildReviewQueue } from "./queue";

type Level = AnalysisResult["skills"][number]["level"];

function analysis(skills: Array<[string, Level]>, resume: ResumeVerification | null = null): CandidateDetail["analyses"][number] {
  const result = {
    repository: { owner: "acme", name: "app", url: "https://github.com/acme/app" },
    languages: { TypeScript: 100 },
    technologies: [],
    skills: skills.map(([skill, level]) => ({ skill, level, explanation: "", evidence: [{ file: `src/${skill.toLowerCase()}.ts` }] })),
    resumeVerification: resume,
    jobMatch: null,
  } as unknown as AnalysisResult;
  return { id: "a1", candidateId: "c", repositoryUrl: result.repository.url, repositoryName: "acme/app", primaryLanguage: "TypeScript", projectType: "Backend API", evidenceIndex: 50, summary: "", analyzedAt: "2026-01-01T00:00:00.000Z", result };
}

function candidate(name: string, analyses: CandidateDetail["analyses"], failed = 0, extra: Partial<CandidateDetail> = {}): CandidateDetail {
  return {
    id: name.toLowerCase(),
    name,
    role: "Backend Engineer",
    source: "CodeProof",
    verifiedSkillScore: 0,
    appliedAt: "2026-01-01",
    outcome: "in_progress",
    furthestStage: "code_review",
    stageHistory: [],
    analyses,
    repositoryOutcomes: [
      ...analyses.map((item) => ({ id: item.id, candidateId: item.candidateId, repositoryUrl: item.repositoryUrl, repositoryName: item.repositoryName, status: "analyzed" as const, code: null, message: null, updatedAt: item.analyzedAt })),
      ...Array.from({ length: failed }, (_, index) => ({ id: `f${index}`, candidateId: name, repositoryUrl: `https://github.com/acme/broken-${index}`, repositoryName: `acme/broken-${index}`, status: "failed" as const, code: "EMPTY", message: "Empty.", updatedAt: "2026-01-01" })),
    ],
    ...extra,
  };
}

function resume(claims: Array<[string, ResumeVerification["claims"][number]["support"]]>): ResumeVerification {
  return { claims: claims.map(([claim, support]) => ({ claim, category: "technology", support, explanation: "", files: [], source: "Candidate Claim" })), disclaimer: "", extractionMethod: "deterministic" };
}

const requirements: ExtractedJobRequirement[] = [
  { requirement: "TypeScript", importance: "required", category: "skill", source: "Job Requirement" },
  { requirement: "PostgreSQL", importance: "required", category: "skill", source: "Job Requirement" },
  { requirement: "Docker", importance: "preferred", category: "skill", source: "Job Requirement" },
];

describe("review queue", () => {
  it("labels every missing input as unknown instead of scoring it", () => {
    const entry = buildReviewEntry(candidate("Nobody", [], 1), []);
    expect(entry.tier).toBe("evidence_incomplete");
    expect(entry.requirements).toBeNull();
    expect(entry.claims).toBeNull();
    expect(entry.unknowns).toEqual(["no_repositories", "failed_repositories", "no_cv", "no_requirements"]);
  });

  it("judges role fit against today's requirements with the deterministic matcher", () => {
    const entry = buildReviewEntry(candidate("Fit", [analysis([["TypeScript", "Strong Evidence"], ["PostgreSQL", "Partial Evidence"]])]), requirements);
    expect(entry.requirements).toEqual({ judged: 2, strong: 1, partial: 1, unsupported: 0, unsupportedNames: [] });
    expect(entry.tier).toBe("review_first");
    expect(entry.unknowns).toEqual(["no_cv"]);
  });

  it("sends candidates with no evidence for any required requirement to interview verification", () => {
    const entry = buildReviewEntry(candidate("Elsewhere", [analysis([["React", "Strong Evidence"]])]), requirements);
    expect(entry.requirements).toMatchObject({ judged: 2, strong: 0, partial: 0, unsupported: 2, unsupportedNames: ["TypeScript", "PostgreSQL"] });
    expect(entry.tier).toBe("verify_in_interview");
  });

  it("surfaces skills the CV undersells and claims still to verify", () => {
    const entry = buildReviewEntry(
      candidate("Modest", [analysis([["Docker", "Good Evidence"], ["TypeScript", "Strong Evidence"]], resume([["TypeScript", "Supported"], ["Kubernetes", "No Repository Evidence"]]))]),
      [],
    );
    expect(entry.claims).toEqual({ grounded: 1, unverified: 1 });
    expect(entry.undersold).toEqual(["Docker"]);
    expect(entry.citedFiles).toEqual(["src/docker.ts", "src/typescript.ts"]);
  });

  it("orders by evidence and never lets an unknown input demote a candidate below a peer with less evidence", () => {
    const withCv = candidate("With CV", [analysis([["TypeScript", "Strong Evidence"]], resume([["TypeScript", "Supported"]]))]);
    const noCv = candidate("No CV", [analysis([["TypeScript", "Strong Evidence"]])]);
    const weaker = candidate("Weaker", [analysis([["TypeScript", "Limited Evidence"]], resume([["Go", "No Repository Evidence"]]))]);
    const empty = candidate("Empty", []);
    const reviewed = candidate("Checked", [analysis([["TypeScript", "Strong Evidence"]])], 0, { evidenceReviewedAt: "2026-02-01T00:00:00.000Z" });

    const queue = buildReviewQueue([empty, weaker, noCv, withCv, reviewed], requirements);
    expect(queue.entries.map((entry) => entry.name)).toEqual(["With CV", "Checked", "No CV", "Weaker", "Empty"]);
    expect(queue.entries.at(-1)?.tier).toBe("evidence_incomplete");
    expect(queue.summary).toEqual({ ready: 4, incomplete: 1, reviewed: 1, demo: 0 });
    expect(queue.requirementsSaved).toBe(true);
  });

  it("falls back to a single review tier when no requirements are saved", () => {
    const queue = buildReviewQueue([candidate("Solo", [analysis([["Go", "Strong Evidence"]])])], []);
    expect(queue.requirementsSaved).toBe(false);
    expect(queue.entries[0].tier).toBe("review");
    expect(queue.entries[0].unknowns).toContain("no_requirements");
  });
});
