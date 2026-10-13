import { describe, expect, it } from "vitest";
import { CandidateStore } from "@/features/candidates/store";
import type { CandidateDetail } from "@/features/candidates/types";
import type { AnalysisResult } from "@/types/analysis";
import { compareCandidateRoleReviews, compareRoleCoverage, evaluateCandidateForRole, extractRoleCriteria, reviewCoverage, sameReviewPriority, type RoleBrief } from "./evaluate";
import { RoleStore } from "./store";
import { CandidateResumeStore } from "./resume-store";

const repositoryUrl = "https://github.com/example/app";

function role(): RoleBrief {
  return {
    id: "role-1", versionId: "role-version-1", title: "TypeScript engineer",
    description: "TypeScript required", taxonomyVersion: "2025.1",
    criteria: [{ id: "criterion-1", capabilityId: "language.typescript", label: "TypeScript", importance: "required" }],
    unassessedRequirements: [], minimumYears: null, createdAt: "2026-01-01T00:00:00.000Z",
  };
}

/** A role as the store returns it: every skill the brief names, with a code check where one exists. */
function roleFrom(description: string): RoleBrief {
  const read = extractRoleCriteria(description);
  return {
    ...role(), description, minimumYears: read.minimumYears, unassessedRequirements: read.unassessedRequirements,
    criteria: read.criteria.map((criterion) => ({ ...criterion, id: criterion.label })),
  };
}

function applicant(name = "Candidate"): CandidateDetail {
  return { ...candidate("candidate_claimed", "candidate_claimed"), name, analyses: [], repositories: [] };
}

function skills(...names: string[]) {
  return names.map((claim) => ({ claim, category: "technology" as const, source: "Candidate Claim" as const }));
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
  it("makes every skill the brief names a criterion, and says which ones code can also be checked for", () => {
    const extracted = extractRoleCriteria("Must have TypeScript and React. 5 years of experience. Python preferred.");
    expect(extracted.criteria).toEqual([
      { capabilityId: "language.typescript", label: "TypeScript", importance: "required" },
      { capabilityId: "web.framework.react", label: "React", importance: "required" },
      { capabilityId: null, label: "Python", importance: "preferred" },
    ]);
    expect(extracted.unassessedRequirements).toEqual(["5 years of experience"]);
    expect(extracted.minimumYears).toBe(5);
  });

  it("names one criterion for a skill the brief writes in two ways", () => {
    const extracted = extractRoleCriteria("Required: ReactJS and Postgres.\nWe use React and PostgreSQL every day.");
    expect(extracted.criteria.map((criterion) => [criterion.label, criterion.importance])).toEqual([["React", "required"], ["PostgreSQL", "required"]]);
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
    expect([codeReview, cvReview].sort(compareCandidateRoleReviews).map((item) => item.candidateName)).toEqual(["Zeta", "Alpha"]);
    expect(sameReviewPriority(codeReview, cvReview)).toBe(false);
  });
});

describe("role review from what a CV states", () => {
  const brief = roleFrom("Requirements:\n- Python\n- PostgreSQL\n- Docker\nNice to have:\n- AWS");

  it("counts a skill the CV names even where no code check exists, and says so", () => {
    const review = evaluateCandidateForRole(applicant(), brief, skills("Python", "Docker", "AWS"));
    expect(review.criteria.map((item) => [item.criterion.label, item.status, item.statedAs])).toEqual([
      ["Python", "not_checkable", ["Python"]],
      ["PostgreSQL", "not_observed", []],
      ["Docker", "not_checkable", ["Docker"]],
      ["AWS", "not_checkable", ["AWS"]],
    ]);
    expect(review).toMatchObject({ requiredCount: 3, signaledRequiredCount: 2, signaledCriterionCount: 3, citedRequiredCount: 0 });
    expect(reviewCoverage(review)).toEqual({ covered: 2, total: 3, scope: "required" });
  });

  it("covers a skill through one that cannot be used without it, in the CV's own words", () => {
    const review = evaluateCandidateForRole(applicant(), brief, skills("Django", "Postgres"));
    const stated = Object.fromEntries(review.criteria.map((item) => [item.criterion.label, item.statedAs]));
    expect(stated.Python).toEqual(["Django"]);
    // "Postgres" is not a listed spelling, so the claim is read like any other text.
    expect(stated.PostgreSQL).toEqual(["PostgreSQL"]);
    expect(review.signaledRequiredCount).toBe(2);
  });

  it("reads the skills named in a sentence or a dated entry of the CV", () => {
    const review = evaluateCandidateForRole(applicant(), brief, [
      { claim: "Built billing services in Python on AWS", category: "engineering", source: "Candidate Claim" },
      { claim: "Docker and Kubernetes platform engineer, Example Co", category: "experience", source: "Candidate Claim", period: { start: "2021-03", end: null, kind: "work" } },
    ]);
    expect(review.reportedCriteria).toEqual(["Python", "Docker", "AWS"]);
  });

  it("orders the pool by the required skills each CV states", () => {
    const reviews = [
      evaluateCandidateForRole(applicant("None"), brief, skills("Java")),
      evaluateCandidateForRole(applicant("Two"), brief, skills("Python", "Docker")),
      evaluateCandidateForRole(applicant("Preferred only"), brief, skills("AWS")),
      evaluateCandidateForRole(applicant("All"), brief, skills("Python", "PostgreSQL", "Docker")),
    ];
    expect(reviews.sort(compareCandidateRoleReviews).map((item) => item.candidateName)).toEqual(["All", "Two", "Preferred only", "None"]);
  });

  it("gives equal review priority to equal evidence regardless of name or CV dates", () => {
    const first = evaluateCandidateForRole(applicant("Amal"), brief, skills("Python", "Docker"));
    const second = evaluateCandidateForRole(applicant("Ziad"), brief, skills("Python", "Docker"));
    expect(sameReviewPriority(first, second)).toBe(true);
    expect(compareCandidateRoleReviews(first, second)).toBeLessThan(0); // Stable display order only.
  });

  it("counts against every criterion when the brief marks none as required", () => {
    const loose = roleFrom("React developer with TypeScript and Node.js");
    const review = evaluateCandidateForRole(applicant(), loose, skills("React", "Node.js"));
    expect(review.requiredCount).toBe(0);
    expect(reviewCoverage(review)).toEqual({ covered: 2, total: 3, scope: "all" });
    const none = evaluateCandidateForRole(applicant(), roleFrom("We need someone reliable and kind."), skills("React"));
    expect(reviewCoverage(none)).toEqual({ covered: 0, total: 0, scope: "all" });
  });

  it("orders the roles one candidate could be looked at for by the share each one covers", () => {
    const narrow = roleFrom("Required: Python");
    const claims = skills("Python", "Docker");
    const wide = evaluateCandidateForRole(applicant(), brief, claims);
    const exact = evaluateCandidateForRole(applicant(), narrow, claims);
    expect(compareRoleCoverage(wide, exact)).toBeGreaterThan(0);
    expect(compareRoleCoverage(exact, wide)).toBeLessThan(0);
  });

  it("adds up the dated work on the CV without letting it change the order", () => {
    const dated = [
      ...skills("Python"),
      { claim: "Engineer, Example Co", category: "experience" as const, source: "Candidate Claim" as const, period: { start: "2019-01", end: "2021-12", kind: "work" as const } },
      { claim: "Engineer, Other Co", category: "experience" as const, source: "Candidate Claim" as const, period: { start: "2021-07", end: null, kind: "work" as const } },
      { claim: "B.Sc. Computer Science", category: "experience" as const, source: "Candidate Claim" as const, period: { start: "2014", end: "2018", kind: "education" as const } },
    ];
    const withDates = evaluateCandidateForRole(applicant("Dated"), brief, dated, "2026-10-12");
    const withoutDates = evaluateCandidateForRole(applicant("Undated"), brief, skills("Python"), "2026-10-12");
    // January 2019 to October 2026 with the overlap counted once; the degree is not work.
    expect(withDates.statedWorkMonths).toBe(94);
    expect(withoutDates.statedWorkMonths).toBeNull();
    expect(compareCandidateRoleReviews({ ...withDates, candidateName: "Undated" }, withoutDates)).toBe(0);
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
    expect(saved.criteria).toMatchObject([
      { capabilityId: "language.typescript", label: "TypeScript", importance: "required" },
      { id: "skill:python", capabilityId: null, label: "Python", importance: "preferred" },
    ]);
    expect(saved.unassessedRequirements).toEqual(["5 years of experience"]);
    expect(saved.minimumYears).toBe(5);
    // Only the criteria that can be checked against code are part of the saved snapshot.
    const snapshot = candidates.db.prepare("SELECT criteria_json FROM requisition_versions WHERE id = ?").get(saved.versionId) as { criteria_json: string };
    expect(JSON.parse(snapshot.criteria_json)).toMatchObject([{ capabilityId: "language.typescript", importance: "required" }]);
    expect((await store.list("owner-a")).map((item) => item.id)).toEqual([saved.id]);
    expect(await store.list("owner-b")).toEqual([]);
    expect(await store.get("owner-b", saved.id)).toBeNull();
    expect(await new RoleStore(candidates.db).get("owner-a", saved.id)).toEqual(saved);
    candidates.db.close();
  });

  it("reads a role saved before a skill was listed without it having to be saved again", async () => {
    const candidates = new CandidateStore(":memory:");
    candidates.db.prepare("INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)")
      .run("owner-a", "a@example.invalid", "hash", "2026-01-01T00:00:00.000Z");
    const store = new RoleStore(candidates.db);
    const saved = await store.create("owner-a", "Backend engineer", "Required: Python, Flask and PostgreSQL. 3+ years of experience.");
    // What an earlier release stored for the same brief: PostgreSQL only, read less firmly, and every other skill as a term for a person.
    const postgres = saved.criteria.find((criterion) => criterion.label === "PostgreSQL");
    candidates.db.prepare("UPDATE requisition_versions SET criteria_json = ? WHERE id = ?")
      .run(JSON.stringify([{ id: postgres?.id, capabilityId: postgres?.capabilityId, importance: "context" }]), saved.versionId);
    candidates.db.prepare("UPDATE role_brief_versions SET unassessed_requirements_json = ? WHERE requisition_version_id = ?")
      .run(JSON.stringify(["Python", "3+ years of experience"]), saved.versionId);

    const read = await new RoleStore(candidates.db).get("owner-a", saved.id);
    // The brief's own order, with one reading deciding how firmly each skill is asked for.
    expect(read?.criteria.map((criterion) => [criterion.label, criterion.capabilityId, criterion.importance])).toEqual([
      ["Python", null, "required"],
      ["Flask", "web.framework.flask", "required"],
      ["PostgreSQL", "data.database.postgresql", "required"],
    ]);
    expect(read?.criteria.map((criterion) => criterion.id)).toEqual(["skill:python", "capability:web.framework.flask", postgres?.id]);
    expect(read?.unassessedRequirements).toEqual(["3+ years of experience"]);
    expect(read?.minimumYears).toBe(3);
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
