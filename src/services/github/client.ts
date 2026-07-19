import type { RepositoryMetadata, SelectedFile } from "@/types/analysis";
import { GitHubServiceError } from "./errors";
import { FILE_LIMITS, selectFileCandidates } from "./file-selection";
import type {
  GitHubCommitResponse,
  GitHubRepositoryResponse,
  GitHubTreeResponse,
} from "./types";

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
}

type FetchLike = typeof fetch;

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
  if (!repository) {
    throw new GitHubServiceError("INVALID_URL", "The GitHub repository name is missing.", 400);
  }

  return { owner: parts[0], repository, canonicalUrl: `https://github.com/${parts[0]}/${repository}` };
}

export class GitHubClient {
  constructor(
    private readonly token = process.env.GITHUB_TOKEN,
    private readonly fetcher: FetchLike = fetch,
  ) {}

  private async request<T>(path: string): Promise<T> {
    let response: Response;
    try {
      response = await this.fetcher(`https://api.github.com${path}`, {
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "CodeProof/0.1",
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        },
        signal: AbortSignal.timeout(20_000),
      });
    } catch (error) {
      throw new GitHubServiceError(
        "NETWORK_ERROR",
        error instanceof Error ? `GitHub request failed: ${error.message}` : "GitHub request failed.",
        502,
      );
    }

    if (response.ok) return (await response.json()) as T;

    const remaining = response.headers.get("x-ratelimit-remaining");
    const retryAfter = response.headers.get("retry-after");
    if (response.status === 429 || (response.status === 403 && (remaining === "0" || retryAfter))) {
      throw new GitHubServiceError(
        "RATE_LIMITED",
        "GitHub API rate limit reached. Add GITHUB_TOKEN or retry after the reset time.",
        429,
        retryAfter ?? response.headers.get("x-ratelimit-reset") ?? undefined,
      );
    }
    if (response.status === 404) {
      throw new GitHubServiceError(
        "NOT_FOUND_OR_PRIVATE",
        "Repository not found or it is not publicly accessible.",
        404,
      );
    }
    if (response.status === 409) {
      throw new GitHubServiceError("EMPTY_REPOSITORY", "The repository is empty.", 422);
    }
    throw new GitHubServiceError("GITHUB_ERROR", `GitHub returned HTTP ${response.status}.`, 502);
  }

  private async fetchRawFile(owner: string, repository: string, commitSha: string, path: string): Promise<string | null> {
    const encodedPath = path.split("/").map(encodeURIComponent).join("/");
    let response: Response;
    try {
      response = await this.fetcher(
        `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/${commitSha}/${encodedPath}`,
        { signal: AbortSignal.timeout(20_000) },
      );
    } catch {
      return null;
    }
    if (!response.ok) return null;
    return response.text();
  }

  async ingest(repositoryUrl: string): Promise<IngestedRepository> {
    const parsed = parseGitHubRepositoryUrl(repositoryUrl);
    const base = `/repos/${parsed.owner}/${parsed.repository}`;
    const repository = await this.request<GitHubRepositoryResponse>(base);
    if (repository.private) {
      throw new GitHubServiceError("NOT_FOUND_OR_PRIVATE", "Private repositories are not supported.", 404);
    }

    const commit = await this.request<GitHubCommitResponse>(
      `${base}/commits/${encodeURIComponent(repository.default_branch)}`,
    );
    const [tree, languages] = await Promise.all([
      this.request<GitHubTreeResponse>(`${base}/git/trees/${commit.commit.tree.sha}?recursive=1`),
      this.request<Record<string, number>>(`${base}/languages`),
    ]);
    const treeFiles = tree.tree.filter((entry) => entry.type === "blob");
    if (treeFiles.length === 0) {
      throw new GitHubServiceError("EMPTY_REPOSITORY", "The repository contains no files.", 422);
    }
    if (tree.tree.length > FILE_LIMITS.maxTreeEntries) {
      throw new GitHubServiceError(
        "OVERSIZED_REPOSITORY",
        `Repository tree exceeds the ${FILE_LIMITS.maxTreeEntries.toLocaleString()} entry safety limit.`,
        413,
      );
    }

    const candidates = selectFileCandidates(treeFiles);
    const files: SelectedFile[] = [];
    for (let index = 0; index < candidates.length; index += 5) {
      const batch = candidates.slice(index, index + 5);
      const contents = await Promise.all(batch.map((candidate) =>
        this.fetchRawFile(parsed.owner, parsed.repository, commit.sha, candidate.path),
      ));
      batch.forEach((candidate, batchIndex) => {
        const decoded = contents[batchIndex];
        if (decoded === null) return;
        if (decoded.includes("\u0000")) return;
        const content = decoded.slice(0, FILE_LIMITS.maxPromptCharsPerFile);
        files.push({
          path: candidate.path,
          size: candidate.size ?? decoded.length,
          sha: candidate.sha,
          content,
          truncated: decoded.length > content.length,
          selectionReason: candidate.reason,
        });
      });
    }

    return {
      metadata: {
        owner: parsed.owner,
        name: repository.name,
        url: repository.html_url,
        description: repository.description,
        defaultBranch: repository.default_branch,
        commitSha: commit.sha,
        stars: repository.stargazers_count,
        forks: repository.forks_count,
        openIssues: repository.open_issues_count,
        license: repository.license?.spdx_id ?? null,
        updatedAt: repository.updated_at,
        isFork: repository.fork,
      },
      languages,
      files,
      treePaths: treeFiles.map((entry) => entry.path),
      treeFileCount: treeFiles.length,
      treeTruncated: tree.truncated,
    };
  }
}
