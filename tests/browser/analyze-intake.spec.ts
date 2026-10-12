import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

test("own-CV intake has no sample candidate and discovers a public project", async ({ page, context }, testInfo) => {
  const arabic = testInfo.project.name.endsWith("-ar");
  const label = (en: string, ar: string) => arabic ? ar : en;
  const registration = await context.request.post("/api/auth/register", {
    data: { email: `intake-${randomUUID()}@example.invalid`, password: randomUUID() },
  });
  expect(registration.status()).toBe(201);
  await context.addCookies([{ name: "codeproof-locale", value: arabic ? "ar" : "en", url: testInfo.project.use.baseURL! }]);
  await page.goto("/analyze");
  await expect(page.locator("html")).toHaveAttribute("dir", arabic ? "rtl" : "ltr");
  await expect(page.getByRole("heading", { name: label("Upload the candidate CV", "ارفع سيرة المرشح") })).toBeVisible();
  await expect(page.getByRole("button", { name: label("Use sample candidate", "استخدم مرشحاً تجريبياً") })).toHaveCount(0);
  await page.getByRole("textbox", { name: label("Paste CV text", "ألصق نص السيرة") }).fill("Synthetic Applicant\nSoftware engineer. Public project: https://github.com/sindresorhus/is");
  await page.getByRole("button", { name: label("Detect candidate projects", "اكتشف مشاريع المرشح") }).click();
  await expect(page.getByRole("heading", { name: label("Confirm candidate and projects", "أكد المرشح والمشاريع") })).toBeVisible();
  await expect(page.getByText("sindresorhus/is")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("text-based PDF discovers candidate material", async ({ context }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-en");
  expect((await context.request.post("/api/auth/register", {
    data: { email: `pdf-discovery-${randomUUID()}@example.invalid`, password: randomUUID() },
  })).status()).toBe(201);
  const result = await context.request.post("/api/cv/discover", { multipart: {
    resumeFile: {
      name: "resume.pdf",
      mimeType: "application/pdf",
      buffer: readFileSync(path.join(process.cwd(), "docs", "demo", "sample-cv-amina-hassan.pdf")),
    },
  } });
  expect(result.status(), JSON.stringify(await result.json())).toBe(200);
  const body = await result.json() as { discovery: { candidateName: string | null } };
  expect(body.discovery.candidateName).toBeTruthy();
});
