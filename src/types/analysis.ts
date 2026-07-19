export type EvidenceLevel =
  | "Strong Evidence"
  | "Good Evidence"
  | "Partial Evidence"
  | "Limited Evidence"
  | "Insufficient Evidence";

export type EvidenceOrigin = "deterministic" | "ai_interpretation";

export interface RepositoryMetadata {
  owner: string;
  name: string;
  url: string;
  description: string | null;
  defaultBranch: string;
  commitSha: string;
  stars: number;
  forks: number;
  openIssues: number;
  license: string | null;
  updatedAt: string;
  isFork: boolean;
}

export interface TechnologySignal {
  name: string;
  category:
    | "language"
    | "framework"
    | "library"
    | "package-manager"
    | "testing"
    | "database"
    | "orm"
    | "state-management"
    | "api"
    | "build"
    | "infrastructure";
  evidence: string[];
}

export type ProjectType =
  | "Frontend application"
  | "Backend API"
  | "Full-stack application"
  | "Library or package"
  | "CLI"
  | "Mobile application"
  | "Monorepo"
  | "Unclear";

export interface SelectedFile {
  path: string;
  size: number;
  sha: string;
  content: string;
  truncated: boolean;
  selectionReason: string;
}

export interface ArchitectureSummary {
  purpose: string;
  overview: string;
  majorModules: string[];
  boundaries: string[];
  dataFlow: string[];
  engineeringDecisions: string[];
  importantFiles: string[];
  origin: EvidenceOrigin;
}

export interface EvidenceItem {
  file: string;
  summary: string;
  implementationExample: string;
  origin: EvidenceOrigin;
}

export interface SkillEvidence {
  skill: string;
  level: EvidenceLevel;
  explanation: string;
  evidence: EvidenceItem[];
  origin: EvidenceOrigin;
}

export interface EvidenceGap {
  area: string;
  explanation: string;
  checkedFiles: string[];
  origin: EvidenceOrigin;
}

export type ResumeSupport =
  | "Strongly Supported"
  | "Supported"
  | "Partially Supported"
  | "No Repository Evidence";

export interface ResumeClaimVerification {
  claim: string;
  category: "technology" | "framework" | "project" | "role" | "engineering";
  support: ResumeSupport;
  explanation: string;
  files: string[];
}

export interface ResumeVerification {
  claims: ResumeClaimVerification[];
  disclaimer: string;
}

export interface JobRequirementMatch {
  requirement: string;
  importance: "required" | "preferred" | "context";
  support: "Strong match" | "Partial match" | "No repository evidence";
  explanation: string;
  files: string[];
}

export interface JobMatch {
  strongMatches: JobRequirementMatch[];
  partialMatches: JobRequirementMatch[];
  unsupportedRequirements: JobRequirementMatch[];
  summary: string;
  scoringMethod: string;
}

export interface InterviewQuestion {
  question: string;
  relatedSkill: string;
  difficulty: "Foundational" | "Intermediate" | "Advanced";
  files: string[];
  relevance: string;
  origin: EvidenceOrigin;
}

export type AnalysisStage =
  | "fetching_repository"
  | "detecting_technologies"
  | "selecting_files"
  | "analyzing_architecture"
  | "verifying_evidence"
  | "generating_interview"
  | "completed";

export interface AnalysisWarning {
  code: string;
  message: string;
}

export interface AnalysisMetadata {
  analysisId: string;
  analyzedAt: string;
  durationMs: number;
  selectedFileCount: number;
  inspectedTreeFileCount: number;
  selectedBytes: number;
  cacheHit: boolean;
  aiProvider: string | null;
  aiModel: string | null;
  warnings: AnalysisWarning[];
}

export interface AnalysisResult {
  repository: RepositoryMetadata;
  languages: Record<string, number>;
  technologies: TechnologySignal[];
  projectType: ProjectType;
  architecture: ArchitectureSummary;
  skills: SkillEvidence[];
  gaps: EvidenceGap[];
  resumeVerification: ResumeVerification | null;
  jobMatch: JobMatch | null;
  interviewQuestions: InterviewQuestion[];
  selectedFiles: Array<Pick<SelectedFile, "path" | "size" | "truncated" | "selectionReason">>;
  metadata: AnalysisMetadata;
}

export interface AnalysisInput {
  repositoryUrl: string;
  resumeText?: string;
  jobDescription?: string;
}
