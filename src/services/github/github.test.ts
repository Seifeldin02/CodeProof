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

  it("accepts a transport above the former 20 MB ceiling when analyzable content is bounded", async () => {
    const archive = storedZip({
      "project-main/pom.xml": "<project><artifactId>safe</artifactId></project>",
      "project-main/src/main/java/app/Main.java": "package app; public class Main { public static void main(String[] args) {} }",
    });
    const fetcher = vi.fn(async () => new Response(archive, {
      status: 200,
      headers: { "content-length": String(21 * 1024 * 1024) },
    })) as unknown as typeof fetch;

    const result = await new GitHubClient(fetcher).ingest("https://github.com/example/project");
    expect(result.languages.Java).toBeGreaterThan(0);
    expect(result.treePaths).toContain("src/main/java/app/Main.java");
  });

  it("filters generated Maven output before source tree and expansion limits", async () => {
    const files = Object.fromEntries([
      ...Array.from({ length: FILE_LIMITS.maxTreeEntries + 200 }, (_, index) => [
        `eco-main/target/classes/generated-${index}.class`,
        "compiled-output",
      ]),
      ["eco-main/pom.xml", "<project><artifactId>eco</artifactId></project>"],
      ["eco-main/src/main/java/app/UserDAO.java", "package app; public class UserDAO { public void find() {} }"],
    ]);
    const archive = storedZip(files);
    const fetcher = vi.fn(async () => new Response(archive, { status: 200 })) as unknown as typeof fetch;

    const result = await new GitHubClient(fetcher).ingest("https://github.com/example/eco");
    expect(result.treePaths).toEqual(["pom.xml", "src/main/java/app/UserDAO.java"]);
    expect(result.treeFileCount).toBe(2);
  });

  it.each<{ label: string; files: Record<string, string>; language: string; selected: string }>([
    {
      label: "Java/Maven",
      files: {
        "project-main/pom.xml": "<project><artifactId>api</artifactId></project>",
        "project-main/src/main/java/app/ApiController.java": "package app; public class ApiController { public void list() {} }",
      },
      language: "Java",
      selected: "pom.xml",
    },
    {
      label: "JavaScript/TypeScript",
      files: {
        "project-main/package.json": JSON.stringify({ scripts: { test: "vitest" } }),
        "project-main/src/server.ts": "export function createServer() { return { ok: true }; }",
      },
      language: "TypeScript",
      selected: "package.json",
    },
    {
      label: "Python",
      files: {
        "project-main/pyproject.toml": "[project]\nname='worker'",
        "project-main/src/worker.py": "def process_job(job):\n    return job\n",
      },
      language: "Python",
      selected: "pyproject.toml",
    },
    {
      label: "monorepo",
      files: {
        "project-main/apps/web/package.json": JSON.stringify({ dependencies: { react: "19" } }),
        "project-main/apps/web/src/App.tsx": "export function App() { return <main />; }",
        "project-main/services/api/pyproject.toml": "[project]\nname='api'",
        "project-main/services/api/main.py": "def main():\n    return True\n",
      },
      language: "TypeScript",
      selected: "apps/web/package.json",
    },
  ])("ingests $label repository layouts", async ({ files, language, selected }) => {
    const archive = storedZip(files);
    const fetcher = vi.fn(async () => new Response(archive, { status: 200 })) as unknown as typeof fetch;
    const result = await new GitHubClient(fetcher).ingest("https://github.com/example/project");
    expect(result.languages[language]).toBeGreaterThan(0);
    expect(result.files.map((file) => file.path)).toContain(selected);
  });

  it("rejects an empty repository archive with an explicit reason", async () => {
    const archive = storedZip({ "project-main/": "" });
    const fetcher = vi.fn(async () => new Response(archive, { status: 200 })) as unknown as typeof fetch;
    await expect(new GitHubClient(fetcher).ingest("https://github.com/example/empty")).rejects.toMatchObject({ code: "EMPTY_REPOSITORY" });
  });

  it("rejects genuinely oversized analyzable trees", async () => {
    const files = Object.fromEntries(Array.from({ length: FILE_LIMITS.maxTreeEntries + 1 }, (_, index) => [
      `project-main/src/module-${index}.ts`,
      `export const value${index} = ${index};`,
    ]));
    const archive = storedZip(files);
    const fetcher = vi.fn(async () => new Response(archive, { status: 200 })) as unknown as typeof fetch;
    await expect(new GitHubClient(fetcher).ingest("https://github.com/example/huge")).rejects.toMatchObject({ code: "OVERSIZED_REPOSITORY" });
  });

  it("rejects malformed ZIP data", async () => {
    const fetcher = vi.fn(async () => new Response("not-a-zip", { status: 200 })) as unknown as typeof fetch;
    await expect(new GitHubClient(fetcher).ingest("https://github.com/example/broken")).rejects.toMatchObject({ code: "INVALID_ARCHIVE" });
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
