export interface GitHubRepositoryResponse {
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  default_branch: string;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  license: { spdx_id: string } | null;
  updated_at: string;
  fork: boolean;
  private: boolean;
}

export interface GitHubCommitResponse {
  sha: string;
  commit: { tree: { sha: string } };
}

export interface GitHubTreeEntry {
  path: string;
  mode: string;
  type: "blob" | "tree" | "commit";
  sha: string;
  size?: number;
  url: string;
}

export interface GitHubTreeResponse {
  sha: string;
  truncated: boolean;
  tree: GitHubTreeEntry[];
}

export interface GitHubBlobResponse {
  content: string;
  encoding: "base64" | string;
  size: number;
  sha: string;
}
