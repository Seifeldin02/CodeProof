import type { Role } from "@/features/hiring-analytics/types";

export interface DiscoveredRepository {
  owner: string;
  repository: string;
  url: string;
}

export interface DiscoveredGitHubProfile {
  owner: string;
  url: string;
}

/**
 * A candidate source that is named on the CV but that CodeProof cannot read
 * yet: a portfolio site, or a repository host other than GitHub.
 *
 * These are recorded rather than dropped. The product contract is that a
 * source we cannot read is reported as *unknown* and never counted against the
 * candidate — the same rule the review queue applies to every missing input.
 */
export type DiscoveredSourceKind = "code_host" | "portfolio";

export interface DiscoveredSource {
  url: string;
  host: string;
  kind: DiscoveredSourceKind;
}

export interface CvDiscovery {
  candidateName: string | null;
  suggestedRole: Role;
  repositories: DiscoveredRepository[];
  profiles: DiscoveredGitHubProfile[];
  /** Portfolios and non-GitHub code hosts found on the CV. Not analyzed. */
  otherSources: DiscoveredSource[];
  manualSelectionRequired: boolean;
  notes: string[];
}

const GITHUB_LINK = /(?:https?:\/\/)?(?:www\.)?github\.com\/[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)?(?:\/[^\s<>"']*)?/gi;
const RESERVED_OWNERS = new Set(["about", "apps", "collections", "customer-stories", "enterprise", "events", "explore", "features", "marketplace", "new", "orgs", "pricing", "search", "security", "settings", "site", "sponsors", "topics"]);

/**
 * Requires an explicit scheme or `www.` so that ordinary CV prose — "Node.js",
 * "Next.js", "package.json" — is never mistaken for a link.
 */
const ANY_LINK = /(?:https?:\/\/|www\.)[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(?:\/[^\s<>"')\]]*)?/gi;

/** Contact and social profiles. Present on most CVs and never a work sample. */
const SOCIAL_HOSTS = new Set([
  "linkedin.com", "twitter.com", "x.com", "facebook.com", "instagram.com", "t.me", "wa.me",
  "mailto", "tel", "google.com", "docs.google.com", "drive.google.com", "youtube.com",
]);

/** Repository hosts CodeProof cannot ingest today; ingestion is GitHub-only. */
const CODE_HOSTS = new Set([
  "gitlab.com", "bitbucket.org", "codeberg.org", "git.sr.ht", "sourceforge.net", "gitea.com", "gitee.com",
]);

function hostOf(url: URL): string {
  return url.hostname.replace(/^www\./i, "").toLowerCase();
}

/**
 * Classifies a non-GitHub link found on a CV. Returns null for GitHub (handled
 * separately) and for social/contact links, which are not work samples.
 */
export function classifyDiscoveredSource(rawUrl: string): DiscoveredSource | null {
  const normalized = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = hostOf(url);
  if (host === "github.com" || SOCIAL_HOSTS.has(host)) return null;
  return {
    url: `https://${host}${url.pathname.replace(/\/+$/, "")}`,
    host,
    kind: CODE_HOSTS.has(host) ? "code_host" : "portfolio",
  };
}

function cleanLink(value: string): string {
  return value.replace(/[),.;:\]}]+$/g, "");
}

function candidateName(lines: string[]): string | null {
  for (const line of lines.slice(0, 15)) {
    const value = line.trim().replace(/\s+/g, " ");
    if (!value || value.length > 80 || /https?:|github|linkedin|@|\d{3,}|curriculum|r[eé]sum[eé]|\bcv\b/i.test(value)) continue;
    const words = value.split(" ");
    if (words.length >= 2 && words.length <= 5 && words.every((word) => /^[\p{L}'-]+$/u.test(word))) return value;
  }
  return null;
}

function suggestedRole(text: string): Role {
  const lower = text.toLowerCase();
  if (/data engineer|etl|data pipeline/.test(lower)) return "Data Engineer";
  if (/devops|site reliability|platform engineer|kubernetes|terraform/.test(lower)) return "DevOps Engineer";
  if (/full[- ]?stack/.test(lower)) return "Full-Stack Engineer";
  if (/back[- ]?end|api engineer|server[- ]side/.test(lower)) return "Backend Engineer";
  return "Frontend Engineer";
}

/**
 * Pulls GitHub repositories and bare profiles out of any text. Shared by CV
 * intake and the portfolio scanner so both agree on what counts as a repository.
 */
export function extractGitHubLinks(text: string): {
  repositories: DiscoveredRepository[];
  profiles: DiscoveredGitHubProfile[];
} {
  const repositories = new Map<string, DiscoveredRepository>();
  const profiles = new Map<string, DiscoveredGitHubProfile>();
  for (const match of text.matchAll(GITHUB_LINK)) {
    const raw = cleanLink(match[0]);
    const normalized = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    let url: URL;
    try {
      url = new URL(normalized);
    } catch {
      continue;
    }
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length === 0 || RESERVED_OWNERS.has(parts[0].toLowerCase())) continue;
    const owner = parts[0];
    if (parts.length >= 2 && /^[\w.-]+(?:\.git)?$/.test(parts[1])) {
      const repository = parts[1].replace(/\.git$/i, "");
      const canonical = `https://github.com/${owner}/${repository}`;
      repositories.set(canonical.toLowerCase(), { owner, repository, url: canonical });
    } else {
      const canonical = `https://github.com/${owner}`;
      profiles.set(canonical.toLowerCase(), { owner, url: canonical });
    }
  }
  const found = [...repositories.values()];
  return {
    repositories: found,
    profiles: [...profiles.values()].filter((profile) => !found.some((repository) => repository.owner.toLowerCase() === profile.owner.toLowerCase())),
  };
}

export function discoverCandidateLinks(resumeText: string): CvDiscovery {
  const { repositories: foundRepositories, profiles: foundProfiles } = extractGitHubLinks(resumeText);

  const otherSources = new Map<string, DiscoveredSource>();
  for (const match of resumeText.matchAll(ANY_LINK)) {
    const source = classifyDiscoveredSource(cleanLink(match[0]));
    if (source) otherSources.set(source.url.toLowerCase(), source);
  }

  const foundSources = [...otherSources.values()].sort((a, b) => a.url.localeCompare(b.url));
  const notes: string[] = [];
  if (foundRepositories.length === 0 && foundProfiles.length > 0) notes.push("A GitHub profile was found, but profile project listing requires GitHub API access. Paste one or more public repository URLs to continue for free.");
  if (foundRepositories.length === 0 && foundProfiles.length === 0) notes.push("No GitHub links were detected. Paste public repository URLs manually.");
  if (foundSources.length > 0) notes.push("Portfolio or non-GitHub sources were found on the CV. CodeProof records them and reports them as unknown, because only public GitHub repositories can be analyzed today.");
  return {
    candidateName: candidateName(resumeText.split(/\r?\n/)),
    suggestedRole: suggestedRole(resumeText),
    repositories: foundRepositories,
    profiles: foundProfiles,
    otherSources: foundSources,
    manualSelectionRequired: foundRepositories.length === 0,
    notes,
  };
}
