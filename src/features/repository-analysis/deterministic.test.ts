import { describe, expect, it } from "vitest";
import type { IngestedRepository } from "@/services/github";
import { detectImplementationPatterns, detectTechnologies, inferProjectType } from "./deterministic";

const repository: IngestedRepository = {
  metadata: {
    owner: "example", name: "app", url: "https://github.com/example/app", description: "Example app", defaultBranch: "main",
    commitSha: "abc", stars: 0, forks: 0, openIssues: 0, license: null, updatedAt: "2026-01-01T00:00:00Z", isFork: false,
  },
  languages: { TypeScript: 10_000, CSS: 1000 },
  treePaths: ["package.json", "pnpm-lock.yaml", "app/page.tsx", "app/api/users/route.ts", "prisma/schema.prisma", ".github/workflows/test.yml"],
  treeFileCount: 6,
    treeTruncated: false,
    ingestionMethod: "provider",
  files: [
    { path: "package.json", size: 200, sha: "1", truncated: false, selectionReason: "Project manifest", content: JSON.stringify({ dependencies: { next: "16", react: "19", zustand: "5", "@prisma/client": "6" }, devDependencies: { vitest: "4" } }) },
    { path: "app/api/users/route.ts", size: 100, sha: "2", truncated: false, selectionReason: "API boundary", content: "export async function GET() { return Response.json([]) }" },
    { path: "prisma/schema.prisma", size: 100, sha: "3", truncated: false, selectionReason: "Schema", content: "datasource db { provider = \"postgresql\" }" },
  ],
};

describe("deterministic repository analysis", () => {
  it("detects facts from manifests, selected content and tree-only path signals", () => {
    const technologies = detectTechnologies(repository);
    expect(technologies.map((item) => item.name)).toEqual(expect.arrayContaining([
      "TypeScript", "pnpm", "React", "Next.js", "Prisma", "Zustand", "Vitest", "GitHub Actions",
    ]));
    expect(inferProjectType(repository, technologies)).toBe("Full-stack application");
  });

  it("handles repositories with no manifest", () => {
    const noManifest: IngestedRepository = {
      ...repository,
      languages: { Go: 5_000 },
      treePaths: ["src/main.go"],
      treeFileCount: 1,
      files: [{ path: "src/main.go", size: 300, sha: "go", truncated: false, selectionReason: "Application entry point", content: "package main\nfunc main() { println(\"hello\") }" }],
    };
    expect(detectTechnologies(noManifest).map((item) => item.name)).toContain("Go");
    expect(inferProjectType(noManifest, detectTechnologies(noManifest))).toBe("Unclear");
  });

  it("identifies monorepos from workspace tooling without requiring a root manifest", () => {
    const monorepo: IngestedRepository = {
      ...repository,
      treePaths: ["turbo.json", "apps/web/src/app.ts", "services/api/main.py"],
      treeFileCount: 3,
    };
    expect(inferProjectType(monorepo, detectTechnologies(monorepo))).toBe("Monorepo");
  });

  it("does not treat documentation mentions as implementation patterns", () => {
    const patterns = detectImplementationPatterns({
      ...repository,
      files: [
        { path: ".github/security.md", size: 500, sha: "doc", truncated: false, selectionReason: "Authentication or security logic", content: "Report authentication and session security problems here.".repeat(8) },
        { path: "tests/api.test.ts", size: 500, sha: "test", truncated: false, selectionReason: "Test implementation", content: "describe('api', () => { test('returns data', () => expect(true).toBe(true)); });".repeat(8) },
      ],
    });
    expect(patterns.map((pattern) => pattern.name)).toContain("Automated testing");
    expect(patterns.map((pattern) => pattern.name)).not.toContain("Authentication or authorization");
    expect(patterns[0]).not.toHaveProperty("path");
  });
});
