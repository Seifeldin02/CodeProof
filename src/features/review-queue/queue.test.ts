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
    // The three candidates with the same repository evidence tie, whatever their CVs say.
    expect(queue.entries.map((entry) => entry.name)).toEqual(["Checked", "No CV", "With CV", "Weaker", "Empty"]);
    expect(queue.entries.at(-1)?.tier).toBe("evidence_incomplete");
    expect(queue.summary).toMatchObject({ ready: 4, incomplete: 1, reviewed: 1, demo: 0 });
    expect(queue.requirementsSaved).toBe(true);
  });

  it("never lets the wording of a CV move a candidate up", () => {
    const code: Array<[string, Level]> = [["TypeScript", "Strong Evidence"], ["Docker", "Good Evidence"]];
    const plain = candidate("Plain", [analysis(code, resume([["TypeScript", "Supported"]]))], 0, { appliedAt: "2026-01-01" });
    const keywords = candidate("Keywords", [analysis(code, resume([["TypeScript", "Supported"], ["Docker", "Supported"], ["Kubernetes", "No Repository Evidence"], ["AWS", "No Repository Evidence"]]))], 0, { appliedAt: "2026-01-02" });
    const silent = candidate("Silent", [analysis(code, resume([]))], 0, { appliedAt: "2026-01-03" });

    const queue = buildReviewQueue([keywords, silent, plain], requirements);
    expect(queue.entries.map((entry) => entry.name)).toEqual(["Plain", "Keywords", "Silent"]);
    expect(queue.entries.map((entry) => entry.claims?.grounded)).toEqual([1, 2, 0]);
    // The CV that undersells the code is flagged, not pushed down.
    expect(queue.entries[2].undersold).toEqual(["Docker", "TypeScript"]);
    expect(queue.summary.undersold).toBe(2);
  });

  it("settles equal evidence by who was added first, never by name", () => {
    const later = candidate("Aaron", [analysis([["TypeScript", "Strong Evidence"]])], 0, { appliedAt: "2026-03-02" });
    const earlier = candidate("Zainab", [analysis([["TypeScript", "Strong Evidence"]])], 0, { appliedAt: "2026-03-01" });
    expect(buildReviewQueue([later, earlier], requirements).entries.map((entry) => entry.name)).toEqual(["Zainab", "Aaron"]);
  });

  it("drafts the next step from the evidence and never from a missing input alone", () => {
    const covered = candidate("Covered", [analysis([["TypeScript", "Strong Evidence"], ["PostgreSQL", "Good Evidence"]])]);
    const partly = candidate("Partly", [analysis([["TypeScript", "Strong Evidence"]])]);
    const elsewhere = candidate("Elsewhere", [analysis([["React", "Strong Evidence"]])]);
    const noCode = candidate("No code", []);

    const queue = buildReviewQueue([noCode, elsewhere, partly, covered], requirements);
    expect(Object.fromEntries(queue.entries.map((entry) => [entry.name, entry.nextStep]))).toEqual({
      Covered: "interview_on_evidence",
      Partly: "review_then_decide",
      Elsewhere: "test_or_verify",
      "No code": "ask_for_evidence",
    });
    expect(queue.summary.nextSteps).toEqual({ interview_on_evidence: 1, review_then_decide: 1, test_or_verify: 1, ask_for_evidence: 1 });
  });

  it("falls back to a single review tier when no requirements are saved", () => {
    const queue = buildReviewQueue([candidate("Solo", [analysis([["Go", "Strong Evidence"]])])], []);
    expect(queue.requirementsSaved).toBe(false);
    expect(queue.entries[0].tier).toBe("review");
    expect(queue.entries[0].unknowns).toContain("no_requirements");
  });
});

describe("portfolio and non-GitHub sources", () => {
  it("reports unreadable sources as an unknown rather than dropping them", () => {
    const entry = buildReviewEntry(
      candidate("Amina", [analysis([["TypeScript", "Strong Evidence"]])], 0, {
        unanalyzedSources: ["https://amina.dev", "https://gitlab.com/amina/api"],
      }),
      requirements,
    );
    expect(entry.unknowns).toContain("sources_not_analyzed");
    expect(entry.unanalyzedSources).toEqual(["https://amina.dev", "https://gitlab.com/amina/api"]);
  });

  it("never lowers a candidate who has unreadable sources", () => {
    // Amina was added first, so she wins the tie. If an unreadable source carried
    // any penalty at all she would fall to second and this assertion would fail.
    const withSources = candidate("Amina", [analysis([["TypeScript", "Strong Evidence"]])], 0, {
      unanalyzedSources: ["https://amina.dev"],
      appliedAt: "2026-01-01",
    });
    const without = candidate("Zara", [analysis([["TypeScript", "Strong Evidence"]])], 0, { appliedAt: "2026-01-02" });
    const queue = buildReviewQueue([without, withSources], requirements);
    expect(queue.entries.map((item) => item.name)).toEqual(["Amina", "Zara"]);
    expect(queue.entries[0].tier).toBe(queue.entries[1].tier);
  });

  it("leaves candidates without extra sources unchanged", () => {
    const entry = buildReviewEntry(candidate("Plain", [analysis([["TypeScript", "Strong Evidence"]])]), requirements);
    expect(entry.unknowns).not.toContain("sources_not_analyzed");
    expect(entry.unanalyzedSources).toEqual([]);
  });
});

describe("a candidate's own evidence", () => {
  const context = { requestedAt: null, confidential: false, confirmedLogins: [] as string[], otherLinks: [] as string[] };

  it("reports a waiting request as unknown and keeps the step at asking", () => {
    const entry = buildReviewEntry(candidate("Waiting", []), requirements, { ...context, requestedAt: "2026-10-09T00:00:00.000Z" });
    expect(entry.unknowns).toContain("evidence_requested");
    expect(entry.evidenceRequestedAt).toBe("2026-10-09T00:00:00.000Z");
    expect(entry.nextStep).toBe("ask_for_evidence");
  });

  it("does not ask again once the candidate has said their work is confidential", () => {
    const entry = buildReviewEntry(candidate("Private", []), requirements, { ...context, confidential: true });
    expect(entry.tier).toBe("evidence_incomplete");
    expect(entry.unknowns).toContain("work_confidential");
    expect(entry.nextStep).toBe("test_or_verify");
  });

  it("counts repositories under an account the candidate proved is theirs", () => {
    const mine = candidate("Owner", [analysis([["TypeScript", "Strong Evidence"]])]);
    expect(buildReviewEntry(mine, requirements, { ...context, confirmedLogins: ["ACME"] }).confirmedRepositories).toBe(1);
    expect(buildReviewEntry(mine, requirements, { ...context, confirmedLogins: ["someone-else"] }).confirmedRepositories).toBe(0);
    expect(buildReviewEntry(mine, requirements).confirmedRepositories).toBe(0);
  });

  it("lists links the candidate sent that cannot be read as unknown sources", () => {
    const entry = buildReviewEntry(candidate("Links", [], 0, { unanalyzedSources: ["https://amina.dev"] }), requirements, { ...context, otherLinks: ["https://gitlab.com/amina/api", "https://amina.dev"] });
    expect(entry.unanalyzedSources).toEqual(["https://amina.dev", "https://gitlab.com/amina/api"]);
    expect(entry.unknowns).toContain("sources_not_analyzed");
  });

  it("never moves a candidate because of what they sent or proved, only because of the code that was read", () => {
    const first = candidate("First", [analysis([["TypeScript", "Strong Evidence"]])], 0, { appliedAt: "2026-01-01" });
    const second = candidate("Second", [analysis([["TypeScript", "Strong Evidence"]])], 0, { appliedAt: "2026-01-02" });
    const queue = buildReviewQueue([second, first], requirements, new Map([
      ["second", { requestedAt: null, confidential: false, confirmedLogins: ["acme"], otherLinks: ["https://gitlab.com/x/y"] }],
    ]));
    expect(queue.entries.map((entry) => entry.name)).toEqual(["First", "Second"]);
    expect(queue.entries[1].confirmedRepositories).toBe(1);
  });
});
