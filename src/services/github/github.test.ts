import { describe, expect, it, vi } from "vitest";
import { GitHubClient, GitHubServiceError, parseGitHubRepositoryUrl } from "./index";
import { selectFileCandidates } from "./file-selection";
import type { GitHubTreeEntry } from "./types";

describe("parseGitHubRepositoryUrl", () => {
  it.each([
    ["https://github.com/openai/openai-node", "openai", "openai-node"],
    ["https://github.com/openai/openai-node/", "openai", "openai-node"],
    ["https://github.com/openai/openai-node.git", "openai", "openai-node"],
  ])("normalizes %s", (url, owner, repository) => {
    expect(parseGitHubRepositoryUrl(url)).toEqual({
      owner,
      repository,
      canonicalUrl: `https://github.com/${owner}/${repository}`,
    });
  });

  it.each([
    "not a url",
    "http://github.com/openai/openai-node",
    "https://gitlab.com/openai/openai-node",
    "https://github.com/openai",
    "https://github.com/openai/openai-node/issues",
  ])("rejects unsupported input %s", (url) => {
    expect(() => parseGitHubRepositoryUrl(url)).toThrow(GitHubServiceError);
  });
});

describe("GitHubClient errors", () => {
  it("maps rate limit responses to an actionable error", async () => {
    const fetcher = vi.fn(async () => new Response("{}", {
      status: 403,
      headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "12345" },
    })) as unknown as typeof fetch;
    const client = new GitHubClient(undefined, fetcher);
    await expect(client.ingest("https://github.com/example/project")).rejects.toMatchObject({
      code: "RATE_LIMITED",
      status: 429,
      retryAfter: "12345",
    });
  });
});

describe("selectFileCandidates", () => {
  const entry = (path: string, size = 1000): GitHubTreeEntry => ({ path, size, sha: path, mode: "100644", type: "blob", url: path });

  it("prioritizes manifests and source boundaries while excluding generated and binary content", () => {
    const selected = selectFileCandidates([
      entry("package.json"),
      entry("src/services/users.ts"),
      entry("Dockerfile"),
      entry("package-lock.json", 20_000),
      entry("dist/app.js"),
      entry("assets/logo.png"),
      entry("src/app.ts", 100_000),
    ]);
    expect(selected.map((item) => item.path)).toEqual(["package.json", "Dockerfile", "src/services/users.ts"]);
  });
});
