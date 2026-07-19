import { db } from './database';

/** Creates all tables if they do not yet exist. Safe to call on every boot. */
export function createSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS candidates (
      id                   TEXT PRIMARY KEY,
      name                 TEXT NOT NULL,
      role                 TEXT NOT NULL,
      source               TEXT NOT NULL,
      verified_skill_score INTEGER NOT NULL,
      applied_at           TEXT NOT NULL,
      outcome              TEXT NOT NULL,
      furthest_stage       TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stage_events (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      candidate_id TEXT NOT NULL REFERENCES candidates(id),
      stage        TEXT NOT NULL,
      entered_at   TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_stage_events_candidate
      ON stage_events(candidate_id);

    -- Repository analysis output. Populated here with demo evidence; the real
    -- rows are produced by the intelligence engine (Codex) GitHub ingestion +
    -- AI verification pipeline. This is the integration seam.
    CREATE TABLE IF NOT EXISTS repositories (
      id               TEXT PRIMARY KEY,
      candidate_id     TEXT NOT NULL REFERENCES candidates(id),
      name             TEXT NOT NULL,
      url              TEXT NOT NULL,
      primary_language TEXT NOT NULL,
      stars            INTEGER NOT NULL,
      summary          TEXT NOT NULL,
      verified_overall INTEGER NOT NULL,
      analyzed_at      TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS repo_skills (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      repository_id TEXT NOT NULL REFERENCES repositories(id),
      skill         TEXT NOT NULL,
      score         INTEGER NOT NULL,
      evidence      TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_repo_skills_repo
      ON repo_skills(repository_id);

    -- Persisted hiring insights (derived from the pipeline, stored as rows
    -- rather than rendered as ad-hoc text).
    CREATE TABLE IF NOT EXISTS insights (
      id         TEXT PRIMARY KEY,
      tone       TEXT NOT NULL,
      category   TEXT NOT NULL,
      text       TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
}
