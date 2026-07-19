import { db } from '../database';
import type { RepoSkillEvidence, RepositoryEvidence } from '../../../src/lib/apiTypes';

interface RepoRow {
  id: string;
  candidate_id: string;
  name: string;
  url: string;
  primary_language: string;
  stars: number;
  summary: string;
  verified_overall: number;
  analyzed_at: string;
  candidate_name: string;
  role: string;
}

interface SkillRow {
  repository_id: string;
  skill: string;
  score: number;
  evidence: string;
}

const SELECT_REPOS = `
  SELECT r.*, c.name AS candidate_name, c.role AS role
  FROM repositories r
  JOIN candidates c ON c.id = r.candidate_id
`;

function toEvidence(row: RepoRow, skills: RepoSkillEvidence[]): RepositoryEvidence {
  return {
    id: row.id,
    candidateId: row.candidate_id,
    candidateName: row.candidate_name,
    role: row.role,
    name: row.name,
    url: row.url,
    primaryLanguage: row.primary_language,
    stars: row.stars,
    summary: row.summary,
    verifiedOverall: row.verified_overall,
    analyzedAt: row.analyzed_at,
    skills,
  };
}

export function getAllRepositories(): RepositoryEvidence[] {
  const rows = db.prepare(`${SELECT_REPOS} ORDER BY r.verified_overall DESC`).all() as unknown as RepoRow[];
  const skillRows = db
    .prepare('SELECT repository_id, skill, score, evidence FROM repo_skills ORDER BY score DESC')
    .all() as unknown as SkillRow[];

  const byRepo = new Map<string, RepoSkillEvidence[]>();
  for (const s of skillRows) {
    const arr = byRepo.get(s.repository_id) ?? [];
    arr.push({ skill: s.skill, score: s.score, evidence: s.evidence });
    byRepo.set(s.repository_id, arr);
  }

  return rows.map((r) => toEvidence(r, byRepo.get(r.id) ?? []));
}

export function getRepositoryByCandidate(candidateId: string): RepositoryEvidence | null {
  const row = db.prepare(`${SELECT_REPOS} WHERE r.candidate_id = ?`).get(candidateId) as RepoRow | undefined;
  if (!row) return null;
  const skillRows = db
    .prepare('SELECT repository_id, skill, score, evidence FROM repo_skills WHERE repository_id = ? ORDER BY score DESC')
    .all(row.id) as unknown as SkillRow[];
  const skills: RepoSkillEvidence[] = skillRows.map((s) => ({
    skill: s.skill,
    score: s.score,
    evidence: s.evidence,
  }));
  return toEvidence(row, skills);
}
