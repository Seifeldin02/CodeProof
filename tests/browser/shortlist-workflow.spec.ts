import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

test("saved role reviews private candidates without treating missing code as a skill deficit", async ({ page, context, browser }, testInfo) => {
  const arabic = testInfo.project.name.endsWith("-ar");
  const label = (en: string, ar: string) => arabic ? ar : en;
  const registration = await context.request.post("/api/auth/register", {
    data: { email: `role-${randomUUID()}@example.invalid`, password: randomUUID() },
  });
  expect(registration.status()).toBe(201);
  await context.addCookies([{ name: "codeproof-locale", value: arabic ? "ar" : "en", url: testInfo.project.use.baseURL! }]);
  await page.goto("/shortlists");
  await expect(page.locator("html")).toHaveAttribute("dir", arabic ? "rtl" : "ltr");
  await page.locator("details summary").filter({ hasText: label("Add a candidate from a CV", "أضف مرشحًا من سيرته الذاتية") }).click();
  await page.locator("#intake-name").fill("Private-code candidate");
  await page.locator("#intake-text").fill("Experienced backend engineer using TypeScript and Python. Built private client systems.");
  await page.locator("form").filter({ has: page.locator("#intake-name") }).getByRole("button", { name: label("Add candidate to private pool", "أضف المرشح إلى قائمتك الخاصة") }).click();
  await expect(page.getByRole("status")).toContainText(label("Candidate added", "أُضيف المرشح"));
  const candidates = await context.request.get("/api/candidates");
  expect(candidates.status()).toBe(200);
  const candidateId = ((await candidates.json()) as Array<{ id: string; name: string }>).find((item) => item.name === "Private-code candidate")?.id;
  expect(candidateId).toBeTruthy();
  await expect(page.getByRole("heading", { name: label("Role-based candidate review", "مراجعة المرشحين حسب الوظيفة") })).toBeVisible();
  await page.getByLabel(label("Role title", "المسمى الوظيفي")).fill("Backend platform engineer");
  await page.getByLabel(label("Job brief", "وصف الوظيفة")).fill("TypeScript required; Python preferred; 5 years of experience.");
  await page.getByRole("button", { name: label("Save role and review candidates", "احفظ الوظيفة وراجع المرشحين") }).click();
  await expect(page).toHaveURL(/\/shortlists\?role=/);
  await expect(page.getByRole("heading", { name: "Private-code candidate" })).toBeVisible();
  await expect(page.getByText(label("CV mentions (candidate-reported, not verified)", "مهارات مذكورة في السيرة الذاتية"), { exact: false })).toBeVisible();
  await expect(page.getByText("TypeScript · Python", { exact: false })).toBeVisible();
  const roleId = new URL(page.url()).searchParams.get("role");
  expect(roleId).toBeTruthy();
  await expect(page.getByText(label("This is an evidence gap, not proof the candidate lacks this skill.", "هذه فجوة في الأدلة، وليست دليلاً على افتقار المرشح إلى هذه المهارة."))).toBeVisible();
  await expect(page.getByRole("heading", { name: label("Requirements needing human review", "متطلبات تحتاج مراجعة بشرية") }).locator("..")).toContainText("Python");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Private-code candidate" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/shortlist-${testInfo.project.name}.png`, fullPage: true });
  await page.getByRole("link", { name: label("Open full dossier", "افتح الملف الكامل") }).click();
  await expect(page.getByText(label("No public-code evidence", "لا تتوفر أدلة من كود عام"))).toBeVisible();
  await expect(page.getByRole("heading", { name: label("CV claims awaiting verification", "ادعاءات السيرة الذاتية بانتظار التحقق") })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.goBack();
  await page.getByRole("link", { name: label("Prepare interview", "حضّر المقابلة") }).click();
  await expect(page).toHaveURL(new RegExp(`/interviews\\?candidate=${candidateId}&role=${roleId}`));
  await expect(page.getByRole("textbox", { name: label("Role being hired", "الوظيفة المطلوب شغلها") })).toHaveValue("Backend platform engineer");
  await expect(page.getByText("TypeScript", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: label("Create interview plan", "إنشاء خطة مقابلة") }).click();
  await expect(page).toHaveURL(/\/interviews\/[0-9a-f-]+$/);
  const interviewId = page.url().split("/").at(-1);
  const interview = await context.request.get(`/api/interviews/${interviewId}`);
  expect(interview.status()).toBe(200);
  const preparation = ((await interview.json()) as { session: { preparation: { roleTitle: string; criteria: Array<{ requirement: string }> } } }).session.preparation;
  expect(preparation.roleTitle).toBe("Backend platform engineer");
  expect(preparation.criteria.map((criterion) => criterion.requirement)).toEqual(["TypeScript"]);

  const other = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
  try {
    expect((await other.request.post("/api/auth/register", {
      data: { email: `other-${randomUUID()}@example.invalid`, password: randomUUID() },
    })).status()).toBe(201);
    const otherRoles = await other.request.get("/api/shortlists");
    expect(otherRoles.status()).toBe(200);
    expect((await otherRoles.json() as { roles: unknown[] }).roles).toEqual([]);
    const otherCandidate = await other.request.post("/api/candidates", { data: { name: "Other candidate", role: "Backend Engineer" } });
    expect(otherCandidate.status()).toBe(201);
    const otherCandidateId = ((await otherCandidate.json()) as { candidate: { id: string } }).candidate.id;
    const foreignRoleInterview = await other.request.post("/api/interviews", {
      data: { candidateId: otherCandidateId, roleTitle: "Backend platform engineer", roleId, criterionIds: ["criterion-does-not-matter"] },
    });
    expect(foreignRoleInterview.status()).toBe(404);
  } finally {
    await other.close();
  }
  expect((await context.request.delete(`/api/candidates/${candidateId}`)).status()).toBe(204);
});

test("role API denies unauthenticated and cross-origin access", async ({ request }) => {
  expect((await request.get("/api/shortlists")).status()).toBe(401);
  expect((await request.post("/api/shortlists", { data: {} })).status()).toBe(401);
  expect((await request.post("/api/shortlists", {
    headers: { origin: "https://untrusted.example" }, data: {},
  })).status()).toBe(403);
  expect((await request.post("/api/candidates/intake-cv", { data: {} })).status()).toBe(401);
  expect((await request.post("/api/candidates/intake-cv", {
    headers: { origin: "https://untrusted.example" }, data: {},
  })).status()).toBe(403);
});

test("CV-only PDF intake accepts the local text PDF and keeps claims owner-scoped", async ({ context, browser }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-en");
  expect((await context.request.post("/api/auth/register", {
    data: { email: `pdf-${randomUUID()}@example.invalid`, password: randomUUID() },
  })).status()).toBe(201);
  const pdf = readFileSync(path.join(process.cwd(), "docs", "demo", "sample-cv-amina-hassan.pdf"));
  const result = await context.request.post("/api/candidates/intake-cv", {
    multipart: {
      name: "PDF intake candidate", role: "Backend Engineer",
      resumeFile: { name: "resume.pdf", mimeType: "application/pdf", buffer: pdf },
    },
  });
  expect(result.status()).toBe(201);
  const body = await result.json() as { candidate: { id: string }; claimCount: number };
  expect(body.claimCount).toBeGreaterThan(0);
  const other = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
  try {
    expect((await other.request.post("/api/auth/register", {
      data: { email: `pdf-other-${randomUUID()}@example.invalid`, password: randomUUID() },
    })).status()).toBe(201);
    expect((await other.request.get(`/api/candidates/${body.candidate.id}`)).status()).toBe(404);
  } finally {
    await other.close();
  }
  expect((await context.request.delete(`/api/candidates/${body.candidate.id}`)).status()).toBe(204);
});
