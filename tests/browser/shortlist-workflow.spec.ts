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
  await page.locator("#intake-role").fill("Backend Engineer");
  await page.locator("form").filter({ has: page.locator("#intake-name") }).locator("select").selectOption("Referral");
  await page.locator("#intake-text").fill("Experienced backend engineer using TypeScript and Python. Built private client systems.");
  await page.locator("form").filter({ has: page.locator("#intake-name") }).getByRole("button", { name: label("Add candidate to private pool", "أضف المرشح إلى قائمتك الخاصة") }).click();
  await expect(page.getByRole("status")).toContainText(label("Candidate added", "أُضيف المرشح"));
  const candidates = await context.request.get("/api/candidates");
  expect(candidates.status()).toBe(200);
  const savedCandidates = await candidates.json() as Array<{ id: string; name: string; source: string }>;
  const candidateId = savedCandidates.find((item) => item.name === "Private-code candidate")?.id;
  expect(candidateId).toBeTruthy();
  expect(savedCandidates.find((item) => item.id === candidateId)?.source).toBe("Referral");
  const unscreened = await context.request.post("/api/candidates", { data: { name: "AAA no CV candidate" } });
  expect(unscreened.status()).toBe(201);
  const unscreenedCandidate = ((await unscreened.json()) as { candidate: { id: string; role: string } }).candidate;
  const unscreenedId = unscreenedCandidate.id;
  expect(unscreenedCandidate.role).toBe("");
  await expect(page.getByRole("heading", { name: label("Role-based candidate review", "مراجعة المرشحين حسب الوظيفة") })).toBeVisible();
  await page.getByLabel(label("Role title", "المسمى الوظيفي")).fill("Backend platform engineer");
  await page.getByLabel(label("Job brief", "وصف الوظيفة")).fill("TypeScript required; Python preferred; 5 years of experience.");
  await page.getByRole("button", { name: label("Save role and review candidates", "احفظ الوظيفة وراجع المرشحين") }).click();
  await expect(page).toHaveURL(/\/shortlists\?role=/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Private-code candidate" })).toBeVisible();
  expect((await page.locator("article h3").allTextContents())[0]).toBe("Private-code candidate");
  const candidateCard = page.locator("article").filter({ has: page.getByRole("heading", { name: "Private-code candidate" }) });
  await expect(candidateCard.getByText(label("From the CV only: 1", "من السيرة الذاتية فقط: 1"))).toBeVisible();
  await expect(candidateCard.getByText(label("On the CV", "مذكورة في السيرة الذاتية"), { exact: true })).toHaveCount(2);
  await expect(candidateCard.getByText("TypeScript", { exact: true })).toBeVisible();
  await expect(candidateCard.getByText("Python", { exact: true })).toBeVisible();
  const roleId = new URL(page.url()).searchParams.get("role");
  expect(roleId).toBeTruthy();
  await expect(candidateCard.getByText(label("Not seen in public code", "لم تظهر في الكود العام"))).toBeVisible();
  await expect(page.getByRole("heading", { name: label("Requirements needing human review", "متطلبات تحتاج مراجعة بشرية") }).locator("..")).toContainText("5 years of experience");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Private-code candidate" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/shortlist-${testInfo.project.name}.png`, fullPage: true });
  await candidateCard.getByRole("link", { name: label("Open full dossier", "افتح الملف الكامل") }).click();
  await expect(page.getByText(label("No public-code evidence", "لا تتوفر أدلة من كود عام"))).toBeVisible();
  await expect(page.getByRole("heading", { name: label("CV claims awaiting verification", "ادعاءات السيرة الذاتية بانتظار التحقق") })).toBeVisible();
  await expect(page.getByRole("heading", { name: label("Optional public-code review", "مراجعة الكود العام اختياريًا") })).toBeVisible();
  await expect(page.getByRole("heading", { name: label("Saved roles to explore for this candidate", "وظائف محفوظة لاستكشافها لهذا المرشح") })).toBeVisible();
  await page.locator('select:has(option[value="Not recorded"])').selectOption("LinkedIn");
  await page.getByRole("button", { name: label("Save candidate status", "حفظ حالة المرشح") }).click();
  await expect.poll(async () => ((await (await context.request.get(`/api/candidates/${candidateId}`)).json()) as { source: string }).source).toBe("LinkedIn");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.goBack();
  await candidateCard.getByRole("link", { name: label("Prepare interview", "حضّر المقابلة") }).click();
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
  expect(preparation.criteria.map((criterion) => criterion.requirement)).toEqual(["TypeScript", "Python"]);

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
  expect((await context.request.delete(`/api/candidates/${unscreenedId}`)).status()).toBe(204);
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
  expect((await request.post("/api/candidates/unknown/analyze-public", { data: {} })).status()).toBe(401);
  expect((await request.post("/api/candidates/unknown/analyze-public", {
    headers: { origin: "https://untrusted.example" }, data: {},
  })).status()).toBe(403);
});

test("equal CV-only role evidence shares review position instead of inventing a winner", async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-en");
  expect((await context.request.post("/api/auth/register", { data: {
    email: `role-tie-${randomUUID()}@example.invalid`, password: randomUUID(),
  } })).status()).toBe(201);
  for (const name of ["Amal Applicant", "Ziad Applicant"]) {
    const response = await context.request.post("/api/candidates/intake-cv", { multipart: {
      name, resumeText: `${name}\nSkills: TypeScript and React`,
    } });
    expect(response.status()).toBe(201);
  }
  const saved = await context.request.post("/api/shortlists", { data: {
    title: "Frontend engineer", description: "Required: TypeScript and React for frontend work.",
  } });
  expect(saved.status()).toBe(201);
  await page.goto("/shortlists");
  await expect(page.getByText("Candidates are ordered by observed role evidence. Equal evidence shares a position; this is not a hiring verdict.")).toBeVisible();
  const cards = page.locator("article").filter({ has: page.getByRole("link", { name: "Prepare interview" }) });
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0).locator("span[aria-hidden='true']")).toHaveText("1");
  await expect(cards.nth(1).locator("span[aria-hidden='true']")).toHaveText("1");
});

test("CV-only PDF intake accepts the local text PDF and keeps claims owner-scoped", async ({ context, browser }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-en");
  expect((await context.request.post("/api/auth/register", {
    data: { email: `pdf-${randomUUID()}@example.invalid`, password: randomUUID() },
  })).status()).toBe(201);
  const pdf = readFileSync(path.join(process.cwd(), "docs", "demo", "sample-cv-amina-hassan.pdf"));
  const result = await context.request.post("/api/candidates/intake-cv", {
    multipart: {
      name: "PDF intake candidate",
      resumeFile: { name: "resume.pdf", mimeType: "application/pdf", buffer: pdf },
    },
  });
  expect(result.status()).toBe(201);
  const body = await result.json() as { candidate: { id: string; role: string }; claimCount: number };
  expect(body.claimCount).toBeGreaterThan(0);
  expect(body.candidate.role).toBe("");
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

test("bounded batch CV intake saves separate applicants with confirmed names", async ({ page, context }, testInfo) => {
  const arabic = testInfo.project.name.endsWith("-ar");
  const label = (en: string, ar: string) => arabic ? ar : en;
  expect((await context.request.post("/api/auth/register", {
    data: { email: `batch-${randomUUID()}@example.invalid`, password: randomUUID() },
  })).status()).toBe(201);
  await context.addCookies([{ name: "codeproof-locale", value: arabic ? "ar" : "en", url: testInfo.project.use.baseURL! }]);
  await page.goto("/shortlists");
  await page.locator("details summary").filter({ hasText: label("Import multiple applicants from CV PDFs", "استيراد عدة متقدمين") }).click();
  const pdf = readFileSync(path.join(process.cwd(), "docs", "demo", "sample-cv-amina-hassan.pdf"));
  await page.locator("#batch-cvs").setInputFiles([
    { name: "1.pdf", mimeType: "application/pdf", buffer: pdf },
    { name: "00c879a464787a2f.pdf", mimeType: "application/pdf", buffer: pdf },
  ]);
  await expect(page.locator("#batch-role-0")).toBeEnabled();
  await expect(page.locator("#batch-role-1")).toBeEnabled();
  await expect(page.locator("#batch-name-0")).toHaveValue("Amina Hassan");
  await expect(page.locator("#batch-name-1")).toHaveValue("Amina Hassan");
  await expect(page.locator("#batch-role-0")).not.toHaveAttribute("required", "");
  await expect(page.locator("#batch-role-0")).not.toHaveAttribute("list", "batch-role-suggestions");
  await page.locator("#batch-name-0").fill("Amina confirmed");
  await page.locator("#batch-name-1").fill("Leila confirmed");
  await page.locator("#batch-role-0").fill("Mobile Engineer");
  await page.locator("#batch-role-1").fill("");
  await page.locator("#batch-source-0").selectOption("Job Board");
  await page.locator("#batch-source-1").selectOption("Referral");
  await page.getByRole("button", { name: label("Import 2 candidates", "استيراد 2 مرشحين") }).click();
  await expect(page.getByRole("status")).toContainText(label("Imported 2 candidates", "استُورد 2 مرشحين"));
  await expect.poll(async () => {
    const rows = (await (await context.request.get("/api/candidates")).json()) as Array<{ name: string }>;
    return rows.filter((item) => item.name === "Amina confirmed" || item.name === "Leila confirmed").map((item) => item.name).sort();
  }).toEqual(["Amina confirmed", "Leila confirmed"]);
  const stored = (await (await context.request.get("/api/candidates")).json()) as Array<{ id: string; name: string; role: string; source: string }>;
  const imported = stored.filter((item) => item.name === "Amina confirmed" || item.name === "Leila confirmed");
  expect(imported.map((item) => item.name).sort()).toEqual(["Amina confirmed", "Leila confirmed"]);
  expect(imported.find((item) => item.name === "Amina confirmed")).toMatchObject({ role: "Mobile Engineer", source: "Job Board" });
  expect(imported.find((item) => item.name === "Leila confirmed")).toMatchObject({ role: "", source: "Referral" });
  for (const item of imported) expect((await context.request.delete(`/api/candidates/${item.id}`)).status()).toBe(204);
});

test("optional live GitHub analysis enriches the same CV-first candidate", async ({ page, context }, testInfo) => {
  test.skip(process.env.CODEPROOF_LIVE_GITHUB_TEST !== "1" || testInfo.project.name !== "desktop-en");
  test.setTimeout(150_000);
  expect((await context.request.post("/api/auth/register", {
    data: { email: `live-code-${randomUUID()}@example.invalid`, password: randomUUID() },
  })).status()).toBe(201);
  const intake = await context.request.post("/api/candidates/intake-cv", {
    multipart: {
      name: "Live archive candidate", role: "Backend Engineer",
      resumeText: "Live archive candidate\nTypeScript\nPublic project: https://github.com/sindresorhus/is",
    },
  });
  expect(intake.status()).toBe(201);
  const candidateId = ((await intake.json()) as { candidate: { id: string } }).candidate.id;
  await page.goto(`/candidates/${candidateId}`);
  await expect(page.getByRole("combobox", { name: "Public GitHub repository URL" })).toHaveValue("https://github.com/sindresorhus/is");
  await page.getByRole("button", { name: "Analyze public code" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Public repository reviewed" })).toBeVisible({ timeout: 120_000 });
  const enriched = await context.request.get(`/api/candidates/${candidateId}`);
  expect(enriched.status()).toBe(200);
  const dossier = await enriched.json() as { id: string; analyses: unknown[]; repositories: Array<{ attributionStatus: string }> };
  expect(dossier.id).toBe(candidateId);
  expect(dossier.analyses.length).toBe(1);
  expect(dossier.repositories[0]?.attributionStatus).toBe("candidate_claimed");
  expect((await context.request.delete(`/api/candidates/${candidateId}`)).status()).toBe(204);
});
