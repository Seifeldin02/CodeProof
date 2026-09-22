import type { CandidateRecord } from "@/features/hiring-analytics/types";
import type { CanonicalLegacyAnalysisView } from "@/features/persistence/legacy-adapters";
import type { AnalysisResult } from "@/types/analysis";

export interface CandidateRepositoryAnalysis {
  id: string;
  candidateId: string;
  repositoryUrl: string;
  repositoryName: string;
  primaryLanguage: string | null;
  projectType: string;
  evidenceIndex: number;
  summary: string;
  analyzedAt: string;
  result: AnalysisResult;
  /** Additive canonical compatibility view; legacy aggregate fields above remain unchanged. */
  remediation?: CanonicalLegacyAnalysisView;
}

export interface CandidateDetail extends CandidateRecord {
  analyses: CandidateRepositoryAnalysis[];
  repositoryOutcomes: CandidateRepositoryOutcome[];
}

export interface RepositoryFailure {
  repositoryUrl: string;
  code: string;
  message: string;
}

export type RepositoryOutcomeStatus = "analyzed" | "failed";

export interface CandidateRepositoryOutcome {
  id: string;
  candidateId: string;
  repositoryUrl: string;
  repositoryName: string;
  status: RepositoryOutcomeStatus;
  code: string | null;
  message: string | null;
  updatedAt: string;
}
