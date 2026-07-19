export type EvidenceLevel =
  | "Strong Evidence"
  | "Good Evidence"
  | "Partial Evidence"
  | "Limited Evidence"
  | "Insufficient Evidence";

export type EvidenceOrigin = "deterministic" | "ai_interpretation";

export type InformationSource =
  | "Deterministic Fact"
  | "AI Interpretation"
  | "Candidate Claim"
  | "Job Requirement";

export interface RepositoryMetadata {
  owner: string;
  name: string;
  url: string;
  description: string | null;
  defaultBranch: string;
  commitSha: string;
  stars: number | null;
  forks: number | null;
  openIssues: number | null;
  license: string | null;
  updatedAt: string | null;
  isFork: boolean | null;
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
  source: "Deterministic Fact";
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
  source: "Deterministic Fact" | "AI Interpretation";
}

export interface EvidenceItem {
  file: string;
  summary: string;
  implementationExample: string;
  origin: EvidenceOrigin;
  source: "Deterministic Fact" | "AI Interpretation";
}

export interface SkillEvidence {
  skill: string;
  level: EvidenceLevel;
  explanation: string;
  evidence: EvidenceItem[];
  origin: EvidenceOrigin;
  source: "Deterministic Fact" | "AI Interpretation";
}

export interface EvidenceGap {
  area: string;
  explanation: string;
  checkedFiles: string[];
  origin: EvidenceOrigin;
  source: "Deterministic Fact" | "AI Interpretation";
}

export interface EngineeringPattern {
  name: string;
  category:
    | "architecture"
    | "api"
    | "authentication"
    | "database"
    | "state-management"
    | "testing"
    | "error-handling"
    | "observability";
  summary: string;
  files: string[];
  source: "Deterministic Fact";
}

export interface ComplexityIndicators {
  repositoryFiles: number;
  selectedEvidenceFiles: number;
  topLevelAreas: number;
  languages: number;
  architecturalBoundaries: number;
  testFiles: number;
  signals: string[];
  source: "Deterministic Fact";
}

export interface RepositoryStrength {
  title: string;
  explanation: string;
  files: string[];
  source: "Deterministic Fact";
}

export type ResumeSupport =
  | "Strongly Supported"
  | "Supported"
  | "Partially Supported"
  | "No Repository Evidence";

export interface ResumeClaimVerification {
  claim: string;
  category:
    | "technology"
    | "framework"
    | "language"
    | "cloud_platform"
    | "database"
    | "role"
    | "experience"
    | "project"
    | "engineering";
  support: ResumeSupport;
  explanation: string;
  files: string[];
  source: "Candidate Claim";
}

export interface ResumeVerification {
  claims: ResumeClaimVerification[];
  disclaimer: string;
  extractionMethod: "ai" | "deterministic";
}

export interface ExtractedResumeClaim {
  claim: string;
  category: ResumeClaimVerification["category"];
  source: "Candidate Claim";
}

export interface JobRequirementMatch {
  requirement: string;
  importance: "required" | "preferred" | "context";
  category: "skill" | "responsibility" | "seniority" | "experience" | "domain";
  support: "Strong match" | "Partial match" | "No repository evidence";
  explanation: string;
  files: string[];
  source: "Job Requirement";
}

export interface JobMatch {
  strongMatches: JobRequirementMatch[];
  partialMatches: JobRequirementMatch[];
  unsupportedRequirements: JobRequirementMatch[];
  summary: string;
  scoringMethod: string;
  extractionMethod: "ai" | "deterministic";
}

export interface ExtractedJobRequirement {
  requirement: string;
  importance: JobRequirementMatch["importance"];
  category: JobRequirementMatch["category"];
  source: "Job Requirement";
}

export interface InterviewQuestion {
  question: string;
  relatedSkill: string;
  difficulty: "Foundational" | "Intermediate" | "Advanced";
  files: string[];
  relevance: string;
  origin: EvidenceOrigin;
  source: "Deterministic Fact" | "AI Interpretation";
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
  cacheStorage: "postgres" | "filesystem" | "memory" | "disabled";
  engineVersion: string;
  aiProvider: string | null;
  aiModel: string | null;
  aiStatus: "completed" | "unavailable_not_configured" | "unavailable_failed";
  aiUnavailableReason: string | null;
  warnings: AnalysisWarning[];
}

export interface AnalysisResult {
  repository: RepositoryMetadata;
  languages: Record<string, number>;
  technologies: TechnologySignal[];
  projectType: ProjectType;
  architecture: ArchitectureSummary;
  patterns: EngineeringPattern[];
  complexity: ComplexityIndicators;
  strengths: RepositoryStrength[];
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
