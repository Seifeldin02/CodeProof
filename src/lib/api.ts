import type { CandidateRecord } from '../features/hiring-analytics/types';
import type { CandidateDetail, PersistedInsight, RepositoryEvidence } from './apiTypes';

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

/** Typed client for the CodeProof backend (proxied at /api in dev). */
export const api = {
  candidates: () => getJson<CandidateRecord[]>('/api/candidates'),
  candidate: (id: string) => getJson<CandidateDetail>(`/api/candidates/${encodeURIComponent(id)}`),
  repositories: () => getJson<RepositoryEvidence[]>('/api/repositories'),
  insights: () => getJson<PersistedInsight[]>('/api/insights'),
};
