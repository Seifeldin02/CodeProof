import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("recruiter shares a bounded evidence snapshot, visitor reads it, and revocation closes it", async ({ page, context, browser }, testInfo) => {
  test.skip(process.env.CODEPROOF_SHARE_LIVE_TEST !== "1");
  test.setTimeout(180_000);
  const ar = testInfo.project.name.endsWith("-ar");
  expect((await context.request.post("/api/auth/register", {
    data: { email: `share-${randomUUID()}@example.invalid`, password: randomUUID() },
  })).status()).toBe(201);
  await context.addCookies([{ name: "codeproof-locale", value: ar ? "ar" : "en", url: testInfo.project.use.baseURL! }]);
  const repositoryUrl = "https://github.com/sindresorhus/is";
  const analysis = await context.request.post("/api/candidates/analyze", {
    multipart: {
      candidateName: "Synthetic Share Candidate", role: "Frontend Engineer",
      repositoryUrls: JSON.stringify([repositoryUrl]),
      repositorySelections: JSON.stringify([{ repositoryUrl, discoveryOrigin: "manual entry" }]),
      resumeText: "Synthetic Share Candidate\nTypeScript\nPublic project: https://github.com/sindresorhus/is",
      jobDescription: "", isDemo: "false",
    }, timeout: 125_000,
  });
  expect(analysis.status()).toBe(201);
  const candidateId = ((await analysis.json()) as { candidate: { id: string } }).candidate.id;
  const external = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
  const otherRecruiter = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
  await external.addCookies([{ name: "codeproof-locale", value: ar ? "ar" : "en", url: testInfo.project.use.baseURL! }]);
  try {
    await page.goto(`/candidates/${candidateId}/share`);
    await expect(page.getByRole("heading", { name: ar ? "مشاركة تقرير أدلة خارجي" : "External evidence sharing" })).toBeVisible();
    await page.getByRole("button", { name: ar ? "إنشاء رابط آمن" : "Create secure link" }).click();
    const link = page.getByRole("textbox", { name: ar ? "نسخ الرابط" : "Copy link" });
    await expect(link).toHaveValue(/\/shared\/[A-Za-z0-9_-]{43}$/u);
    const url = await link.inputValue();
    const list = await context.request.get(`/api/candidates/${candidateId}/shares`);
    expect(list.status()).toBe(200);
    expect(JSON.stringify(await list.json())).not.toContain(url.split("/").at(-1));
    expect((await otherRecruiter.request.post("/api/auth/register", {
      data: { email: `share-other-${randomUUID()}@example.invalid`, password: randomUUID() },
    })).status()).toBe(201);
    expect((await otherRecruiter.request.get(`/api/candidates/${candidateId}/shares`)).status()).toBe(404);
    const shareId = ((await list.json()) as { shares: Array<{ id: string }> }).shares[0].id;
    expect((await otherRecruiter.request.delete(`/api/candidates/${candidateId}/shares/${shareId}`)).status()).toBe(404);
    expect((await external.request.post(`/api/candidates/${candidateId}/shares`, {
      data: { analysisId: randomUUID(), expiry: "7d" },
    })).status()).toBe(401);
    const visitor = await external.newPage();
    const response = await visitor.goto(url);
    expect(response?.status()).toBe(200);
    expect(response?.headers()["cache-control"]).toMatch(process.env.PLAYWRIGHT_BASE_URL
      ? /no-store/u : /no-store|no-cache, must-revalidate/u);
    expect(response?.headers()["x-robots-tag"]).toContain("noindex");
    await expect(visitor.getByRole("heading", { name: "Synthetic Share Candidate" })).toBeVisible();
    // The same repository yields exact citations where the analysis grounds a finding and a plain file list where it
    // does not. Either is a correct report; showing both, or neither, is not.
    await expect(visitor.getByRole("heading", {
      name: ar ? /^(?:مراجع الملفات الدقيقة|الملفات التي فُحصت)$/u : /^(?:Exact file citations|Inspected source files)$/u,
    })).toHaveCount(1);
    await expect(visitor.getByRole("link", { name: ar ? "افتح المصدر" : "Open source" }).first()).toBeVisible();
    // The report is read in the visitor's language: the Arabic page leaves no English role or level name behind.
    if (ar) {
      await expect(visitor.getByText("مهندس واجهات أمامية")).toBeVisible();
      await expect(visitor.getByText(/Frontend Engineer|(?:Strong|Good|Partial|Limited) Evidence/u)).toHaveCount(0);
    }
    expect(await visitor.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    // The recruiter can tell that the report was read.
    const read = (await (await context.request.get(`/api/candidates/${candidateId}/shares`)).json()) as { shares: Array<{ openCount: number; lastOpenedAt: string | null }> };
    expect(read.shares[0].openCount).toBeGreaterThanOrEqual(1);
    expect(read.shares[0].lastOpenedAt).toBeTruthy();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: ar ? "إلغاء الرابط" : "Revoke link" }).click();
    await expect(page.getByText(ar ? "ملغى" : "Revoked", { exact: false })).toBeVisible();
    expect((await visitor.reload())?.status()).toBe(404);
    await expect(visitor.getByRole("heading", { name: ar ? "هذا التقرير المشترك غير متاح" : "This shared report is not available" })).toBeVisible();
  } finally {
    await external.close();
    await otherRecruiter.close();
    expect((await context.request.delete(`/api/candidates/${candidateId}`)).status()).toBe(204);
  }
});
