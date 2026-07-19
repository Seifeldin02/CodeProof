import { db } from '../database';
import type {
  CandidateRecord,
  CandidateOutcome,
  PipelineStage,
  Role,
  SourceChannel,
  StageEvent,
} from '../../../src/features/hiring-analytics/types';

interface CandidateRow {
  id: string;
  name: string;
  role: string;
  source: string;
  verified_skill_score: number;
  applied_at: string;
  outcome: string;
  furthest_stage: string;
}

interface StageRow {
  candidate_id: string;
  stage: string;
  entered_at: string;
}

function toRecord(row: CandidateRow, events: StageEvent[]): CandidateRecord {
  return {
    id: row.id,
    name: row.name,
    role: row.role as Role,
    source: row.source as SourceChannel,
    verifiedSkillScore: row.verified_skill_score,
    appliedAt: row.applied_at,
    outcome: row.outcome as CandidateOutcome,
    furthestStage: row.furthest_stage as PipelineStage,
    stageHistory: events,
  };
}

export function getAllCandidates(): CandidateRecord[] {
  const rows = db.prepare('SELECT * FROM candidates ORDER BY applied_at DESC').all() as unknown as CandidateRow[];
  const eventRows = db
    .prepare('SELECT candidate_id, stage, entered_at FROM stage_events ORDER BY entered_at ASC')
    .all() as unknown as StageRow[];

  const byCandidate = new Map<string, StageEvent[]>();
  for (const e of eventRows) {
    const arr = byCandidate.get(e.candidate_id) ?? [];
    arr.push({ stage: e.stage as PipelineStage, enteredAt: e.entered_at });
    byCandidate.set(e.candidate_id, arr);
  }

  return rows.map((r) => toRecord(r, byCandidate.get(r.id) ?? []));
}

export function getCandidateById(id: string): CandidateRecord | null {
  const row = db.prepare('SELECT * FROM candidates WHERE id = ?').get(id) as CandidateRow | undefined;
  if (!row) return null;
  const eventRows = db
    .prepare('SELECT candidate_id, stage, entered_at FROM stage_events WHERE candidate_id = ? ORDER BY entered_at ASC')
    .all(id) as unknown as StageRow[];
  const events: StageEvent[] = eventRows.map((e) => ({
    stage: e.stage as PipelineStage,
    enteredAt: e.entered_at,
  }));
  return toRecord(row, events);
}
