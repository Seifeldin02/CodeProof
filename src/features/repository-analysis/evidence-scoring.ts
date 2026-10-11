import type { EvidenceLevel, SelectedFile, TechnologySignal } from "@/types/analysis";

export const EVIDENCE_LEVEL_METHOD = {
  "Strong Evidence": "Repeated meaningful implementation across multiple areas, plus tests or multiple architectural boundaries.",
  "Good Evidence": "At least two meaningful implementation files or repeated non-trivial use across modules.",
  "Partial Evidence": "One meaningful implementation example or test-backed but narrow usage.",
  "Limited Evidence": "Dependency, manifest, configuration, documentation, or trivial usage signals only.",
  "Insufficient Evidence": "No grounded implementation evidence remains after validation.",
} satisfies Record<EvidenceLevel, string>;

/**
 * How a language is detected: by counting file extensions across the archive.
 * That is a fact about the repository, not a file, so it must never be shown
 * where a cited file is expected.
 */
export const LANGUAGE_STATISTICS_EVIDENCE = "Archive file-extension statistics";

/** The file paths behind a technology signal, without entries that are not files. */
export function technologyEvidencePaths(technology: Pick<TechnologySignal, "evidence">): string[] {
  return technology.evidence.map((item) => item.split(": ")[0]).filter((path) => path !== LANGUAGE_STATISTICS_EVIDENCE);
}

const LEVEL_RANK: Record<EvidenceLevel, number> = {
  "Insufficient Evidence": 0,
  "Limited Evidence": 1,
  "Partial Evidence": 2,
  "Good Evidence": 3,
  "Strong Evidence": 4,
};

const LANGUAGE_EXTENSIONS: Record<string, RegExp> = {
  TypeScript: /\.tsx?$/i,
  JavaScript: /\.[cm]?jsx?$/i,
  Python: /\.py$/i,
  PHP: /\.php$/i,
  Java: /\.java$/i,
  Kotlin: /\.kts?$/i,
  Go: /\.go$/i,
  Rust: /\.rs$/i,
  "C#": /\.cs$/i,
  Swift: /\.swift$/i,
  Dart: /\.dart$/i,
  Ruby: /\.rb$/i,
};

/**
 * What counts as using a technology inside a file. A pattern must name the tool
 * or one of its own calls. A pattern that also matches ordinary code would turn
 * every source file into evidence for a dependency the project never uses.
 */
const TECHNOLOGY_PATTERNS: Record<string, RegExp> = {
  React: /(?:from\s+["']react["']|require\(["']react["']\)|React\.)/i,
  "Next.js": /(?:from\s+["']next(?:\/[^"']*)?["']|next\/|["']use server["'])/i,
  Vue: /(?:from\s+["']vue["']|defineComponent|<template>)/i,
  Angular: /@angular\//i,
  Svelte: /(?:from\s+["']svelte|\.svelte)/i,
  Express: /(?:from\s+["']express["']|require\(["']express["']\))/i,
  Fastify: /fastify/i,
  NestJS: /@nestjs\//i,
  Django: /(?:from\s+django|import\s+django)/i,
  FastAPI: /(?:from\s+fastapi|import\s+fastapi)/i,
  Laravel: /Illuminate\\|laravel/i,
  Spring: /org\.springframework/i,
  Prisma: /(?:@prisma\/client|PrismaClient|schema\.prisma)/i,
  "Drizzle ORM": /drizzle-orm/i,
  TypeORM: /typeorm/i,
  Sequelize: /sequelize/i,
  SQLAlchemy: /sqlalchemy/i,
  PostgreSQL: /(?:postgres(?:ql)?|\bpg\b|psycopg)/i,
  MySQL: /mysql/i,
  MongoDB: /(?:mongodb|mongoose|pymongo)/i,
  Redis: /(?:redis|ioredis)/i,
  Redux: /(?:redux|createSlice|configureStore)/i,
  Zustand: /(?:from\s+["']zustand(?:\/[^"']*)?["']|require\(["']zustand(?:\/[^"']*)?["']\))/,
  Jest: /(?:\bdescribe\s*\(|\b(?:it|test)\s*\(|\bexpect\s*\(|\bjest\.)/,
  Vitest: /(?:from\s+["']vitest["']|\bvi\.(?:fn|mock|spyOn|useFakeTimers|stubGlobal|stubEnv)\b|\bdescribe\s*\()/,
  Playwright: /(?:@playwright\/test|from\s+["']playwright["']|\bpage\.(?:goto|locator|getBy[A-Z]\w*|click|fill|waitFor\w*)\s*\()/,
  Cypress: /(?:\bcy\.[a-zA-Z]+\s*\(|\bCypress\.|from\s+["']cypress["'])/,
  // Docker has no content pattern on purpose: its files are found by path, and
  // a line that starts with FROM or RUN also opens a Python import or a SQL query.
  "GitHub Actions": /(?:^|\n)\s*(?:jobs|steps|uses|runs-on):/i,
  Terraform: /(?:^|\n)\s*(?:resource|provider|module)\s+["']/i,
};

/**
 * Jest and Vitest share one test API, so the call patterns above match either.
 * A file that imports one runner is not evidence for the other.
 */
const OTHER_TEST_RUNNER: Record<string, RegExp> = {
  Jest: /(?:from\s+["']vitest["']|require\(["']vitest["']\))/,
  Vitest: /(?:from\s+["']@jest\/globals["']|require\(["']@jest\/globals["']\))/,
};

function isWeakSignal(file: SelectedFile): boolean {
  return /manifest|configuration|documentation/i.test(file.selectionReason);
}

function isMeaningful(file: SelectedFile): boolean {
  return file.content.replace(/\s/g, "").length >= 200;
}

function directoryOf(path: string): string {
  return path.split("/").slice(0, -1).join("/") || ".";
}

export function collectTechnologyEvidenceFiles(
  technology: TechnologySignal,
  selectedFiles: SelectedFile[],
): SelectedFile[] {
  const signaledPaths = new Set(technology.evidence.map((item) => item.split(": ")[0]));
  const languagePattern = LANGUAGE_EXTENSIONS[technology.name];
  const contentPattern = TECHNOLOGY_PATTERNS[technology.name];
  const otherRunner = OTHER_TEST_RUNNER[technology.name];
  return selectedFiles.filter((file) =>
    signaledPaths.has(file.path) ||
    Boolean(languagePattern?.test(file.path)) ||
    (Boolean(contentPattern?.test(file.content)) && !otherRunner?.test(file.content)),
  );
}

export function maximumEvidenceLevel(files: SelectedFile[]): EvidenceLevel {
  if (files.length === 0) return "Insufficient Evidence";
  const meaningfulImplementation = files.filter((file) => !isWeakSignal(file) && isMeaningful(file));
  const testCount = meaningfulImplementation.filter((file) => /test|spec/i.test(file.selectionReason)).length;
  const boundaryCount = meaningfulImplementation.filter((file) =>
    /entry point|API boundary|service|domain|security|state|schema/i.test(file.selectionReason),
  ).length;
  const directories = new Set(meaningfulImplementation.map((file) => directoryOf(file.path))).size;

  if (meaningfulImplementation.length >= 3 && directories >= 2 && (testCount >= 1 || boundaryCount >= 2)) {
    return "Strong Evidence";
  }
  if (meaningfulImplementation.length >= 2) return "Good Evidence";
  if (meaningfulImplementation.length === 1 || testCount >= 1) return "Partial Evidence";
  return "Limited Evidence";
}

export function capEvidenceLevel(requested: EvidenceLevel, files: SelectedFile[]): EvidenceLevel {
  const maximum = maximumEvidenceLevel(files);
  return LEVEL_RANK[requested] <= LEVEL_RANK[maximum] ? requested : maximum;
}
