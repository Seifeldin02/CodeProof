import type { IngestedRepository } from "@/services/github";
import type {
  ArchitectureSummary,
  EvidenceGap,
  InterviewQuestion,
  ProjectType,
  SkillEvidence,
  TechnologySignal,
} from "@/types/analysis";
import { collectTechnologyEvidenceFiles, EVIDENCE_LEVEL_METHOD, maximumEvidenceLevel } from "./evidence-scoring";

interface TechnologyRule {
  name: string;
  category: TechnologySignal["category"];
  packages?: string[];
  paths?: RegExp[];
  content?: RegExp[];
}

const TECHNOLOGY_RULES: TechnologyRule[] = [
  { name: "React", category: "framework", packages: ["react"], content: [/from ["']react["']/] },
  { name: "Next.js", category: "framework", packages: ["next"], paths: [/next\.config\./, /^app\//, /^pages\//] },
  { name: "Vue", category: "framework", packages: ["vue"], paths: [/\.vue$/] },
  { name: "Nuxt", category: "framework", packages: ["nuxt"], paths: [/nuxt\.config\./] },
  { name: "Angular", category: "framework", packages: ["@angular/core"], paths: [/angular\.json$/] },
  { name: "Svelte", category: "framework", packages: ["svelte"], paths: [/\.svelte$/] },
  { name: "Express", category: "api", packages: ["express"], content: [/\bexpress\s*\(/] },
  { name: "Fastify", category: "api", packages: ["fastify"] },
  { name: "NestJS", category: "api", packages: ["@nestjs/core"] },
  { name: "Django", category: "framework", packages: ["django"], content: [/from django|import django/] },
  { name: "FastAPI", category: "api", packages: ["fastapi"], content: [/from fastapi|import fastapi/] },
  { name: "Laravel", category: "framework", packages: ["laravel/framework"], paths: [/artisan$/, /routes\/web\.php$/] },
  { name: "Spring", category: "framework", packages: ["org.springframework"], content: [/org\.springframework/] },
  { name: "Prisma", category: "orm", packages: ["prisma", "@prisma/client"], paths: [/schema\.prisma$/] },
  { name: "Drizzle ORM", category: "orm", packages: ["drizzle-orm"] },
  { name: "TypeORM", category: "orm", packages: ["typeorm"] },
  { name: "Sequelize", category: "orm", packages: ["sequelize"] },
  { name: "SQLAlchemy", category: "orm", packages: ["sqlalchemy"], content: [/from sqlalchemy|import sqlalchemy/] },
  { name: "PostgreSQL", category: "database", packages: ["pg", "postgres", "psycopg", "npgsql"], content: [/postgres(?:ql)?:\/\//] },
  { name: "MySQL", category: "database", packages: ["mysql", "mysql2", "pymysql"], content: [/mysql:\/\//] },
  { name: "MongoDB", category: "database", packages: ["mongodb", "mongoose", "pymongo"], content: [/mongodb(?:\+srv)?:\/\//] },
  { name: "Redis", category: "database", packages: ["redis", "ioredis"], content: [/redis:\/\//] },
  { name: "Redux", category: "state-management", packages: ["redux", "@reduxjs/toolkit"] },
  { name: "Zustand", category: "state-management", packages: ["zustand"] },
  { name: "Pinia", category: "state-management", packages: ["pinia"] },
  { name: "Jest", category: "testing", packages: ["jest"], paths: [/jest\.config\./] },
  { name: "Vitest", category: "testing", packages: ["vitest"], paths: [/vitest\.config\./] },
  { name: "Playwright", category: "testing", packages: ["@playwright/test", "playwright"], paths: [/playwright\.config\./] },
  { name: "Cypress", category: "testing", packages: ["cypress"], paths: [/cypress\.config\./] },
  { name: "Docker", category: "infrastructure", paths: [/(^|\/)dockerfile$/i, /docker-compose.*\.ya?ml$/] },
  { name: "GitHub Actions", category: "infrastructure", paths: [/^\.github\/workflows\/.*\.ya?ml$/] },
  { name: "Terraform", category: "infrastructure", paths: [/\.tf$/] },
  { name: "Vite", category: "build", packages: ["vite"], paths: [/vite\.config\./] },
  { name: "Webpack", category: "build", packages: ["webpack"], paths: [/webpack\.config\./] },
  { name: "Tailwind CSS", category: "library", packages: ["tailwindcss"], paths: [/tailwind\.config\./] },
];

const LANGUAGE_NAMES: Record<string, string> = {
  JavaScript: "JavaScript",
  TypeScript: "TypeScript",
  Python: "Python",
  PHP: "PHP",
  Java: "Java",
  Kotlin: "Kotlin",
  Go: "Go",
  Rust: "Rust",
  "C#": "C#",
  Swift: "Swift",
  Dart: "Dart",
  Ruby: "Ruby",
};

function packageNames(files: IngestedRepository["files"]): Map<string, string> {
  const packages = new Map<string, string>();
  for (const file of files) {
    if (file.path.endsWith("package.json")) {
      try {
        const manifest = JSON.parse(file.content) as Record<string, unknown>;
        for (const section of ["dependencies", "devDependencies", "peerDependencies"]) {
          const dependencies = manifest[section];
          if (dependencies && typeof dependencies === "object") {
            for (const dependency of Object.keys(dependencies)) packages.set(dependency.toLowerCase(), file.path);
          }
        }
      } catch {
        // Invalid repository manifests are treated as untrusted text and skipped.
      }
    }
    if (/requirements.*\.txt$|pyproject\.toml$/i.test(file.path)) {
      for (const match of file.content.matchAll(/^\s*([a-zA-Z0-9_.-]+)\s*(?:[=<>~!]|$)/gm)) {
        packages.set(match[1].toLowerCase(), file.path);
      }
    }
    if (/composer\.json$|pom\.xml$|build\.gradle(?:\.kts)?$|.*\.csproj$/i.test(file.path)) {
      for (const rule of TECHNOLOGY_RULES) {
        for (const dependency of rule.packages ?? []) {
          if (file.content.toLowerCase().includes(dependency.toLowerCase())) packages.set(dependency.toLowerCase(), file.path);
        }
      }
    }
  }
  return packages;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

export function detectTechnologies(repository: IngestedRepository): TechnologySignal[] {
  const detected: TechnologySignal[] = [];
  const packages = packageNames(repository.files);

  for (const [language] of Object.entries(repository.languages).sort((a, b) => b[1] - a[1])) {
    if (LANGUAGE_NAMES[language]) {
      detected.push({ name: LANGUAGE_NAMES[language], category: "language", evidence: ["GitHub language statistics"], source: "Deterministic Fact" });
    }
  }

  const packageManagerSignals: Array<[string, RegExp]> = [
    ["npm", /(^|\/)package-lock\.json$/],
    ["pnpm", /(^|\/)pnpm-lock\.yaml$/],
    ["Yarn", /(^|\/)yarn\.lock$/],
    ["Bun", /(^|\/)bun\.lockb?$/],
    ["Poetry", /(^|\/)poetry\.lock$|pyproject\.toml$/],
    ["Maven", /(^|\/)pom\.xml$/],
    ["Gradle", /(^|\/)build\.gradle(?:\.kts)?$/],
    ["Cargo", /(^|\/)Cargo\.toml$/],
  ];
  for (const [name, pattern] of packageManagerSignals) {
    const paths = repository.treePaths.filter((path) => pattern.test(path));
    if (paths.length) detected.push({ name, category: "package-manager", evidence: paths, source: "Deterministic Fact" });
  }

  for (const rule of TECHNOLOGY_RULES) {
    const evidence: string[] = [];
    for (const dependency of rule.packages ?? []) {
      const path = packages.get(dependency.toLowerCase());
      if (path) evidence.push(`${path}: ${dependency}`);
    }
    for (const path of repository.treePaths) {
      if (rule.paths?.some((pattern) => pattern.test(path))) evidence.push(path);
    }
    for (const file of repository.files) {
      if (rule.content?.some((pattern) => pattern.test(file.content.toLowerCase()))) evidence.push(file.path);
    }
    if (evidence.length) detected.push({ name: rule.name, category: rule.category, evidence: unique(evidence), source: "Deterministic Fact" });
  }

  return detected.filter(
    (technology, index, all) => all.findIndex((candidate) => candidate.name === technology.name) === index,
  );
}

export function inferProjectType(repository: IngestedRepository, technologies: TechnologySignal[]): ProjectType {
  const names = new Set(technologies.map((technology) => technology.name));
  const paths = repository.treePaths;
  if (paths.some((path) => /(^|\/)(pnpm-workspace\.yaml|lerna\.json|nx\.json|turbo\.json)$/.test(path))) return "Monorepo";
  if (names.has("React Native") || names.has("Flutter") || paths.some((path) => /android\/|ios\//.test(path))) return "Mobile application";
  const hasFrontend = ["React", "Next.js", "Vue", "Nuxt", "Angular", "Svelte"].some((name) => names.has(name));
  const hasBackend = ["Express", "Fastify", "NestJS", "Django", "FastAPI", "Laravel", "Spring"].some((name) => names.has(name)) || paths.some((path) => /(^|\/)(api|controllers?|routes?)\//.test(path));
  if (hasFrontend && hasBackend) return "Full-stack application";
  if (hasFrontend) return "Frontend application";
  if (hasBackend) return "Backend API";
  if (paths.some((path) => /(^|\/)(cli|commands?)\//.test(path))) return "CLI";
  const manifest = repository.files.find((file) => file.path === "package.json");
  if (manifest?.content.includes('"bin"') || manifest?.content.includes('"exports"')) return "Library or package";
  return "Unclear";
}

export function buildDeterministicArchitecture(
  repository: IngestedRepository,
  technologies: TechnologySignal[],
  projectType: ProjectType,
): ArchitectureSummary {
  const modules = unique(repository.files.map((file) => file.path.split("/")[0]).filter((part) => !part.includes("."))).slice(0, 8);
  const boundaryFiles = repository.files.filter((file) => /(^|\/)(api|routes?|controllers?|services?|stores?|schema)\//i.test(file.path));
  return {
    purpose: repository.metadata.description ?? `A ${projectType.toLowerCase()} hosted in ${repository.metadata.owner}/${repository.metadata.name}.`,
    overview: `Deterministic inspection identifies a ${projectType.toLowerCase()} using ${technologies.slice(0, 6).map((item) => item.name).join(", ") || "technologies not identifiable from the selected files"}.`,
    majorModules: modules.length ? modules : ["Repository root"],
    boundaries: boundaryFiles.slice(0, 6).map((file) => file.path),
    dataFlow: [],
    engineeringDecisions: technologies.filter((item) => ["orm", "state-management", "infrastructure", "testing"].includes(item.category)).map((item) => `${item.name} is present (${item.evidence[0]}).`),
    importantFiles: repository.files.slice(0, 10).map((file) => file.path),
    origin: "deterministic",
    source: "Deterministic Fact",
  };
}

export function buildDeterministicSkills(
  repository: IngestedRepository,
  technologies: TechnologySignal[],
): SkillEvidence[] {
  return technologies
    .filter((technology) => technology.category !== "package-manager")
    .slice(0, 12)
    .map<SkillEvidence>((technology) => {
      const evidenceFiles = collectTechnologyEvidenceFiles(technology, repository.files);
      const level = maximumEvidenceLevel(evidenceFiles);
      return {
      skill: technology.name,
      level,
      explanation: `${technology.name} is supported by deterministic repository signals. ${EVIDENCE_LEVEL_METHOD[level]}`,
      evidence: evidenceFiles.slice(0, 6).map((file) => {
        const matchingSignal = technology.evidence.find((item) => item.split(": ")[0] === file.path);
        return {
          file: file.path,
          summary: `${technology.name} signal detected here.`,
          implementationExample: matchingSignal ?? `${file.selectionReason}; meaningful usage is evaluated by file role and content depth.`,
          origin: "deterministic" as const,
          source: "Deterministic Fact" as const,
        };
      }),
      origin: "deterministic",
      source: "Deterministic Fact",
    };}).filter((skill) => skill.evidence.length > 0);
}

export function detectEvidenceGaps(repository: IngestedRepository): EvidenceGap[] {
  const paths = repository.treePaths;
  const allContent = repository.files.map((file) => file.content).join("\n").toLowerCase();
  const checks: Array<[string, boolean, string]> = [
    ["Automated tests", paths.some((path) => /(^|\/)(__tests__|tests?|spec|e2e)\/|\.(test|spec)\./i.test(path)), "The selected evidence contains limited or no automated test implementation."],
    ["Security", paths.some((path) => /auth|security|middleware/i.test(path)) || /csrf|helmet|oauth|authorization/.test(allContent), "The selected evidence contains limited explicit security or authorization handling."],
    ["Observability", /sentry|opentelemetry|datadog|newrelic|structured log|logger/.test(allContent), "The selected evidence contains limited observability, tracing, or structured logging signals."],
    ["Deployment", paths.some((path) => /docker|\.github\/workflows|vercel|netlify|\.tf$/i.test(path)), "The selected evidence contains limited deployment or infrastructure configuration."],
    ["Error handling", /try\s*\{|catch\s*\(|except\s+|error boundary|onerror/.test(allContent), "The selected evidence contains limited explicit error-handling examples."],
    ["Documentation", paths.some((path) => /readme|docs\//i.test(path)), "The selected evidence contains limited project documentation."],
    ["Accessibility", /aria-|role=|accessibility|a11y/.test(allContent), "The selected evidence contains limited explicit accessibility implementation."],
    ["Performance", /cache|memo|lazy\(|dynamic\(|pagination|index\(/.test(allContent), "The selected evidence contains limited explicit performance-oriented implementation."],
  ];
  return checks.filter(([, present]) => !present).map(([area, , explanation]) => ({
    area,
    explanation,
    checkedFiles: paths.slice(0, 8),
    origin: "deterministic" as const,
    source: "Deterministic Fact" as const,
  }));
}

export function buildDeterministicQuestions(
  repository: IngestedRepository,
  technologies: TechnologySignal[],
): InterviewQuestion[] {
  const files = repository.files.filter((file) => !/readme/i.test(file.path));
  return files.slice(0, 6).map((file, index) => {
    const technology = technologies[index % Math.max(technologies.length, 1)];
    return {
      question: `Walk through the responsibilities of ${file.path}. What trade-offs would you revisit as this codebase grows?`,
      relatedSkill: technology?.name ?? "Software architecture",
      difficulty: index < 2 ? "Foundational" : index < 5 ? "Intermediate" : "Advanced",
      files: [file.path],
      relevance: `This question is grounded in a selected ${file.selectionReason.toLowerCase()}.`,
      origin: "deterministic",
      source: "Deterministic Fact",
    };
  });
}
