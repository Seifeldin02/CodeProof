import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

test("PDF intake builds a real public-code dossier", async ({ context }, testInfo) => {
  test.skip(process.env.CODEPROOF_PDF_LIVE_TEST !== "1" || testInfo.project.name !== "desktop-en");
  test.setTimeout(150_000);
  expect((await context.request.post("/api/auth/register", {
    data: { email: `pdf-live-${randomUUID()}@example.invalid`, password: randomUUID() },
  })).status()).toBe(201);
  const pdf = readFileSync(path.join(process.cwd(), "docs", "demo", "sample-cv-amina-hassan.pdf"));
  const discovery = await context.request.post("/api/cv/discover", {
    multipart: { resumeFile: { name: "resume.pdf", mimeType: "application/pdf", buffer: pdf } },
  });
  expect(discovery.status(), JSON.stringify(await discovery.json())).toBe(200);

  const repositoryUrl = "https://github.com/sindresorhus/is";
  const analysis = await context.request.post("/api/candidates/analyze", {
    multipart: {
      candidateName: "PDF workflow candidate",
      role: "Frontend Engineer",
      repositoryUrls: JSON.stringify([repositoryUrl]),
      repositorySelections: JSON.stringify([{ repositoryUrl, discoveryOrigin: "manual entry" }]),
      resumeText: "",
      jobDescription: "",
      isDemo: "false",
      resumeFile: { name: "resume.pdf", mimeType: "application/pdf", buffer: pdf },
    },
    timeout: 125_000,
  });
  expect(analysis.status(), JSON.stringify(await analysis.json())).toBe(201);
  const candidateId = ((await analysis.json()) as { candidate: { id: string } }).candidate.id;
  try {
    const detail = await context.request.get(`/api/candidates/${candidateId}`);
    expect(detail.status()).toBe(200);
    const dossier = await detail.json() as {
      isDemo: boolean;
      analyses: Array<{ repositoryName: string; result: { selectedFiles: unknown[] } }>;
    };
    expect(dossier.isDemo).toBe(false);
    expect(dossier.analyses[0].repositoryName).toBe("sindresorhus/is");
    expect(dossier.analyses[0].result.selectedFiles.length).toBeGreaterThan(0);
  } finally {
    expect((await context.request.delete(`/api/candidates/${candidateId}`)).status()).toBe(204);
  }
});
