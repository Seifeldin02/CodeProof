import { describe, expect, it } from "vitest";
import type { CandidateDetail } from "@/features/candidates/types";
import type { InterviewSession } from "@/features/interviews/contracts";
import type { RoleBrief } from "@/features/shortlists/evaluate";
import type { AnalysisResult, ExtractedResumeClaim } from "@/types/analysis";
import { buildCommandCenter, statedCvRole } from "./overview";

const repositoryUrl = "https://github.com/example/app";

const role: RoleBrief = {
  id: "role-1", versionId: "role-version-1", title: "Full-stack engineer",
  description: "Required: TypeScript\nRequired: React\nPreferred: PostgreSQL", taxonomyVersion: "2025.1",
  criteria: [
    { id: "c-postgres", capabilityId: "data.database.postgresql", label: "PostgreSQL", importance: "preferred" },
    { id: "c-typescript", capabilityId: "language.typescript", label: "TypeScript", importance: "required" },
    { id: "c-react", capabilityId: "web.framework.react", label: "React", importance: "required" },
  ],
  unassessedRequirements: ["5 years of experience"], createdAt: "2026-10-12T00:00:00.000Z",
};

function claims(...names: string[]): ExtractedResumeClaim[] {
  return names.map((claim) => ({ claim, category: claim.endsWith(" Engineer") ? "role" : "technology", source: "Candidate Claim" }));
}

function applicant(id: string, name: string, appliedAt: string, options: { demo?: boolean; code?: "claimed" | "verified" } = {}): CandidateDetail {
  const status = options.code === "verified" ? "verified_contributor" : "candidate_claimed";
  const analysis = {
    repository: { url: repositoryUrl },
    canonicalEvidence: {
      taxonomyVersion: "2025.1",
      findings: [{ id: "finding-1", capabilityId: "language.typescript" }],
      citations: [{
        id: "citation-1", findingId: "finding-1", repositoryUrl, repositoryName: "example/app", revision: "abc123",
        filePath: "src/app.ts", sourceLink: `${repositoryUrl}/blob/abc123/src/app.ts`, evidenceLevel: "good", attributionStatus: status,
      }],
    },
  } as unknown as AnalysisResult;
  return {
    id, name, role: "Backend Engineer", isDemo: Boolean(options.demo), appliedAt,
    repositories: options.code ? [{ repositoryUrl, attributionStatus: status }] : [],
    analyses: options.code ? [{ repositoryUrl, result: analysis }] : [],
  } as unknown as CandidateDetail;
}

function session(id: string, candidateName: string, overrides: { status?: "draft" | "completed"; followUpOn?: string | null; communicatedAt?: string | null } = {}): InterviewSession {
  return {
    id, candidateId: id, isDemo: false, revision: 1, status: overrides.status ?? "draft",
    createdAt: "2026-10-10T00:00:00.000Z", updatedAt: "2026-10-10T00:00:00.000Z", completedAt: null,
    communicatedAt: overrides.communicatedAt ?? null,
    preparation: { candidateName, roleTitle: role.title, criteria: [] },
    assessment: { ratings: [], decision: overrides.status === "completed" ? "advance" : null, rationale: "", nextAction: "", followUpOn: overrides.followUpOn ?? null, candidateMessage: "" },
  } as unknown as InterviewSession;
}

describe("recruiter command center", () => {
  it("reads the role a CV states in its headline and nothing else as a stated role", () => {
    expect(statedCvRole(claims("TypeScript", "Backend Engineer"))).toBe("Backend Engineer");
    expect(statedCvRole(claims("TypeScript"))).toBeNull();
    expect(statedCvRole([{ claim: "Led a team of four", category: "role", source: "Candidate Claim" }])).toBeNull();
  });

  it("puts applicants in review order for each role and says where each signal comes from", () => {
    const candidates = [
      applicant("a", "Ada", "2026-10-10"),
      applicant("b", "Badr", "2026-10-11", { code: "claimed" }),
      applicant("c", "Cora", "2026-10-12"),
    ];
    const resumeClaims = new Map([
      ["a", claims("TypeScript", "React", "PostgreSQL")],
      ["b", claims("TypeScript")],
    ]);
    const overview = buildCommandCenter({ candidates, roles: [role], resumeClaims, sessions: [], today: "2026-10-12" });
    const board = overview.boards[0];

    expect(board).toMatchObject({ title: "Full-stack engineer", requiredTotal: 2, needsHumanReview: 1, poolSize: 3 });
    expect(board.criteria).toEqual(["TypeScript", "React", "PostgreSQL"]);
    expect(board.leads.map((lead) => lead.candidateName)).toEqual(["Ada", "Badr"]);
    expect(board.leads[0]).toMatchObject({ signaledRequired: 2, citedRequired: 0, attributionPending: false, reported: ["PostgreSQL", "TypeScript", "React"] });
    // Code that was read but not attributed is flagged, and is never counted as verified.
    expect(board.leads[1]).toMatchObject({ signaledRequired: 1, citedRequired: 0, attributionPending: true });
  });

  it("counts verified code separately from CV claims", () => {
    const overview = buildCommandCenter({
      candidates: [applicant("v", "Vera", "2026-10-12", { code: "verified" })], roles: [role], resumeClaims: new Map(), sessions: [], today: "2026-10-12",
    });
    expect(overview.boards[0].leads[0]).toMatchObject({ signaledRequired: 1, citedRequired: 1, attributionPending: false, reported: [] });
  });

  it("leaves an applicant with no signal for a role out of its leads, without marking them down", () => {
    const overview = buildCommandCenter({
      candidates: [applicant("c", "Cora", "2026-10-12")], roles: [role], resumeClaims: new Map(), sessions: [], today: "2026-10-12",
    });
    expect(overview.boards[0].leads).toEqual([]);
    expect(overview.boards[0].poolSize).toBe(1);
    expect(overview.applicants[0]).toMatchObject({ name: "Cora", closestRole: null, hasPublicCode: false });
  });

  it("describes the pool from real applicants and keeps sample records out of it", () => {
    const candidates = [
      applicant("a", "Ada", "2026-10-10"),
      applicant("b", "Badr", "2026-10-11", { code: "claimed" }),
      applicant("s", "Sample", "2026-10-12", { demo: true, code: "claimed" }),
    ];
    const overview = buildCommandCenter({ candidates, roles: [], resumeClaims: new Map(), sessions: [], today: "2026-10-12" });
    expect(overview.demoOnly).toBe(false);
    expect(overview.pool).toEqual({ total: 2, withPublicCode: 1, cvOnly: 1, demoExcluded: 1 });
    expect(overview.applicants.map((row) => row.name)).toEqual(["Badr", "Ada"]);
  });

  it("flags a workspace that holds only sample records", () => {
    const overview = buildCommandCenter({
      candidates: [applicant("s", "Sample", "2026-10-12", { demo: true })], roles: [role], resumeClaims: new Map(), sessions: [], today: "2026-10-12",
    });
    expect(overview.demoOnly).toBe(true);
    expect(overview.pool).toEqual({ total: 1, withPublicCode: 0, cvOnly: 1, demoExcluded: 0 });
  });

  it("names the saved role an applicant's signals cover best, as a lead to explore", () => {
    const narrow: RoleBrief = { ...role, id: "role-2", title: "Database engineer", criteria: [{ id: "c-pg", capabilityId: "data.database.postgresql", label: "PostgreSQL", importance: "required" }] };
    const overview = buildCommandCenter({
      candidates: [applicant("a", "Ada", "2026-10-10")], roles: [role, narrow],
      resumeClaims: new Map([["a", claims("TypeScript", "React", "Backend Engineer")]]), sessions: [], today: "2026-10-12",
    });
    expect(overview.applicants[0]).toMatchObject({
      statedRole: "Backend Engineer", claimCount: 3,
      closestRole: { roleId: "role-1", title: "Full-stack engineer", signaledRequired: 2, requiredTotal: 2 },
    });
  });

  it("lists interviews that need action, overdue follow-ups first, and leaves finished ones out", () => {
    const sessions = [
      session("1", "Draft Dana"),
      session("2", "Late Lina", { status: "completed", followUpOn: "2026-10-01" }),
      session("3", "Told Tariq", { status: "completed", followUpOn: "2026-10-01", communicatedAt: "2026-10-02T00:00:00.000Z" }),
      session("4", "Decided Dee", { status: "completed", followUpOn: "2026-10-20" }),
    ];
    const overview = buildCommandCenter({ candidates: [], roles: [], resumeClaims: new Map(), sessions, today: "2026-10-12" });
    expect(overview.interviews).toEqual({ awaiting: 3, readyToCommunicate: 2, prepare: 1, communicate: 1, overdue: 1, done: 1 });
    expect(overview.attention.map((item) => [item.candidateName, item.state])).toEqual([
      ["Late Lina", "overdue"], ["Decided Dee", "communicate"], ["Draft Dana", "prepare"],
    ]);
  });
});
