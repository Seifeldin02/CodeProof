import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("CV to public-code dossier, comparison and live insights", async ({ page, context }, testInfo) => {
  test.skip(process.env.CODEPROOF_DEMO_REHEARSAL !== "1");
  test.setTimeout(180_000);
  const arabic = testInfo.project.name.endsWith("-ar");
  const label = (en: string, ar: string) => arabic ? ar : en;
  const registration = await context.request.post("/api/auth/register", {
    data: { email: `rehearsal-${randomUUID()}@example.invalid`, password: randomUUID() },
  });
  expect(registration.status()).toBe(201);
  await context.addCookies([{ name: "codeproof-locale", value: arabic ? "ar" : "en", url: testInfo.project.use.baseURL! }]);

  await page.goto("/analyze");
  await page.getByRole("textbox", { name: label("Paste CV text", "ألصق نص السيرة") })
    .fill("Synthetic Applicant\nSoftware engineer using TypeScript. Public project: https://github.com/sindresorhus/is");
  await page.getByRole("button", { name: label("Detect candidate projects", "اكتشف مشاريع المرشح") }).click();
  await expect(page.getByRole("heading", { name: label("Confirm candidate and projects", "أكد المرشح والمشاريع") })).toBeVisible();
  await expect(page.getByText("sindresorhus/is")).toBeVisible();
  await page.locator('input[list="analyze-role-suggestions"]').fill("Software Engineer");
  await page.getByRole("button", { name: label("Build candidate evidence report", "أنشئ تقرير أدلة المرشح") }).click();
  await expect(page).toHaveURL(/\/candidates\/[0-9a-f-]+$/, { timeout: 120_000 });
  const candidateId = page.url().split("/").at(-1);
  expect(candidateId).toBeTruthy();
  await expect(page.getByRole("heading", { name: "Synthetic Applicant", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: label("Repository evidence", "أدلة المستودع") })).toBeVisible();
  if (process.env.CODEPROOF_REQUIRE_AI === "1") await expect(page.getByText(label("AI-assisted", "بمساعدة الذكاء الاصطناعي"), { exact: false })).toBeVisible();
  const dossierResponse = await context.request.get(`/api/candidates/${candidateId}`);
  expect(dossierResponse.status()).toBe(200);
  const dossier = await dossierResponse.json() as {
    isDemo: boolean;
    analyses: Array<{ repositoryName: string; result: { metadata: { aiStatus: string }; selectedFiles: unknown[] } }>;
  };
  expect(dossier.isDemo).toBe(false);
  expect(dossier.analyses).toHaveLength(1);
  expect(dossier.analyses[0].repositoryName).toBe("sindresorhus/is");
  expect(dossier.analyses[0].result.selectedFiles.length).toBeGreaterThan(0);
  if (process.env.CODEPROOF_REQUIRE_AI === "1") expect(dossier.analyses[0].result.metadata.aiStatus).toBe("completed");

  await page.goto("/compare");
  await expect(page.getByRole("heading", { name: label("Compare candidate evidence", "قارن أدلة المرشحين") })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Synthetic Applicant", exact: true })).toBeVisible();
  await page.goto("/review");
  await expect(page.getByText("Synthetic Applicant", { exact: true }).first()).toBeVisible();
  await page.goto("/insights");
  await expect(page.getByRole("heading", { name: label("Hiring Insights", "رؤى التوظيف") })).toBeVisible();
  await expect(page.getByText(label("Live evidence view.", "عرض أدلة مباشر."))).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect((await context.request.delete(`/api/candidates/${candidateId}`)).status()).toBe(204);
});
