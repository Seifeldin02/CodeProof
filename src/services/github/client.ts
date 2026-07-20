import { createHash } from "node:crypto";
import type { Readable } from "node:stream";
import yauzl, { type Entry, type ZipFile } from "yauzl";
import { logger } from "@/services/observability/logger";
import type { RepositoryMetadata, SelectedFile } from "@/types/analysis";
import { GitHubServiceError } from "./errors";
import { exceedsTreeLimit, FILE_LIMITS, isEarlyExcludedArchivePath, selectFileCandidates } from "./file-selection";
import type { GitHubTreeEntry } from "./types";

export interface ParsedGitHubUrl {
  owner: string;
  repository: string;
  canonicalUrl: string;
}

export interface IngestedRepository {
  metadata: RepositoryMetadata;
  languages: Record<string, number>;
  files: SelectedFile[];
  treePaths: string[];
  treeFileCount: number;
  treeTruncated: boolean;
  ingestionMethod: "public_archive" | "provider";
}

/** Optional repository providers can implement this contract without changing the analysis engine. */
export interface RepositoryProvider {
  ingest(repositoryUrl: string): Promise<IngestedRepository>;
}

export const ARCHIVE_LIMITS = {
  downloadTimeoutMs: 20_000,
  // The full ZIP must be received before its central directory can be read;
  // codeload.github.com does not honor byte ranges. This is a transport-only
  // ceiling. Generated entries are filtered before the stricter source limits.
  maxCompressedBytes: 96 * 1024 * 1024,
  maxArchiveEntries: 25_000,
  maxDeclaredUncompressedBytes: 80 * 1024 * 1024,
} as const;

type FetchLike = typeof fetch;

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  ts: "TypeScript", tsx: "TypeScript", js: "JavaScript", jsx: "JavaScript", mjs: "JavaScript", cjs: "JavaScript",
  py: "Python", rb: "Ruby", php: "PHP", java: "Java", kt: "Kotlin", kts: "Kotlin", go: "Go", rs: "Rust",
  cs: "C#", fs: "F#", fsx: "F#", swift: "Swift", dart: "Dart", vue: "Vue", svelte: "Svelte",
  sql: "SQL", sh: "Shell", ps1: "PowerShell", html: "HTML", css: "CSS", scss: "SCSS", less: "Less",
};

export function parseGitHubRepositoryUrl(input: string): ParsedGitHubUrl {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new GitHubServiceError("INVALID_URL", "Enter a valid public GitHub repository URL.", 400);
  }

  if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "github.com") {
    throw new GitHubServiceError("INVALID_URL", "Only https://github.com/owner/repository URLs are supported.", 400);
  }

  const parts = url.pathname.replace(/\/+$/, "").split("/").filter(Boolean);
  if (parts.length !== 2 || !/^[\w.-]+$/.test(parts[0]) || !/^[\w.-]+(?:\.git)?$/.test(parts[1])) {
    throw new GitHubServiceError("INVALID_URL", "Use a repository URL in the form https://github.com/owner/repository.", 400);
  }

  const repository = parts[1].replace(/\.git$/i, "");
  if (!repository) throw new GitHubServiceError("INVALID_URL", "The GitHub repository name is missing.", 400);
  return { owner: parts[0], repository, canonicalUrl: `https://github.com/${parts[0]}/${repository}` };
}

function archiveUrl(parsed: ParsedGitHubUrl): string {
  return `https://codeload.github.com/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repository)}/zip/HEAD`;
}

async function boundedDownload(response: Response): Promise<Buffer> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > ARCHIVE_LIMITS.maxCompressedBytes) {
    throw new GitHubServiceError("OVERSIZED_REPOSITORY", "Repository archive exceeds the 96 MB transport limit.", 413);
  }
  if (!response.body) throw new GitHubServiceError("NETWORK_ERROR", "Repository archive returned no content.", 502);

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > ARCHIVE_LIMITS.maxCompressedBytes) {
        await reader.cancel();
        throw new GitHubServiceError("OVERSIZED_REPOSITORY", "Repository archive exceeds the 96 MB transport limit.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), received);
}

function openZip(buffer: Buffer): Promise<ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true, autoClose: false, decodeStrings: true, validateEntrySizes: true }, (error, zip) => {
      if (error || !zip) reject(error ?? new Error("Archive could not be opened."));
      else resolve(zip);
    });
  });
}

function safeRelativePath(fileName: string): string | null {
  const normalized = fileName.replace(/\\/g, "/");
  if (normalized.startsWith("/") || normalized.includes("../") || normalized.includes("\0")) return null;
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  return parts.slice(1).join("/");
}

function isSymbolicLink(entry: Entry): boolean {
  const mode = (entry.externalFileAttributes >>> 16) & 0xffff;
  return (mode & 0o170000) === 0o120000;
}

async function indexArchive(zip: ZipFile): Promise<Array<{ entry: Entry; path: string }>> {
  return new Promise((resolve, reject) => {
    const entries: Array<{ entry: Entry; path: string }> = [];
    let declaredBytes = 0;
    let archiveEntries = 0;
    const fail = (error: Error): void => {
      zip.close();
      reject(error);
    };
    zip.on("error", fail);
    zip.on("entry", (entry: Entry) => {
      archiveEntries += 1;
      if (archiveEntries > ARCHIVE_LIMITS.maxArchiveEntries) {
        fail(new GitHubServiceError("OVERSIZED_REPOSITORY", `Repository archive contains more than ${ARCHIVE_LIMITS.maxArchiveEntries.toLocaleString()} entries.`, 413));
        return;
      }
      const path = safeRelativePath(entry.fileName);
      if (!path || entry.fileName.endsWith("/") || isSymbolicLink(entry) || isEarlyExcludedArchivePath(path)) {
        zip.readEntry();
        return;
      }
      if (entries.length >= FILE_LIMITS.maxTreeEntries) {
        fail(new GitHubServiceError("OVERSIZED_REPOSITORY", `Repository contains more than ${FILE_LIMITS.maxTreeEntries.toLocaleString()} files.`, 413));
        return;
      }
      declaredBytes += entry.uncompressedSize;
      if (declaredBytes > ARCHIVE_LIMITS.maxDeclaredUncompressedBytes) {
        fail(new GitHubServiceError("OVERSIZED_REPOSITORY", "Analyzable repository content expands beyond the 80 MB safety limit.", 413));
        return;
      }
      entries.push({ entry, path });
      zip.readEntry();
    });
    zip.on("end", () => resolve(entries));
    zip.readEntry();
  });
}

function readEntry(zip: ZipFile, entry: Entry): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (error, stream) => {
      if (error || !stream) {
        reject(error ?? new Error("Archive entry could not be read."));
        return;
      }
      const chunks: Buffer[] = [];
      let bytes = 0;
      (stream as Readable).on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > FILE_LIMITS.maxFileBytes) {
          stream.destroy(new Error("Archive entry exceeds the per-file limit."));
          return;
        }
        chunks.push(Buffer.from(chunk));
      });
      stream.on("error", reject);
      stream.on("end", () => resolve(Buffer.concat(chunks, bytes)));
    });
  });
}

function detectLanguages(entries: Array<{ entry: Entry; path: string }>): Record<string, number> {
  const totals = new Map<string, number>();
  for (const { entry, path } of entries) {
    const extension = path.toLowerCase().split(".").pop() ?? "";
    const language = LANGUAGE_BY_EXTENSION[extension];
    if (language) totals.set(language, (totals.get(language) ?? 0) + entry.uncompressedSize);
  }
  return Object.fromEntries([...totals.entries()].sort((a, b) => b[1] - a[1]));
}

/**
 * Free public-repository provider. Downloads a bounded GitHub source archive,
 * indexes it as data, reads only selected text files, and never executes code.
 */
export class GitHubClient implements RepositoryProvider {
  constructor(private readonly fetcher: FetchLike = fetch) {}

  async ingest(repositoryUrl: string): Promise<IngestedRepository> {
    const startedAt = Date.now();
    const parsed = parseGitHubRepositoryUrl(repositoryUrl);
    logger.info("repository_archive_download_started", { owner: parsed.owner, repository: parsed.repository });

    let response: Response;
    try {
      response = await this.fetcher(archiveUrl(parsed), {
        headers: { "User-Agent": "CodeProof/1.0" },
        redirect: "follow",
        signal: AbortSignal.timeout(ARCHIVE_LIMITS.downloadTimeoutMs),
      });
    } catch (error) {
      throw new GitHubServiceError("NETWORK_ERROR", error instanceof Error ? "Repository download timed out or failed." : "Repository download failed.", 502);
    }
    if (response.status === 404) throw new GitHubServiceError("NOT_FOUND_OR_PRIVATE", "Repository was not found or is not publicly downloadable.", 404);
    if (!response.ok) throw new GitHubServiceError("GITHUB_ERROR", `Repository archive returned HTTP ${response.status}.`, 502);

    const archive = await boundedDownload(response);
    let zip: ZipFile | null = null;
    try {
      zip = await openZip(archive);
      const indexed = await indexArchive(zip);
      if (indexed.length === 0) throw new GitHubServiceError("EMPTY_REPOSITORY", "The repository archive contains no files.", 422);
      if (exceedsTreeLimit(indexed.length)) throw new GitHubServiceError("OVERSIZED_REPOSITORY", "Repository contains too many files.", 413);

      const byPath = new Map(indexed.map((item) => [item.path, item.entry]));
      const treeEntries: GitHubTreeEntry[] = indexed.map(({ entry, path }) => ({
        path,
        mode: "100644",
        type: "blob",
        sha: entry.crc32.toString(16),
        size: entry.uncompressedSize,
        url: "",
      }));
      const files: SelectedFile[] = [];
      for (const candidate of selectFileCandidates(treeEntries)) {
        const entry = byPath.get(candidate.path);
        if (!entry) continue;
        const bytes = await readEntry(zip, entry);
        if (bytes.includes(0)) continue;
        const decoded = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
        const content = decoded.slice(0, FILE_LIMITS.maxPromptCharsPerFile);
        files.push({
          path: candidate.path,
          size: entry.uncompressedSize,
          sha: createHash("sha256").update(bytes).digest("hex"),
          content,
          truncated: decoded.length > content.length,
          selectionReason: candidate.reason,
        });
      }

      const result: IngestedRepository = {
        metadata: {
          owner: parsed.owner,
          name: parsed.repository,
          url: parsed.canonicalUrl,
          description: null,
          defaultBranch: "HEAD",
          commitSha: createHash("sha256").update(archive).digest("hex"),
          stars: null,
          forks: null,
          openIssues: null,
          license: null,
          updatedAt: response.headers.get("last-modified"),
          isFork: null,
        },
        languages: detectLanguages(indexed),
        files,
        treePaths: indexed.map((item) => item.path),
        treeFileCount: indexed.length,
        treeTruncated: false,
        ingestionMethod: "public_archive",
      };
      logger.info("repository_archive_download_completed", {
        owner: parsed.owner,
        repository: parsed.repository,
        durationMs: Date.now() - startedAt,
        archiveBytes: archive.length,
        treeFileCount: result.treeFileCount,
        selectedFileCount: result.files.length,
        selectedBytes: result.files.reduce((total, file) => total + file.content.length, 0),
      });
      return result;
    } catch (error) {
      if (error instanceof GitHubServiceError) throw error;
      throw new GitHubServiceError("INVALID_ARCHIVE", "Repository archive could not be read safely.", 422);
    } finally {
      zip?.close();
    }
  }
}
