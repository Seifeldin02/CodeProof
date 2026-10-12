/** Additive schema only. Historical remediation migration checksums remain unchanged. */
export const SQLITE_INTERVIEW_SCHEMA = `
  CREATE TABLE IF NOT EXISTS interview_sessions (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    preparation_json TEXT NOT NULL,
    assessment_json TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('draft', 'completed')),
    revision INTEGER NOT NULL CHECK(revision > 0),
    is_demo INTEGER NOT NULL CHECK(is_demo IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT,
    communicated_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_interview_sessions_owner ON interview_sessions(owner_user_id, updated_at DESC);
  CREATE TRIGGER IF NOT EXISTS interview_preparation_immutable BEFORE UPDATE ON interview_sessions
    WHEN NEW.preparation_json <> OLD.preparation_json OR NEW.owner_user_id <> OLD.owner_user_id OR NEW.candidate_id <> OLD.candidate_id
    BEGIN SELECT RAISE(ABORT, 'Interview preparation and ownership are immutable'); END;
  CREATE TRIGGER IF NOT EXISTS interview_completed_immutable BEFORE UPDATE ON interview_sessions
    WHEN OLD.status = 'completed' AND (NEW.assessment_json <> OLD.assessment_json OR NEW.status <> OLD.status)
    BEGIN SELECT RAISE(ABORT, 'Completed interview assessment is immutable'); END;
`;

export const POSTGRES_INTERVIEW_SCHEMA = `
  CREATE TABLE IF NOT EXISTS codeproof_interview_sessions (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL REFERENCES codeproof_users(id) ON DELETE CASCADE,
    candidate_id TEXT NOT NULL REFERENCES codeproof_candidates(id) ON DELETE CASCADE,
    preparation_json JSONB NOT NULL,
    assessment_json JSONB NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('draft', 'completed')),
    revision INTEGER NOT NULL CHECK(revision > 0),
    is_demo BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    communicated_at TIMESTAMPTZ
  );
  CREATE INDEX IF NOT EXISTS idx_codeproof_interview_sessions_owner ON codeproof_interview_sessions(owner_user_id, updated_at DESC);
  CREATE OR REPLACE FUNCTION codeproof_guard_interview_update() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    IF NEW.preparation_json IS DISTINCT FROM OLD.preparation_json OR NEW.owner_user_id <> OLD.owner_user_id OR NEW.candidate_id <> OLD.candidate_id THEN
      RAISE EXCEPTION 'Interview preparation and ownership are immutable';
    END IF;
    IF OLD.status = 'completed' AND (NEW.assessment_json IS DISTINCT FROM OLD.assessment_json OR NEW.status <> OLD.status) THEN
      RAISE EXCEPTION 'Completed interview assessment is immutable';
    END IF;
    RETURN NEW;
  END; $$;
  DROP TRIGGER IF EXISTS codeproof_interview_immutable ON codeproof_interview_sessions;
  CREATE TRIGGER codeproof_interview_immutable BEFORE UPDATE ON codeproof_interview_sessions FOR EACH ROW EXECUTE FUNCTION codeproof_guard_interview_update();
`;
