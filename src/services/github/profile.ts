import { z } from "zod";
import type { DiscoveredRepository } from "@/features/resume-matching/discovery";

/**
 * Lists the public projects on a GitHub profile, so that a recruiter holding a CV with only a profile link can pick
 * which projects to inspect instead of hunting for their addresses.
 *
 * This is a convenience on top of the free core flow and never a dependency of it. Both sources below cost nothing and
 * need no token; GitHub may refuse either at any time (the unauthenticated limit is counted per address, and a hosted
 * deployment shares its address with others). When both are refused the caller says so and the recruiter pastes
 * repository links exactly as before. Nothing here reads source code: that happens only after the recruiter confirms.
 */
export const PROFILE_LIMITS = {
  timeoutMs: 8_000,
  /** How many projects are offered. A recruiter chooses at most three, so a longer list only adds scrolling. */
  maxRepositories: 12,
  maxPageBytes: 2 * 1024 * 1024,
} as const;

export type ProfileListingCode = "INVALID_PROFILE" | "PROFILE_NOT_FOUND" | "LISTING_UNAVAILABLE";

export class ProfileListingError extends Error {
  constructor(readonly code: ProfileListingCode, message: string, readonly status: number) {
    super(message);
    this.name = "ProfileListingError";
  }
}

export interface ProfileProject extends DiscoveredRepository {
  description: string | null;
  language: string | null;
  pushedAt: string | null;
}

export interface ProfileListing {
  owner: string;
  url: string;
  repositories: ProfileProject[];
  /** True when the profile holds more projects than were returned. */
  more: boolean;
  source: "api" | "page";
}

/** GitHub account names: letters, digits and single hyphens, never at either end, at most 39 characters. */
const LOGIN = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;
const REPOSITORY = /^[\w.-]{1,100}$/;
/** First path segments that belong to GitHub itself, not to an account. */
const RESERVED = new Set(["about", "apps", "collections", "customer-stories", "enterprise", "events", "explore", "features", "login", "marketplace", "new", "orgs", "pricing", "search", "security", "settings", "site", "sponsors", "topics"]);

/** The account a profile link points to, or null when the text is not a link to a GitHub profile. */
export function profileOwner(value: string): string | null {
  const text = value.trim();
  if (!text) return null;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.hostname.replace(/^www\./i, "").toLowerCase() !== "github.com") return null;
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length !== 1 || RESERVED.has(parts[0].toLowerCase()) || !LOGIN.test(parts[0])) return null;
  return parts[0];
}

const apiRepository = z.object({
  name: z.string(),
  owner: z.object({ login: z.string() }),
  fork: z.boolean().optional(),
  private: z.boolean().optional(),
  size: z.number().optional(),
  description: z.string().nullable().optional(),
  language: z.string().nullable().optional(),
  pushed_at: z.string().nullable().optional(),
});

type Fetcher = typeof fetch;
type Attempt = { repositories: ProfileProject[]; more: boolean } | "not_found" | "unavailable";

function project(owner: string, repository: string, details: Partial<Pick<ProfileProject, "description" | "language" | "pushedAt">> = {}): ProfileProject {
  return {
    owner,
    repository,
    url: `https://github.com/${owner}/${repository}`,
    description: details.description?.trim() || null,
    language: details.language?.trim() || null,
    pushedAt: details.pushedAt ?? null,
  };
}

async function fromApi(owner: string, fetcher: Fetcher, token: string | null): Promise<Attempt> {
  let response: Response;
  try {
    response = await fetcher(`https://api.github.com/users/${encodeURIComponent(owner)}/repos?type=owner&sort=pushed&direction=desc&per_page=30`, {
      headers: {
        accept: "application/vnd.github+json",
        "user-agent": "CodeProof-ProfileListing",
        "x-github-api-version": "2022-11-28",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      signal: AbortSignal.timeout(PROFILE_LIMITS.timeoutMs),
      cache: "no-store",
    });
  } catch {
    return "unavailable";
  }
  if (response.status === 404) return "not_found";
  if (!response.ok) return "unavailable";
  const parsed = z.array(apiRepository).safeParse(await response.json().catch(() => null));
  if (!parsed.success) return "unavailable";
  const own = parsed.data
    // A copy of someone else's project says little about this person, and an empty project has nothing to read.
    .filter((item) => !item.fork && !item.private && item.size !== 0 && REPOSITORY.test(item.name) && item.owner.login.toLowerCase() === owner.toLowerCase())
    .map((item) => project(item.owner.login, item.name, { description: item.description ?? null, language: item.language ?? null, pushedAt: item.pushed_at ?? null }));
  return { repositories: own.slice(0, PROFILE_LIMITS.maxRepositories), more: own.length > PROFILE_LIMITS.maxRepositories || parsed.data.length >= 30 };
}

async function boundedText(response: Response): Promise<string | null> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > PROFILE_LIMITS.maxPageBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, received).toString("utf8");
}

/** Reads the project names off the profile's own list of projects. Only the links to this account's projects are used. */
export function projectsOnProfilePage(owner: string, html: string): ProfileProject[] {
  const found = new Map<string, ProfileProject>();
  for (const tag of html.match(/<a\b[^>]*>/gi) ?? []) {
    if (!/itemprop\s*=\s*"[^"]*\bcodeRepository\b/i.test(tag)) continue;
    const link = /href\s*=\s*"\/([^"/?#]+)\/([^"/?#]+)"/i.exec(tag);
    if (!link || link[1].toLowerCase() !== owner.toLowerCase() || !REPOSITORY.test(link[2])) continue;
    found.set(link[2].toLowerCase(), project(link[1], link[2]));
  }
  return [...found.values()];
}

async function fromPage(owner: string, fetcher: Fetcher): Promise<Attempt> {
  let response: Response;
  try {
    // "source" leaves out copies of other people's projects, as the other route does.
    response = await fetcher(`https://github.com/${encodeURIComponent(owner)}?tab=repositories&type=source`, {
      headers: { accept: "text/html", "user-agent": "CodeProof-ProfileListing" },
      signal: AbortSignal.timeout(PROFILE_LIMITS.timeoutMs),
      cache: "no-store",
    });
  } catch {
    return "unavailable";
  }
  if (response.status === 404) return "not_found";
  if (!response.ok) return "unavailable";
  const html = await boundedText(response).catch(() => null);
  if (html === null) return "unavailable";
  const repositories = projectsOnProfilePage(owner, html);
  // A page with no project links is either an account with nothing public or a layout this reader does not know.
  // Only the first is an answer; the second must not be reported as "this person has no projects".
  if (repositories.length === 0 && !/doesn(?:'|’|&#39;|&#x27;)t have any public repositories/i.test(html)) return "unavailable";
  return { repositories: repositories.slice(0, PROFILE_LIMITS.maxRepositories), more: repositories.length > PROFILE_LIMITS.maxRepositories || repositories.length >= 30 };
}

export interface ProfileListingOptions {
  fetcher?: Fetcher;
  /** An optional server-side token. It only raises GitHub's hourly limit; the listing works without one. */
  token?: string | null;
}

export async function listProfileRepositories(profile: string, options: ProfileListingOptions = {}): Promise<ProfileListing> {
  const owner = profileOwner(profile) ?? (LOGIN.test(profile.trim()) && !RESERVED.has(profile.trim().toLowerCase()) ? profile.trim() : null);
  if (!owner) throw new ProfileListingError("INVALID_PROFILE", "Send a GitHub profile link such as https://github.com/owner.", 400);
  const fetcher = options.fetcher ?? fetch;
  const listing = (attempt: Exclude<Attempt, string>, source: ProfileListing["source"]): ProfileListing => ({
    owner: attempt.repositories[0]?.owner ?? owner,
    url: `https://github.com/${attempt.repositories[0]?.owner ?? owner}`,
    repositories: attempt.repositories,
    more: attempt.more,
    source,
  });
  const notFound = new ProfileListingError("PROFILE_NOT_FOUND", "That GitHub profile was not found.", 404);

  const api = await fromApi(owner, fetcher, options.token?.trim() || null);
  if (api === "not_found") throw notFound;
  if (api !== "unavailable") return listing(api, "api");

  const page = await fromPage(owner, fetcher);
  if (page === "not_found") throw notFound;
  if (page !== "unavailable") return listing(page, "page");

  throw new ProfileListingError("LISTING_UNAVAILABLE", "GitHub did not provide the project list right now. Paste the repository links you want to inspect.", 503);
}
