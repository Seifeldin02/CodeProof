import type { CandidateRecord } from '../../src/features/hiring-analytics/types';

/**
 * DEMO repository-evidence generator.
 *
 * Produces plausible, deterministic "verified skill" evidence for a candidate
 * so the recruiter-facing Repository Analysis view has something to render.
 * These rows STAND IN FOR the intelligence engine (Codex) output — real
 * GitHub ingestion + AI verification should replace this seed. Kept isolated
 * and clearly labelled as demo data.
 */

export interface SeedRepo {
  id: string;
  name: string;
  url: string;
  primaryLanguage: string;
  stars: number;
  summary: string;
  verifiedOverall: number;
  skills: { skill: string; score: number; evidence: string }[];
}

const LANG_BY_ROLE: Record<string, string> = {
  'Frontend Engineer': 'TypeScript',
  'Backend Engineer': 'Go',
  'Full-Stack Engineer': 'TypeScript',
  'Data Engineer': 'Python',
  'DevOps Engineer': 'Go',
};

const SKILLS_BY_ROLE: Record<string, string[]> = {
  'Frontend Engineer': ['React', 'TypeScript', 'CSS Architecture', 'Accessibility', 'State Management'],
  'Backend Engineer': ['API Design', 'Concurrency', 'SQL', 'Caching', 'Testing'],
  'Full-Stack Engineer': ['React', 'Node.js', 'REST APIs', 'SQL', 'CI/CD'],
  'Data Engineer': ['Python', 'ETL Pipelines', 'SQL', 'Data Modeling', 'Orchestration'],
  'DevOps Engineer': ['Kubernetes', 'Terraform', 'CI/CD', 'Observability', 'Cloud'],
};

const PROJECT_WORDS = ['engine', 'platform', 'toolkit', 'service', 'core', 'studio', 'pipeline', 'kit'];

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z]+/g, '');
}

function evidenceFor(skill: string, score: number, seed: number): string {
  const files = 2 + (seed % 6);
  const commits = 18 + (seed % 140);
  const strength = score >= 80 ? 'Strong' : score >= 60 ? 'Consistent' : 'Some';
  return `${strength} usage across ${files} modules — ${commits} commits touch ${skill.toLowerCase()}.`;
}

export function buildRepoForCandidate(candidate: CandidateRecord): SeedRepo {
  const h = hashStr(candidate.id);
  const lang = LANG_BY_ROLE[candidate.role] ?? 'TypeScript';
  const skillPool = SKILLS_BY_ROLE[candidate.role] ?? SKILLS_BY_ROLE['Full-Stack Engineer'];
  const word = PROJECT_WORDS[h % PROJECT_WORDS.length];
  const owner = slug(candidate.name) || 'dev';
  const name = `${owner}/${word}`;

  const overall = candidate.verifiedSkillScore;
  const skills = skillPool.slice(0, 4).map((skill, i) => {
    const offset = ((hashStr(candidate.id + skill) % 21) - 10); // -10..10
    const score = clamp(overall + offset, 15, 99);
    return { skill, score, evidence: evidenceFor(skill, score, h + i * 7) };
  });

  const top = [...skills].sort((a, b) => b.score - a.score);
  const band = overall >= 80 ? 'strong' : overall >= 60 ? 'solid' : 'emerging';

  return {
    id: `repo-${candidate.id}`,
    name,
    url: `https://github.com/${name}`,
    primaryLanguage: lang,
    stars: (h % 380) + (overall >= 80 ? 60 : 0),
    summary: `${candidate.role} project with ${band} evidence in ${top[0].skill} and ${top[1].skill}.`,
    verifiedOverall: overall,
    skills,
  };
}
