export type GitHubErrorCode =
  | "INVALID_URL"
  | "NOT_FOUND_OR_PRIVATE"
  | "EMPTY_REPOSITORY"
  | "RATE_LIMITED"
  | "OVERSIZED_REPOSITORY"
  | "NETWORK_ERROR"
  | "GITHUB_ERROR";

export class GitHubServiceError extends Error {
  constructor(
    public readonly code: GitHubErrorCode,
    message: string,
    public readonly status: number,
    public readonly retryAfter?: string,
  ) {
    super(message);
    this.name = "GitHubServiceError";
  }
}
