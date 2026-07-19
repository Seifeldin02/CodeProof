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

export interface CvDiscovery {
  candidateName: string | null;
  suggestedRole: Role;
  repositories: DiscoveredRepository[];
  profiles: DiscoveredGitHubProfile[];
  manualSelectionRequired: boolean;
  notes: string[];
}

const GITHUB_LINK = /(?:https?:\/\/)?(?:www\.)?github\.com\/[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)?(?:\/[^\s<>"']*)?/gi;
const RESERVED_OWNERS = new Set(["about", "apps", "collections", "customer-stories", "enterprise", "events", "explore", "features", "marketplace", "new", "orgs", "pricing", "search", "security", "settings", "site", "sponsors", "topics"]);

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

export function discoverCandidateLinks(resumeText: string): CvDiscovery {
  const repositories = new Map<string, DiscoveredRepository>();
  const profiles = new Map<string, DiscoveredGitHubProfile>();
  for (const match of resumeText.matchAll(GITHUB_LINK)) {
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

  const foundRepositories = [...repositories.values()];
  const foundProfiles = [...profiles.values()].filter((profile) => !foundRepositories.some((repository) => repository.owner.toLowerCase() === profile.owner.toLowerCase()));
  const notes: string[] = [];
  if (foundRepositories.length === 0 && foundProfiles.length > 0) notes.push("A GitHub profile was found, but profile project listing requires GitHub API access. Paste one or more public repository URLs to continue for free.");
  if (foundRepositories.length === 0 && foundProfiles.length === 0) notes.push("No GitHub links were detected. Paste public repository URLs manually.");
  return {
    candidateName: candidateName(resumeText.split(/\r?\n/)),
    suggestedRole: suggestedRole(resumeText),
    repositories: foundRepositories,
    profiles: foundProfiles,
    manualSelectionRequired: foundRepositories.length === 0,
    notes,
  };
}
