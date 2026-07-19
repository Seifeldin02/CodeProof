import { db } from './database';
import { createSchema } from './schema';
import { buildRepoForCandidate } from './repoSeed';
import { mockCandidates } from '../../src/features/hiring-analytics/mock/mockHiringData';
import { deriveInsights } from '../../src/features/hiring-analytics/analytics';
import type { DerivedInsight } from '../../src/features/hiring-analytics/types';

const INSIGHT_CATEGORY: Record<string, string> = {
  'biggest-dropoff': 'funnel',
  'best-source': 'source',
  'skills-signal': 'skills',
  'tth-trend': 'velocity',
};

function countCandidates(): number {
  const row = db.prepare('SELECT COUNT(*) AS n FROM candidates').get() as { n: number };
  return row.n;
}

function seedAll(): void {
  const insCand = db.prepare(
    `INSERT INTO candidates
       (id, name, role, source, verified_skill_score, applied_at, outcome, furthest_stage)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insEvent = db.prepare(
    `INSERT INTO stage_events (candidate_id, stage, entered_at) VALUES (?, ?, ?)`,
  );
  const insRepo = db.prepare(
    `INSERT INTO repositories
       (id, candidate_id, name, url, primary_language, stars, summary, verified_overall, analyzed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insSkill = db.prepare(
    `INSERT INTO repo_skills (repository_id, skill, score, evidence) VALUES (?, ?, ?, ?)`,
  );
  const insInsight = db.prepare(
    `INSERT INTO insights (id, tone, category, text, created_at) VALUES (?, ?, ?, ?, ?)`,
  );

  const now = new Date().toISOString();

  db.exec('BEGIN');
  try {
    for (const c of mockCandidates) {
      insCand.run(c.id, c.name, c.role, c.source, c.verifiedSkillScore, c.appliedAt, c.outcome, c.furthestStage);
      for (const e of c.stageHistory) {
        insEvent.run(c.id, e.stage, e.enteredAt);
      }

      const repo = buildRepoForCandidate(c);
      insRepo.run(
        repo.id, c.id, repo.name, repo.url, repo.primaryLanguage,
        repo.stars, repo.summary, repo.verifiedOverall, now,
      );
      for (const s of repo.skills) {
        insSkill.run(repo.id, s.skill, s.score, s.evidence);
      }
    }

    const insights: DerivedInsight[] = deriveInsights(mockCandidates);
    for (const ins of insights) {
      insInsight.run(ins.id, ins.tone, INSIGHT_CATEGORY[ins.id] ?? 'general', ins.text, now);
    }

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/** Creates the schema and seeds demo data only if the DB is empty. */
export function seedIfEmpty(): void {
  createSchema();
  if (countCandidates() === 0) {
    seedAll();
    console.log(`[codeproof] seeded ${mockCandidates.length} demo candidates`);
  }
}

// Allow running directly: `npm run seed`
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('seed.ts')) {
  seedIfEmpty();
}
