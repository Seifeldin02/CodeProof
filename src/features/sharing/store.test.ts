import { describe, expect, it } from "vitest";
import { CandidateStore } from "@/features/candidates/store";
import { SqliteShareStore, type SharedReport } from "./store";

const report: SharedReport = {
  version: 1, candidateName: "Test candidate", role: "Backend Engineer", isDemo: false,
  repositoryName: "example/repo", repositoryUrl: "https://github.com/example/repo",
  attributionStatus: "candidate_claimed", analyzedAt: "2026-01-03T00:00:00.000Z",
  summary: "Bounded source review.", citationStatus: "grounded_findings",
  skills: [{ skill: "TypeScript", level: "Partial Evidence", explanation: "Seen in source.", files: ["src/index.ts"] }],
  citations: [{ filePath: "src/index.ts", startLine: 1, endLine: 4,
    sourceLink: "https://github.com/example/repo/blob/commit/src/index.ts#L1-L4", evidenceLevel: "partial" }],
  questions: [{ question: "Explain this implementation.", files: ["src/index.ts"] }],
};

function fixture() {
  const db = new CandidateStore(":memory:").db;
  db.prepare("INSERT INTO users (id, email, password_hash, created_at) VALUES ('owner', 'owner@example.test', 'hash', '2026-01-01T00:00:00.000Z')").run();
  db.prepare("INSERT INTO users (id, email, password_hash, created_at) VALUES ('other', 'other@example.test', 'hash', '2026-01-01T00:00:00.000Z')").run();
  db.prepare(`INSERT INTO candidates
    (id, owner_user_id, name, role, source, evidence_index, applied_at, outcome, furthest_stage)
    VALUES ('candidate', 'owner', 'Test candidate', 'Backend Engineer', 'manual', 0,
    '2026-01-03T00:00:00.000Z', 'in_progress', 'applied')`).run();
  db.prepare(`INSERT INTO analysis_versions
    (id, owner_user_id, candidate_id, status, analyzed_at, deterministic_engine_version, taxonomy_version, created_at)
    VALUES ('analysis', 'owner', 'candidate', 'completed', '2026-01-03T00:00:00.000Z', 'test-v1', 'tax-v1', '2026-01-03T00:00:00.000Z')`).run();
  return { db, store: new SqliteShareStore(db) };
}

describe("external evidence links", () => {
  it("persists only a token digest and an immutable, bounded report; rejects foreign owners", async () => {
    const { db, store } = fixture();
    try {
      expect(await store.create("other", "candidate", "analysis", report, "7d")).toBeNull();
      const created = await store.create("owner", "candidate", "analysis", report, "7d");
      expect(created).not.toBeNull();
      expect(created!.token).toMatch(/^[A-Za-z0-9_-]{43}$/u);
      const persisted = db.prepare("SELECT token_digest FROM external_shares WHERE id = ?").get(created!.share.id) as { token_digest: string };
      expect(persisted.token_digest).toMatch(/^[0-9a-f]{64}$/u);
      expect(persisted.token_digest).not.toBe(created!.token);
      expect(await store.list("other", "candidate")).toEqual([]);
      expect((await store.list("owner", "candidate"))[0]).toMatchObject({ status: "active", openCount: 0, lastOpenedAt: null });
      expect(created!.share).toMatchObject({ openCount: 0, lastOpenedAt: null });
      db.prepare("UPDATE candidates SET name = 'Changed later' WHERE id = 'candidate'").run();
      expect((await store.resolve(created!.token, "0".repeat(64), "vitest"))?.candidateName).toBe("Test candidate");
      expect(await store.resolve("wrong", "0".repeat(64), "vitest")).toBeNull();
      expect((await store.resolve(created!.token, "1".repeat(64), "vitest"))?.candidateName).toBe("Test candidate");
      // The owner can see that the report was read twice, and when. A wrong token belongs to no link and counts for none.
      const read = (await store.list("owner", "candidate"))[0];
      expect(read.openCount).toBe(2);
      expect(Date.parse(read.lastOpenedAt ?? "")).toBeGreaterThan(Date.parse(created!.share.createdAt) - 1);
      expect(await store.revoke("other", "candidate", created!.share.id)).toBe(false);
      expect(await store.revoke("owner", "candidate", created!.share.id)).toBe(true);
      expect(await store.resolve(created!.token, "0".repeat(64), "vitest")).toBeNull();
      // A refused attempt after the link was withdrawn is logged, and is not an opening of the report.
      expect((await store.list("owner", "candidate"))[0]).toMatchObject({ status: "revoked", openCount: 2 });
    } finally { db.close(); }
  });

  it("rejects an expired link and records the denied access without storing an IP address", async () => {
    const { db, store } = fixture();
    try {
      const created = await store.create("owner", "candidate", "analysis", report, "24h");
      expect(created).not.toBeNull();
      db.prepare("UPDATE external_shares SET expires_at = '2020-01-01T00:00:00.000Z' WHERE id = ?").run(created!.share.id);
      expect(await store.resolve(created!.token, "f".repeat(64), null)).toBeNull();
      expect(db.prepare("SELECT outcome, ip_fingerprint FROM share_access_log").get()).toEqual({
        outcome: "denied_expired", ip_fingerprint: "f".repeat(64),
      });
      expect((await store.list("owner", "candidate"))[0]).toMatchObject({ status: "expired", openCount: 0, lastOpenedAt: null });
    } finally { db.close(); }
  });
});
