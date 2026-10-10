import { getPostgresPool } from "@/features/persistence/postgres";
import type { CandidateRecord, EvidenceProfile } from "@/features/hiring-analytics/types";
import type { SkillEvidence } from "@/types/analysis";
import { buildEvidenceProfile, EMPTY_EVIDENCE_PROFILE } from "./evidence-profile";
import { CandidateStore, getCandidateStore } from "./store";

/**
 * Read model for list screens. A list of candidates needs each one's evidence
 * profile, and loading every full dossier for that would cost several queries
 * per row. This reads only the stored skill levels, in one owner-scoped query.
 */

type StoredSkills = Array<Pick<SkillEvidence, "skill" | "level">>;

interface SkillRow {
  candidate_id: string;
  skills: string | StoredSkills | null;
}

function parseSkills(value: SkillRow["skills"]): StoredSkills {
  if (!value) return [];
  if (typeof value !== "string") return Array.isArray(value) ? value : [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed as StoredSkills : [];
  } catch {
    return [];
  }
}

async function skillRows(ownerUserId: string): Promise<SkillRow[]> {
  const pool = getPostgresPool();
  if (pool) {
    const result = await pool.query<SkillRow>(
      `SELECT a.candidate_id, a.analysis_json->'skills' AS skills
       FROM codeproof_candidate_analyses a
       JOIN codeproof_candidates c ON c.id = a.candidate_id
       WHERE c.owner_user_id = $1`,
      [ownerUserId],
    );
    return result.rows;
  }
  const store = getCandidateStore();
  if (!(store instanceof CandidateStore)) return [];
  return store.db.prepare(
    `SELECT a.candidate_id, json_extract(a.analysis_json, '$.skills') AS skills
     FROM candidate_analyses a
     JOIN candidates c ON c.id = a.candidate_id
     WHERE c.owner_user_id = ?`,
  ).all(ownerUserId) as unknown as SkillRow[];
}

/** Profiles keyed by candidate id. Candidates with no analysed repository are absent. */
export async function loadEvidenceProfiles(ownerUserId: string): Promise<Map<string, EvidenceProfile>> {
  const byCandidate = new Map<string, StoredSkills[]>();
  for (const row of await skillRows(ownerUserId)) {
    const repositories = byCandidate.get(row.candidate_id) ?? [];
    repositories.push(parseSkills(row.skills));
    byCandidate.set(row.candidate_id, repositories);
  }
  return new Map([...byCandidate].map(([candidateId, repositories]) => [candidateId, buildEvidenceProfile(repositories)]));
}

/**
 * Attaches a profile to every record that was already listed for this owner.
 * Call it after `listCandidates`, which is what creates the tables it reads.
 */
export async function withEvidenceProfiles<T extends CandidateRecord>(ownerUserId: string, candidates: T[]): Promise<T[]> {
  if (candidates.length === 0) return candidates;
  const profiles = await loadEvidenceProfiles(ownerUserId);
  return candidates.map((candidate) => ({ ...candidate, evidence: profiles.get(candidate.id) ?? EMPTY_EVIDENCE_PROFILE }));
}
