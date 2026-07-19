import type { CandidateRecord, DerivedInsight } from '../features/hiring-analytics/types';

/** Shared API payload types (used by both the frontend and the thin backend). */

export interface RepoSkillEvidence {
  skill: string;
  score: number;
  evidence: string;
}

export interface RepositoryEvidence {
  id: string;
  candidateId: string;
  candidateName: string;
  role: string;
  name: string;
  url: string;
  primaryLanguage: string;
  stars: number;
  summary: string;
  verifiedOverall: number;
  analyzedAt: string;
  skills: RepoSkillEvidence[];
}

/** A hiring insight as persisted in the database (vs. an ad-hoc text line). */
export interface PersistedInsight extends DerivedInsight {
  category: string;
  createdAt: string;
}

export type CandidateDetail = CandidateRecord & {
  repository: RepositoryEvidence | null;
};
