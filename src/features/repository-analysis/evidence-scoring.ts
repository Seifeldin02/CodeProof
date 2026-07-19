import type { EvidenceLevel, SelectedFile, TechnologySignal } from "@/types/analysis";

export const EVIDENCE_LEVEL_METHOD = {
  "Strong Evidence": "Repeated meaningful implementation across multiple areas, plus tests or multiple architectural boundaries.",
  "Good Evidence": "At least two meaningful implementation files or repeated non-trivial use across modules.",
  "Partial Evidence": "One meaningful implementation example or test-backed but narrow usage.",
  "Limited Evidence": "Dependency, manifest, configuration, documentation, or trivial usage signals only.",
  "Insufficient Evidence": "No grounded implementation evidence remains after validation.",
} satisfies Record<EvidenceLevel, string>;

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
  Zustand: /(?:zustand|create\s*\()/i,
  Jest: /(?:describe\s*\(|test\s*\(|expect\s*\(|jest\.)/i,
  Vitest: /(?:from\s+["']vitest["']|vi\.|describe\s*\()/i,
  Playwright: /(?:@playwright\/test|page\.)/i,
  Cypress: /(?:cy\.|cypress)/i,
  Docker: /(?:^|\n)\s*(?:FROM|RUN|COPY|CMD|ENTRYPOINT)\s+/i,
  "GitHub Actions": /(?:^|\n)\s*(?:jobs|steps|uses|runs-on):/i,
  Terraform: /(?:^|\n)\s*(?:resource|provider|module)\s+["']/i,
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
  return selectedFiles.filter((file) =>
    signaledPaths.has(file.path) ||
    Boolean(languagePattern?.test(file.path)) ||
    Boolean(contentPattern?.test(file.content)),
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
