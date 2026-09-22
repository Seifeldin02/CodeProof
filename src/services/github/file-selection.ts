import type { GitHubTreeEntry } from "./types";

export const FILE_LIMITS = {
  maxTreeEntries: 5_000,
  maxSelectedFiles: 32,
  maxFileBytes: 64_000,
  maxSelectedBytes: 600_000,
  maxPromptCharsPerFile: 18_000,
} as const;

const EXCLUDED_SEGMENTS = new Set([
  "node_modules",
  "vendor",
  "dist",
  "build",
  ".next",
  "coverage",
  "target",
  "bin",
  "obj",
  "generated",
  "__generated__",
  "public",
]);

const EXCLUDED_NAMES = /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|composer\.lock|poetry\.lock|Cargo\.lock|.*\.min\.(js|css)|.*\.map)$/i;
const BINARY_EXTENSIONS = /\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|tar|7z|exe|dll|so|dylib|woff2?|ttf|eot|mp[34]|wav|mov|avi|class|jar|pyc|wasm|sqlite|db)$/i;
const SOURCE_EXTENSIONS = /\.(ts|tsx|js|jsx|mjs|cjs|py|rb|php|java|kt|kts|go|rs|cs|fs|fsx|swift|dart|vue|svelte|sql|graphql|gql|sh|ps1|yaml|yml|json|toml|xml|md)$/i;
const EXTENSIONLESS_TEXT_NAMES = /(^|\/)(dockerfile|makefile|procfile|gemfile|rakefile)$/i;

const priorityRules: Array<[RegExp, number, string]> = [
  [/(^|\/)(package\.json|pyproject\.toml|requirements.*\.txt|pom\.xml|build\.gradle(?:\.kts)?|composer\.json|Cargo\.toml|go\.mod|[^/]+\.csproj)$/i, 100, "Project manifest"],
  [/(^|\/)(schema\.prisma|.*schema.*\.(sql|graphql|ts)|migrations?\/)/i, 94, "Database schema or migration"],
  [/(^|\/)(dockerfile|docker-compose.*|\.github\/workflows\/|vercel\.json|netlify\.toml|terraform\/|.*\.tf$)/i, 92, "Infrastructure or deployment configuration"],
  [/(^|\/)(next\.config|vite\.config|webpack\.config|tsconfig|eslint\.config|tailwind\.config|nuxt\.config|angular\.json)/i, 88, "Framework or build configuration"],
  [/(^|\/)(app|main|index|server|program)\.(ts|tsx|js|jsx|py|rb|php|java|kt|go|rs|cs)$/i, 86, "Application entry point"],
  [/(^|\/)(routes?|controllers?|api|handlers?|endpoints?)\//i, 84, "Request routing or API boundary"],
  [/(^|\/)(services?|repositories|use-cases?|domain)\//i, 82, "Service or domain logic"],
  [/(^|\/)(auth|authentication|authorization|security)(\/|\.)/i, 82, "Authentication or security logic"],
  [/(^|\/)(stores?|state|hooks?)\//i, 78, "State management or application hook"],
  [/(^|\/)(__tests__|tests?|spec|e2e)\//i, 74, "Test implementation"],
  [/\.(test|spec)\.(ts|tsx|js|jsx|py|rb|php|java|kt|go|rs|cs)$/i, 74, "Test implementation"],
  [/(^|\/)readme(\.|$)/i, 66, "Project documentation"],
  [SOURCE_EXTENSIONS, 30, "Representative source file"],
];

export interface FileCandidate extends GitHubTreeEntry {
  score: number;
  reason: string;
}

export function exceedsTreeLimit(entryCount: number): boolean {
  return entryCount > FILE_LIMITS.maxTreeEntries;
}

/**
 * Classifies archive entries before they consume the analyzable tree/byte
 * budgets. These paths are never opened or decompressed by the ingestion path.
 */
export function isEarlyExcludedArchivePath(path: string): boolean {
  const segments = path.toLowerCase().split("/");
  return EXCLUDED_NAMES.test(path) || BINARY_EXTENSIONS.test(path) || segments.some((segment) => EXCLUDED_SEGMENTS.has(segment));
}

export type FileExclusionReason =
  | "empty"
  | "oversized_file"
  | "generated_vendor_build"
  | "binary_extension"
  | "unsupported_text"
  | "selection_file_limit"
  | "selection_byte_limit"
  | "directory_diversity";

export function classifyFileExclusion(path: string, size: number): FileExclusionReason | null {
  if (size <= 0) return "empty";
  if (size > FILE_LIMITS.maxFileBytes) return "oversized_file";
  const segments = path.toLowerCase().split("/");
  if (EXCLUDED_NAMES.test(path) || segments.some((segment) => EXCLUDED_SEGMENTS.has(segment))) return "generated_vendor_build";
  if (BINARY_EXTENSIONS.test(path)) return "binary_extension";
  if (!SOURCE_EXTENSIONS.test(path) && !EXTENSIONLESS_TEXT_NAMES.test(path)) return "unsupported_text";
  return null;
}

function isExcluded(path: string, size: number): boolean {
  return (
    classifyFileExclusion(path, size) !== null
  );
}

export function rankFiles(entries: GitHubTreeEntry[]): FileCandidate[] {
  const candidates: FileCandidate[] = [];

  for (const entry of entries) {
    const size = entry.size ?? 0;
    if (entry.type !== "blob" || isExcluded(entry.path, size)) continue;

    const match = priorityRules.find(([pattern]) => pattern.test(entry.path));
    if (!match) continue;
    const depthPenalty = Math.max(0, entry.path.split("/").length - 4) * 2;
    const sizePenalty = size > 40_000 ? 8 : size > 24_000 ? 3 : 0;
    candidates.push({
      ...entry,
      score: match[1] - depthPenalty - sizePenalty,
      reason: match[2],
    });
  }

  return candidates.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
}

export function selectFileCandidates(entries: GitHubTreeEntry[]): FileCandidate[] {
  return selectFileCandidatesWithAccounting(entries).selected;
}

export interface FileSelectionAccounting {
  selected: FileCandidate[];
  excluded: Array<{ path: string; size: number; reason: FileExclusionReason }>;
  eligible: FileCandidate[];
}

export function selectFileCandidatesWithAccounting(entries: GitHubTreeEntry[]): FileSelectionAccounting {
  const selected: FileCandidate[] = [];
  const excluded: FileSelectionAccounting["excluded"] = [];
  const directoryCounts = new Map<string, number>();
  let totalBytes = 0;

  for (const entry of entries) {
    const reason = classifyFileExclusion(entry.path, entry.size ?? 0);
    if (reason) excluded.push({ path: entry.path, size: entry.size ?? 0, reason });
  }

  const eligible = rankFiles(entries);
  for (const candidate of eligible) {
    if (selected.length >= FILE_LIMITS.maxSelectedFiles) {
      excluded.push({ path: candidate.path, size: candidate.size ?? 0, reason: "selection_file_limit" });
      continue;
    }
    const directory = candidate.path.split("/").slice(0, -1).join("/");
    const directoryCount = directoryCounts.get(directory) ?? 0;
    if (candidate.score < 80 && directoryCount >= 4) {
      excluded.push({ path: candidate.path, size: candidate.size ?? 0, reason: "directory_diversity" });
      continue;
    }
    if (totalBytes + (candidate.size ?? 0) > FILE_LIMITS.maxSelectedBytes) {
      excluded.push({ path: candidate.path, size: candidate.size ?? 0, reason: "selection_byte_limit" });
      continue;
    }
    selected.push(candidate);
    directoryCounts.set(directory, directoryCount + 1);
    totalBytes += candidate.size ?? 0;
  }

  return { selected, excluded, eligible };
}
