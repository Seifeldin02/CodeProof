import { describe, expect, it } from "vitest";
import { CandidateStore } from "@/features/candidates/store";
import type { CandidateDetail } from "@/features/candidates/types";
import type { AnalysisResult } from "@/types/analysis";
import { compareCandidateRoleReviews, evaluateCandidateForRole, extractRoleCriteria, type RoleBrief } from "./evaluate";
import { RoleStore } from "./store";
import { CandidateResumeStore } from "./resume-store";

const repositoryUrl = "https://github.com/example/app";

function role(): RoleBrief {
  return {
    id: "role-1", versionId: "role-version-1", title: "TypeScript engineer",
    description: "TypeScript required", taxonomyVersion: "2025.1",
    criteria: [{ id: "criterion-1", capabilityId: "language.typescript", label: "TypeScript", importance: "required" }],
    unassessedRequirements: [], createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function candidate(repositoryStatus: "verified_contributor" | "candidate_claimed", citationStatus: "verified_contributor" | "candidate_claimed", level: "good" | "limited" = "good"): CandidateDetail {
  const analysis = {
    repository: { url: repositoryUrl },
    canonicalEvidence: {
      taxonomyVersion: "2025.1",
      findings: [{ id: "finding-1", capabilityId: "language.typescript" }],
      citations: [{
        id: "citation-1", findingId: "finding-1", repositoryUrl, repositoryName: "example/app",
        revision: "abc123", filePath: "src/app.ts", sourceLink: "https://github.com/example/app/blob/abc123/src/app.ts",
        evidenceLevel: level, attributionStatus: citationStatus,
      }],
    },
  } as unknown as AnalysisResult;
  return {
    id: "candidate-1", name: "Candidate", role: "Backend Engineer", isDemo: false,
    repositories: [{ repositoryUrl, attributionStatus: repositoryStatus }],
    analyses: [{ repositoryUrl, result: analysis }],
  } as unknown as CandidateDetail;
}

describe("role-scoped technical review", () => {
  it("maps only recognized technical criteria and retains other terms as unassessed", () => {
    const extracted = extractRoleCriteria("Must have TypeScript and React. 5 years of experience. Python preferred.");
    expect(extracted.criteria.map((criterion) => criterion.capabilityId)).toEqual(["language.typescript", "web.framework.react"]);
    expect(extracted.unassessedRequirements).toContain("Python");
    expect(extracted.unassessedRequirements.some((item) => item.includes("5 years"))).toBe(true);
  });

  it("keeps a requirement required when its sentence names a technology with a full stop in it", () => {
    const extracted = extractRoleCriteria("Required: TypeScript, Next.js and PostgreSQL. Preferred: React.");
    const importance = Object.fromEntries(extracted.criteria.map((criterion) => [criterion.label, criterion.importance]));
    expect(importance).toEqual({ TypeScript: "required", "Next.js": "required", PostgreSQL: "required", React: "preferred" });
  });

  it("requires both verified repository attribution and a conclusive matching citation", () => {
    expect(evaluateCandidateForRole(candidate("verified_contributor", "verified_contributor"), role()).criteria[0]).toMatchObject({
      status: "cited_evidence", citations: [{ filePath: "src/app.ts" }],
    });
    expect(evaluateCandidateForRole(candidate("candidate_claimed", "verified_contributor"), role()).criteria[0].status).toBe("attribution_pending");
    expect(evaluateCandidateForRole(candidate("verified_contributor", "candidate_claimed"), role()).criteria[0].status).toBe("attribution_pending");
    expect(evaluateCandidateForRole(candidate("verified_contributor", "verified_contributor", "limited"), role()).criteria[0].status).toBe("not_observed");
  });

  it("treats no public repository as unknown, not a negative candidate judgment", () => {
    const privateCandidate = { ...candidate("candidate_claimed", "candidate_claimed"), analyses: [], repositories: [] };
    const review = evaluateCandidateForRole(privateCandidate, role());
    expect(review.criteria[0]).toMatchObject({ status: "not_observed", citations: [] });
    expect(review.citedRequiredCount).toBe(0);
    expect(review.signaledRequiredCount).toBe(0);
  });

  it("keeps candidate-reported CV skills separate from verified code evidence", () => {
    const privateCandidate = { ...candidate("candidate_claimed", "candidate_claimed"), analyses: [], repositories: [] };
    const review = evaluateCandidateForRole(privateCandidate, {
      ...role(), unassessedRequirements: ["Python"],
    }, [
      { claim: "TypeScript", category: "technology", source: "Candidate Claim" },
      { claim: "Python", category: "technology", source: "Candidate Claim" },
    ]);
    expect(review.reportedCriteria).toEqual(["TypeScript"]);
    expect(review.reportedUnassessedRequirements).toEqual(["Python"]);
    expect(review.criteria[0].status).toBe("not_observed");
    expect(review.citedRequiredCount).toBe(0);
    expect(review.signaledRequiredCount).toBe(1);
    const codeCandidate = { ...candidate("verified_contributor", "verified_contributor"), name: "Zeta" };
    const cvCandidate = { ...privateCandidate, name: "Alpha" };
    const codeReview = evaluateCandidateForRole(codeCandidate, role());
    const cvReview = evaluateCandidateForRole(cvCandidate, role(), [{ claim: "TypeScript", category: "technology", source: "Candidate Claim" }]);
    expect([codeReview, cvReview].sort(compareCandidateRoleReviews).map((item) => item.candidateName)).toEqual(["Alpha", "Zeta"]);
  });
});

describe("saved role briefs", () => {
  it("persists a role-specific criteria snapshot and enforces tenant isolation", async () => {
    const candidates = new CandidateStore(":memory:");
    candidates.db.prepare("INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)")
      .run("owner-a", "a@example.invalid", "hash", "2026-01-01T00:00:00.000Z");
    candidates.db.prepare("INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)")
      .run("owner-b", "b@example.invalid", "hash", "2026-01-01T00:00:00.000Z");
    const store = new RoleStore(candidates.db);
    const saved = await store.create("owner-a", "Senior TypeScript engineer", "TypeScript required; Python preferred; 5 years of experience.");
    expect(saved.criteria).toMatchObject([{ capabilityId: "language.typescript", importance: "required" }]);
    expect(saved.unassessedRequirements).toContain("Python");
    expect((await store.list("owner-a")).map((item) => item.id)).toEqual([saved.id]);
    expect(await store.list("owner-b")).toEqual([]);
    expect(await store.get("owner-b", saved.id)).toBeNull();
    expect(await new RoleStore(candidates.db).get("owner-a", saved.id)).toEqual(saved);
    candidates.db.close();
  });
});

describe("candidate CV claim storage", () => {
  it("persists only extracted claims for the owner and cascades on deletion", async () => {
    const candidates = new CandidateStore(":memory:");
    for (const [id, email] of [["owner-a", "a@example.invalid"], ["owner-b", "b@example.invalid"]]) {
      candidates.db.prepare("INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)")
        .run(id, email, "hash", "2026-01-01T00:00:00.000Z");
    }
    const created = await candidates.createCandidate("owner-a", {
      name: "Private candidate", role: "Backend Engineer", results: [], intakeOnly: true,
    });
    const claims = [{ claim: "TypeScript", category: "technology" as const, source: "Candidate Claim" as const }];
    const store = new CandidateResumeStore(candidates.db);
    expect(await store.save("owner-b", created.id, claims)).toBe(false);
    expect(await store.save("owner-a", created.id, claims)).toBe(true);
    expect(await store.list("owner-b")).toEqual(new Map());
    expect(await new CandidateResumeStore(candidates.db).list("owner-a")).toEqual(new Map([[created.id, claims]]));
    await candidates.deleteCandidate("owner-a", created.id);
    expect(await store.list("owner-a")).toEqual(new Map());
    candidates.db.close();
  });
});
