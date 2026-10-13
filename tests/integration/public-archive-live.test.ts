import { expect, it } from "vitest";
import { analyzeRepository } from "@/features/repository-analysis/engine";
import { CandidateStore } from "@/features/candidates/store";

it.skipIf(process.env.CODEPROOF_LIVE_GITHUB_TEST !== "1")("ingests and analyzes a real public repository without AI or a GitHub token", async () => {
  const result = await analyzeRepository(
    { repositoryUrl: "https://github.com/sindresorhus/is" },
    { aiProvider: null, cache: false },
  );
  expect(result.repository.url).toBe("https://github.com/sindresorhus/is");
  expect(result.selectedFiles.length).toBeGreaterThan(0);
  expect(result.metadata.aiStatus).toBe("unavailable_not_configured");
  const store = new CandidateStore(":memory:");
  try {
    store.db.prepare("INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)")
      .run("live-owner", "live-owner@example.invalid", "test-hash", new Date().toISOString());
    const applicant = await store.createCandidate("live-owner", {
      name: "Live test candidate", role: "", results: [], intakeOnly: true,
      unanalyzedSources: [result.repository.url],
    });
    const updated = await store.recordRepositorySuccess("live-owner", applicant.id, result);
    expect(updated?.analyses).toHaveLength(1);
  } finally {
    store.db.close();
  }
}, 35_000);
