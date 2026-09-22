import { describe, expect, it } from "vitest";
import type { IngestedRepository } from "@/services/github";
import type { InterviewQuestion, SkillEvidence } from "@/types/analysis";
import { buildGroundedEvidenceBundle, reprojectGroundedEvidence } from "./grounded-citations";

function repository(content: string, ingestionMethod: IngestedRepository["ingestionMethod"] = "public_archive"): IngestedRepository {
  return {
    metadata: {
      owner: "example",
      name: "grounded",
      url: "https://github.com/example/grounded",
      description: null,
      defaultBranch: "main",
      commitSha: "0123456789abcdef0123456789abcdef01234567",
      stars: null,
      forks: null,
      openIssues: null,
      license: null,
      updatedAt: null,
      isFork: null,
    },
    languages: { TypeScript: content.length },
    files: [{
      path: "src/typed module.ts",
      size: content.length,
      sha: "file-digest",
      content,
      truncated: false,
      selectionReason: "Core source file",
    }],
    treePaths: ["src/typed module.ts"],
    treeFileCount: 1,
    treeTruncated: false,
    ingestionMethod,
  };
}

function skill(): SkillEvidence {
  return {
    skill: "TypeScript",
    level: "Good Evidence",
    explanation: "Typed implementation.",
    evidence: [{
      file: "src/typed module.ts",
      summary: "Typed implementation.",
      implementationExample: "TypeScript type boundary.",
      origin: "deterministic",
      source: "Deterministic Fact",
    }],
    origin: "deterministic",
    source: "Deterministic Fact",
  };
}

function question(value = "How does this TypeScript boundary handle invalid input?"): InterviewQuestion {
  return {
    question: value,
    relatedSkill: "TypeScript",
    difficulty: "Intermediate",
    files: ["src/typed module.ts"],
    relevance: "Grounded in the cited source.",
    origin: "deterministic",
    source: "Deterministic Fact",
  };
}

describe("grounded citation construction", () => {
  it("preserves exact bounded source context and encodes direct links", () => {
    const content = [
      "// setup",
      "export interface TypeScriptBoundary {",
      "  parse(value: unknown): string;",
      "}",
      "const ignored = true;",
      "const outside = true;",
    ].join("\n");
    const bundle = buildGroundedEvidenceBundle({
      repository: repository(content, "provider"),
      analysisVersionId: "analysis-1",
      skills: [skill()],
      questions: [question()],
      discoveryOrigin: "CV",
      attributionStatus: "verified_contributor",
    });
    const citation = bundle.citations[0];
    expect(citation).toMatchObject({
      revisionAvailability: "available",
      discoveryOrigin: "CV",
      attributionStatus: "verified_contributor",
      startLine: 2,
      endLine: 6,
    });
    expect(citation?.excerpt).toBe(content.split("\n").slice(1, 6).join("\n"));
    expect(citation?.sourceLink).toContain("/blob/0123456789abcdef0123456789abcdef01234567/src/typed%20module.ts#L2-L6");
    expect(bundle.findings[0]).toMatchObject({ detectorVersion: "1.0.0", filePath: "src/typed module.ts" });
  });

  it("does not imply an immutable Git revision for public archive digests", () => {
    const bundle = buildGroundedEvidenceBundle({
      repository: repository("export type TypeScriptValue = string;"),
      analysisVersionId: "analysis-2",
      skills: [skill()],
      questions: [question()],
    });
    expect(bundle.citations[0]).toMatchObject({ revision: null, revisionAvailability: "unavailable" });
    expect(bundle.citations[0]?.sourceLink).toContain("/blob/HEAD/");
  });

  it("omits unsafe excerpts and converts unsupported Flask HTTP context into a gap", () => {
    const content = "CREATE TABLE users (email TEXT);\n-- contact recruiter@example.invalid";
    const bundle = buildGroundedEvidenceBundle({
      repository: repository(content),
      analysisVersionId: "analysis-3",
      skills: [skill()],
      questions: [question("Trace the Flask HTTP route that uses schema.sql.")],
      attributionStatus: "candidate_claimed",
    });
    expect(bundle.citations[0]?.excerpt).toBeNull();
    expect(bundle.interviewQuestions[0]).toMatchObject({
      basis: { kind: "gap", missingCapabilityId: "framework.flask.http" },
      attributionGate: "candidate_claimed",
    });
    expect(bundle.interviewQuestions[0]?.question).toContain("No Flask HTTP route evidence");
  });

  it("neutralizes unverified authorship and restores evidence wording only after contributor proof", () => {
    const base = buildGroundedEvidenceBundle({
      repository: repository("export type TypeScriptValue = string;"),
      analysisVersionId: "analysis-4",
      skills: [skill()],
      questions: [question()],
    });
    const claimed = reprojectGroundedEvidence(base, "portfolio", "candidate_claimed");
    expect(claimed.interviewQuestions[0]?.question).toMatch(/^To verify your relationship/u);
    expect(claimed.citations[0]).toMatchObject({ discoveryOrigin: "portfolio", attributionStatus: "candidate_claimed" });
    const verified = reprojectGroundedEvidence(claimed, "portfolio", "verified_contributor");
    expect(verified.interviewQuestions[0]?.question).not.toMatch(/^To verify your relationship/u);
  });
});
