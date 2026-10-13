import { describe, expect, it } from "vitest";
import { CandidateStore } from "@/features/candidates/store";
import { loadSqliteAdminOverview } from "./overview";

describe("owner operations overview", () => {
  it("counts persisted activity, separates demo candidates and excludes credential material", () => {
    const store = new CandidateStore(":memory:");
    const db = store.db;
    try {
      db.prepare("INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)")
        .run("owner", "owner@example.test", "scrypt$private$hash", "2026-01-01T00:00:00.000Z");
      db.prepare("INSERT INTO users (id, email, password_hash, created_at, lifecycle_state) VALUES (?, ?, ?, ?, ?)")
        .run("suspended", "suspended@example.test", "scrypt$private$hash", "2026-01-02T00:00:00.000Z", "suspended");
      const addCandidate = db.prepare(`INSERT INTO candidates
        (id, owner_user_id, name, role, source, evidence_index, applied_at, outcome, furthest_stage, is_demo)
        VALUES (?, 'owner', ?, 'Backend Engineer', 'manual', 0, '2026-01-03T00:00:00.000Z', 'in_progress', 'applied', ?)`);
      addCandidate.run("real", "Real candidate", 0);
      addCandidate.run("demo", "Demo candidate", 1);
      db.prepare(`INSERT INTO candidate_analyses
        (id, candidate_id, repository_url, repository_name, project_type, evidence_index, summary, analyzed_at, analysis_json)
        VALUES ('analysis', 'real', 'https://github.com/example/repo', 'example/repo', 'library', 0, '', '2026-01-03T00:00:00.000Z', '{}')`).run();
      db.prepare(`INSERT INTO interview_sessions
        (id, owner_user_id, candidate_id, preparation_json, assessment_json, status, revision, is_demo, created_at, updated_at)
        VALUES ('interview', 'owner', 'real', '{}', '{}', 'completed', 1, 0, '2026-01-03T00:00:00.000Z', '2026-01-03T00:00:00.000Z')`).run();

      const overview = loadSqliteAdminOverview(db);
      expect(overview.totals).toEqual({
        accounts: 2, activeAccounts: 1, realCandidates: 1, demoCandidates: 1,
        repositoryAnalyses: 1, completedInterviews: 1,
      });
      expect(overview.accounts.map((item) => item.email)).toEqual(["suspended@example.test", "owner@example.test"]);
      expect(overview.accounts[0].lifecycleState).toBe("suspended");
      expect(JSON.stringify(overview)).not.toContain("scrypt$");
    } finally {
      db.close();
    }
  });
});
