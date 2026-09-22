import type { CandidateRecord } from "@/features/hiring-analytics/types";
import type { CanonicalLegacyAnalysisView } from "@/features/persistence/legacy-adapters";
import type { AnalysisResult } from "@/types/analysis";
import type { AttributionStatus, DiscoveryOrigin } from "@/types/remediation";

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
  attributionStatus?: AttributionStatus;
  /** Additive canonical compatibility view; legacy aggregate fields above remain unchanged. */
  remediation?: CanonicalLegacyAnalysisView;
}

export interface CandidateDetail extends CandidateRecord {
  analyses: CandidateRepositoryAnalysis[];
  repositoryOutcomes: CandidateRepositoryOutcome[];
  repositories: CandidateRepositoryRelationship[];
}

export interface CandidateRepositoryRelationship {
  id: string;
  candidateId: string;
  repositoryUrl: string;
  repositoryOwner: string | null;
  repositoryName: string;
  discoveryOrigin: DiscoveryOrigin | null;
  attributionStatus: AttributionStatus;
  attributionUpdatedAt: string;
  verificationRevision: string | null;
  originConfirmationRequired: boolean;
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
