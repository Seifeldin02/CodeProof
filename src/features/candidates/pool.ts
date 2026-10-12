import type { CandidateRecord } from "@/features/hiring-analytics/types";
import { skillsNamedBy, statedRoleOf } from "@/features/resume-matching/claims";
import { statedWorkMonths } from "@/features/resume-matching/experience";
import { canonicalSkill, skillMentions, skillsCoveredBy } from "@/features/resume-matching/skills";
import type { ExtractedResumeClaim } from "@/types/analysis";

/** What one applicant's CV says, as the pool list shows it. Candidate-reported throughout. */
export interface PoolCv {
  /** The role the CV's own headline states, when it has one. */
  statedRole: string | null;
  /** The skills the CV names, in its own order. */
  skills: string[];
  /** Those skills and the ones they cannot be used without, so a search for Python finds a CV that names Django. */
  covered: string[];
  /** Whole months of dated work, or null when the CV dates none. */
  workMonths: number | null;
}

export function poolCv(claims: ExtractedResumeClaim[], today: string): PoolCv {
  const skills = skillsNamedBy(claims);
  return { statedRole: statedRoleOf(claims), skills, covered: [...skillsCoveredBy(skills).keys()], workMonths: statedWorkMonths(claims, today) };
}

/** Which applicants to list: everyone, those with public code read, or those known from a CV only. */
export type PoolSource = "all" | "code" | "cv";

export interface PoolQuery {
  /** Listed skills the search names. An applicant must cover every one of them. */
  skills: string[];
  /** Everything else that was typed. Each word must appear in the applicant's name, role or skills. */
  words: string[];
}

/** Words that join a search together and say nothing about an applicant. */
const JOINING_WORDS = new Set(["and", "or", "with", "the", "in", "of", "plus", "&", "+", "و", "أو", "مع"]);

/**
 * Reads a search box the way a recruiter types into one: "react postgres riyadh" names two skills and one other word.
 * A skill may be typed in any letter case here, because nobody searching for "go" means the verb.
 */
export function readPoolQuery(query: string): PoolQuery {
  const mentions = skillMentions(query);
  let rest = query;
  for (const mention of mentions) rest = rest.slice(0, mention.start) + " ".repeat(mention.end - mention.start) + rest.slice(mention.end);
  const skills = new Set(mentions.map((mention) => mention.name));
  const words: string[] = [];
  for (const word of rest.split(/[\s,;]+/).filter(Boolean)) {
    const listed = canonicalSkill(word);
    if (listed) skills.add(listed);
    else if (!JOINING_WORDS.has(word.toLowerCase())) words.push(word.toLowerCase());
  }
  return { skills: [...skills], words };
}

/** The skills on one CV that answer a search, so the list can show why an applicant was found. */
export function matchingSkills(own: PoolCv | undefined, query: PoolQuery): string[] {
  if (!own) return [];
  return own.skills.filter((skill) => query.skills.some((asked) => skillsCoveredBy([skill]).has(asked))
    || query.words.some((word) => skill.toLowerCase().startsWith(word)));
}

/** The applicants a search and a source filter leave, in the order they were given. */
export function searchPool<T extends CandidateRecord>(candidates: T[], cv: Readonly<Record<string, PoolCv>>, query: string, source: PoolSource = "all"): T[] {
  const { skills, words } = readPoolQuery(query);
  return candidates.filter((candidate) => {
    const hasCode = (candidate.repositoryCount ?? 0) > 0;
    if ((source === "code" && !hasCode) || (source === "cv" && hasCode)) return false;
    const own = cv[candidate.id];
    if (!skills.every((skill) => own?.covered.includes(skill))) return false;
    const text = `${candidate.name} ${candidate.role} ${own?.statedRole ?? ""}`.toLowerCase();
    // A word still being typed finds a skill by its beginning, so "kub" already finds Kubernetes.
    return words.every((word) => text.includes(word) || Boolean(own?.skills.some((skill) => skill.toLowerCase().startsWith(word))));
  });
}
