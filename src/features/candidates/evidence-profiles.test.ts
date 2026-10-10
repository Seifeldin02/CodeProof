import { afterEach, describe, expect, it } from "vitest";
import type { AnalysisResult, EvidenceLevel } from "@/types/analysis";
import { loadEvidenceProfiles, withEvidenceProfiles } from "./evidence-profiles";
import { CandidateStore, type CandidatePersistence } from "./store";

const shared = globalThis as typeof globalThis & { codeproofCandidateStore?: CandidatePersistence };

function result(repository: string, skills: Array<[string, EvidenceLevel]>): AnalysisResult {
  return {
    repository: { owner: "amina", name: repository, url: `https://github.com/amina/${repository}` },
    languages: { TypeScript: 500 },
    projectType: "Backend API",
    skills: skills.map(([skill, level]) => ({ skill, level })),
    strengths: [],
    resumeVerification: null,
    metadata: { analyzedAt: "2026-01-01T00:00:00.000Z" },
  } as unknown as AnalysisResult;
}

describe("evidence profiles for list screens", () => {
  afterEach(() => {
    (shared.codeproofCandidateStore as CandidateStore | undefined)?.db.close();
    delete shared.codeproofCandidateStore;
  });

  it("reads each candidate's profile in one owner-scoped pass", async () => {
    const store = new CandidateStore(":memory:");
    shared.codeproofCandidateStore = store;
    const withCode = await store.createCandidate("owner-a", {
      name: "With code",
      role: "Backend Engineer",
      results: [result("api", [["TypeScript", "Partial Evidence"], ["Docker", "Limited Evidence"]]), result("web", [["TypeScript", "Strong Evidence"], ["React", "Good Evidence"]])],
    });
    const noCode = await store.createCandidate("owner-a", { name: "No code", role: "Backend Engineer", results: [] });
    await store.createCandidate("owner-b", { name: "Someone else's", role: "Backend Engineer", results: [result("secret", [["Go", "Strong Evidence"]])] });

    const profiles = await loadEvidenceProfiles("owner-a");
    expect([...profiles.keys()]).toEqual([withCode.id]);
    expect(profiles.get(withCode.id)).toEqual({ strong: 1, good: 1, partial: 0, limited: 1, repositories: 2 });

    const listed = await withEvidenceProfiles("owner-a", await store.listCandidates("owner-a"));
    expect(listed.find((candidate) => candidate.id === noCode.id)?.evidence).toEqual({ strong: 0, good: 0, partial: 0, limited: 0, repositories: 0 });
    expect(listed.find((candidate) => candidate.id === withCode.id)?.evidence?.repositories).toBe(2);
  });

  it("works with a store that is not an instance of this module's class", async () => {
    // Each server bundle has its own copy of the class, so the shared store can fail `instanceof`.
    const real = new CandidateStore(":memory:");
    const created = await real.createCandidate("owner-a", { name: "Bundled", role: "Backend Engineer", results: [result("api", [["Go", "Good Evidence"]])] });
    shared.codeproofCandidateStore = { ...real, db: real.db, listCandidates: real.listCandidates.bind(real) } as unknown as CandidatePersistence;

    expect((await loadEvidenceProfiles("owner-a")).get(created.id)).toEqual({ strong: 0, good: 1, partial: 0, limited: 0, repositories: 1 });
    real.db.close();
    delete shared.codeproofCandidateStore;
  });
});
