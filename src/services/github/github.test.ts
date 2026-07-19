import { describe, expect, it, vi } from "vitest";
import { ARCHIVE_LIMITS, exceedsTreeLimit, FILE_LIMITS, GitHubClient, GitHubServiceError, parseGitHubRepositoryUrl } from "./index";
import { selectFileCandidates } from "./file-selection";
import type { GitHubTreeEntry } from "./types";

function crc32(buffer: Buffer): number {
  let value = 0xffffffff;
  for (const byte of buffer) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ (0xedb88320 & -(value & 1));
  }
  return (value ^ 0xffffffff) >>> 0;
}

function storedZip(files: Record<string, string>): ArrayBuffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const fileName = Buffer.from(name);
    const data = Buffer.from(content);
    const checksum = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(fileName.length, 26);
    localParts.push(local, fileName, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(fileName.length, 28); central.writeUInt32LE(offset, 42);
    centralParts.push(central, fileName);
    offset += local.length + fileName.length + data.length;
  }
  const central = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(central.length, 12); end.writeUInt32LE(offset, 16);
  const output = Buffer.concat([...localParts, central, end]);
  return output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength) as ArrayBuffer;
}

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

describe("public archive errors", () => {
  it("rejects oversized downloads before reading the response body", async () => {
    const fetcher = vi.fn(async () => new Response("archive", {
      status: 200,
      headers: { "content-length": String(ARCHIVE_LIMITS.maxCompressedBytes + 1) },
    })) as unknown as typeof fetch;
    const client = new GitHubClient(fetcher);
    await expect(client.ingest("https://github.com/example/project")).rejects.toMatchObject({
      code: "OVERSIZED_REPOSITORY",
      status: 413,
    });
  });

  it("indexes a bounded public archive without calling GitHub REST", async () => {
    const archive = storedZip({
      "project-main/package.json": JSON.stringify({ dependencies: { react: "19" } }),
      "project-main/src/index.ts": "import React from 'react';\nexport function App() { return React.createElement('main'); }\n".repeat(4),
    });
    const fetcher = vi.fn(async () => new Response(archive, { status: 200, headers: { "content-length": String(archive.byteLength) } })) as unknown as typeof fetch;
    const result = await new GitHubClient(fetcher).ingest("https://github.com/example/project");
    expect(fetcher).toHaveBeenCalledWith("https://codeload.github.com/example/project/zip/HEAD", expect.any(Object));
    expect(result.ingestionMethod).toBe("public_archive");
    expect(result.treePaths).toEqual(["package.json", "src/index.ts"]);
    expect(result.languages.TypeScript).toBeGreaterThan(0);
    expect(result.files.map((file) => file.path)).toEqual(["package.json", "src/index.ts"]);
    expect(result.metadata.stars).toBeNull();
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

  it("enforces the huge-tree safety boundary", () => {
    expect(exceedsTreeLimit(FILE_LIMITS.maxTreeEntries)).toBe(false);
    expect(exceedsTreeLimit(FILE_LIMITS.maxTreeEntries + 1)).toBe(true);
  });

  it("rejects binary and oversized candidates", () => {
    expect(selectFileCandidates([
      entry("src/photo.png"),
      entry("src/archive.zip"),
      entry("src/huge.ts", FILE_LIMITS.maxFileBytes + 1),
    ])).toEqual([]);
  });
});
