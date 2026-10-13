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

test("saved role and profile projects are explicit recruiter choices", async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-en");
  expect((await context.request.post("/api/auth/register", {
    data: { email: `analyze-role-${randomUUID()}@example.invalid`, password: randomUUID() },
  })).status()).toBe(201);
  const saved = await context.request.post("/api/shortlists", {
    data: { title: "Mobile product engineer", description: "Role-specific brief: Flutter required and TypeScript preferred." },
  });
  expect(saved.status()).toBe(201);
  const roleId = ((await saved.json()) as { role: { id: string } }).role.id;
  let profileLookups = 0;
  await page.route("**/api/github/profile", async (route) => { profileLookups += 1; await route.fulfill({ json: { listing: {
    owner: "rana", url: "https://github.com/rana", more: false,
    repositories: [{ owner: "rana", repository: "project", url: "https://github.com/rana/project", language: "TypeScript" }],
  } } }); });
  let posted = "";
  await page.route("**/api/candidates/analyze", async (route) => {
    posted = route.request().postDataBuffer()?.toString("utf8") ?? "";
    await route.fulfill({ status: 422, json: { error: { message: "Test stopped before repository ingestion." } } });
  });
  await page.goto("/analyze");
  await page.getByRole("textbox", { name: "Paste CV text" }).fill("Rana Hassan\nMobile Engineer\nGitHub: https://github.com/rana");
  await page.getByRole("button", { name: "Detect candidate projects" }).click();
  await expect(page.getByRole("heading", { name: "Confirm candidate and projects" })).toBeVisible();
  await page.getByLabel("Role you are hiring for").selectOption(roleId);
  await page.getByText("Read original job brief").click();
  await expect(page.getByText("Role-specific brief: Flutter required and TypeScript preferred.")).toBeVisible();
  await expect(page.getByLabel("Candidate-stated role (optional)")).toHaveValue("Mobile Engineer");
  await page.getByLabel("Applicant source").selectOption("Referral");
  await expect(page.getByText("rana/project")).toBeVisible();
  expect(profileLookups).toBe(1);
  await expect(page.getByRole("button", { name: "Build candidate evidence report" })).toBeDisabled();
  await page.getByRole("button", { name: /rana\/project/u }).click();
  await page.getByRole("button", { name: "Build candidate evidence report" }).click();
  await expect.poll(() => posted).not.toBe("");
  expect(posted).toContain("Role-specific brief: Flutter required and TypeScript preferred.");
  expect(posted).toContain("GitHub profile");
  expect(posted).toContain("Referral");
  expect(posted).toContain("Mobile Engineer");
  expect(posted).not.toContain('name="isDemo"');
  expect((await context.request.post("/api/candidates/analyze", { multipart: { isDemo: "true" } })).status()).toBe(400);
});

test("CV without a GitHub link or extractable name explains both gaps", async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-en");
  expect((await context.request.post("/api/auth/register", {
    data: { email: `no-links-${randomUUID()}@example.invalid`, password: randomUUID() },
  })).status()).toBe(201);
  await page.goto("/analyze");
  await page.getByRole("textbox", { name: "Paste CV text" }).fill("Software Engineer\nSkills\nJavaScript, TypeScript");
  await page.getByRole("button", { name: "Detect candidate projects" }).click();
  await expect(page.getByText("Name not found in CV. Enter it before analyzing.")).toBeVisible();
  await expect(page.getByText("No GitHub repository or profile link was found in this CV. Paste a public repository or profile link below.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Build candidate evidence report" })).toBeDisabled();
});

test("automated profile lookup reports no public projects truthfully", async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-en");
  expect((await context.request.post("/api/auth/register", {
    data: { email: `empty-profile-${randomUUID()}@example.invalid`, password: randomUUID() },
  })).status()).toBe(201);
  await page.route("**/api/github/profile", async (route) => route.fulfill({ json: { listing: {
    owner: "norepos", url: "https://github.com/norepos", more: false, repositories: [],
  } } }));
  await page.goto("/analyze");
  await page.getByRole("textbox", { name: "Paste CV text" }).fill("Nora Candidate\nGitHub: https://github.com/norepos");
  await page.getByRole("button", { name: "Detect candidate projects" }).click();
  await expect(page.getByText("No public projects were found on the GitHub profiles in this CV. You can still paste a repository link below.")).toBeVisible();
});
