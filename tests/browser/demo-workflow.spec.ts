import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { translate, type Locale } from "../../src/i18n/translations";

const registeredIds = new WeakMap<BrowserContext, string>();

async function register(context: BrowserContext, email = `release-${randomUUID()}@example.invalid`): Promise<void> {
  const response = await context.request.post("/api/auth/register", {
    data: { email, password: randomUUID() },
  });
  expect(response.status()).toBe(201);
  const { user } = await response.json() as { user: { id: string } };
  registeredIds.set(context, user.id);
  expect((await context.request.post("/api/account/onboarding", { data: { displayName: "Synthetic QA recruiter" } })).status()).toBe(200);
}

async function layout(page: Page, locale: Locale): Promise<void> {
  await expect(page.locator("html")).toHaveAttribute("lang", locale);
  await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await expect(page.getByText("Application error: a server-side exception", { exact: false })).toHaveCount(0);
}

function syntheticCvPdf(): Buffer {
  const content = "BT /F1 12 Tf 50 740 Td (Synthetic QA Candidate) Tj 0 -20 Td (JavaScript React Engineer) Tj 0 -20 Td (https://github.com/sindresorhus/p-limit) Tj ET";
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}

test.beforeEach(async ({ context, baseURL }, info) => {
  const locale = info.project.name.endsWith("-ar") ? "ar" : "en";
  await context.addCookies([{ name: "codeproof-locale", value: locale, url: baseURL! }]);
  if (baseURL?.startsWith("http://127.0.0.1:")) {
    await context.setExtraHTTPHeaders({ "x-forwarded-for": `2001:db8:${randomUUID().slice(0, 4)}::1` });
  }
  await register(context);
});

test("isolated local owner console, audited suspension and reactivation", async ({ page, context, browser, baseURL }, info) => {
  test.skip(!process.env.CODEPROOF_QA_DB || !baseURL?.startsWith("http://127.0.0.1:"), "Never seed owner privileges in production");
  test.setTimeout(120_000);
  const databasePath = path.resolve(process.env.CODEPROOF_QA_DB!);
  expect(databasePath).toBe(path.resolve(".data/demo-release-verification.db"));
  const database = new DatabaseSync(databasePath);
  database.exec("PRAGMA busy_timeout = 5000");
  // Elevate only the freshly created synthetic account in this explicitly isolated test store.
  const updated = database.prepare("UPDATE users SET role='ADMIN', is_demo=1, demo_label='Synthetic local QA owner' WHERE id=? AND email LIKE 'release-%@example.invalid'").run(registeredIds.get(context)!);
  database.close();
  expect(updated.changes).toBe(1);
  const target = await browser.newContext({ baseURL });
  try {
    await register(target);
    const id = registeredIds.get(target)!;
    const locale: Locale = info.project.name.endsWith("-ar") ? "ar" : "en";
    const t = (key: string) => translate(locale, key);
    for (const route of ["/admin", "/admin/accounts", "/admin/organizations", "/admin/plans", "/admin/audit"]) {
      await page.goto(route);
      await expect(page.locator("main")).toBeVisible();
      await layout(page, locale);
    }
    await page.goto(`/admin/accounts/${id}`);
    await page.screenshot({ path: info.outputPath("owner-account.png"), fullPage: true });
    await page.getByRole("button", { name: t("Suspend"), exact: true }).click();
    await page.getByRole("button", { name: t("Yes, suspend"), exact: true }).click();
    await expect(page.getByRole("button", { name: t("Reactivate"), exact: true })).toBeVisible();
    expect((await target.request.get("/api/candidates")).status()).toBe(401);
    await page.getByRole("button", { name: t("Reactivate"), exact: true }).click();
    await expect(page.getByRole("button", { name: t("Suspend"), exact: true })).toBeVisible();
    expect((await target.request.get("/api/candidates")).status()).toBe(200);
    const audit = await context.request.get("/api/admin/audit");
    expect(audit.status()).toBe(200);
    const { entries } = await audit.json() as { entries: { action: string; targetId?: string }[] };
    expect(entries.some((entry) => entry.action === "account_suspended")).toBe(true);
    expect(entries.some((entry) => entry.action === "account_reactivated")).toBe(true);
  } finally {
    await target.close();
  }
});

test("CV-only intake, confidential evidence, consent, single use and revocation", async ({ page, context, browser, baseURL }, info) => {
  test.setTimeout(120_000);
  const locale: Locale = info.project.name.endsWith("-ar") ? "ar" : "en";
  const t = (key: string) => translate(locale, key);
  const intake = await context.request.post("/api/candidates/intake", {
    multipart: { candidateName: "Synthetic confidential candidate", role: "Frontend Engineer", isDemo: "true", resumeText: "Synthetic QA CV. React and TypeScript. All work is private." },
  });
  expect(intake.status()).toBe(201);
  const { candidate } = await intake.json() as { candidate: { id: string; furthestStage: string; stageHistory: { stage: string }[] } };
  expect(candidate.furthestStage).toBe("screening");
  expect(candidate.stageHistory.some((event) => event.stage === "code_review")).toBe(false);
  const outsider = await browser.newContext({ baseURL, viewport: info.project.use.viewport,
    // Model distinct local candidate clients without weakening the application's limiter.
    extraHTTPHeaders: baseURL?.includes("127.0.0.1") ? { "x-forwarded-for": `2001:db8:${randomUUID().slice(0, 4)}::2` } : {},
  });
  try {
    expect((await outsider.request.get(`/api/candidates/${candidate.id}`)).status()).toBe(401);
    await page.goto(`/candidates/${candidate.id}`);
    await expect(page.getByRole("heading", { name: "Synthetic confidential candidate" })).toBeVisible();
    await layout(page, locale);
    const responsePromise = page.waitForResponse((response) => response.url().endsWith(`/api/candidates/${candidate.id}/evidence-requests`) && response.request().method() === "POST");
    await page.getByRole("button", { name: t("Create a private link"), exact: true }).click();
    const opened = await responsePromise;
    expect(opened.status()).toBe(201);
    const { path } = await opened.json() as { path: string };
    const token = path.split("/")[2];
    expect((await outsider.request.post(`/api/evidence/${token}`, { data: { consent: false, confidential: true, repositories: [], otherLinks: [] } })).status()).toBe(400);
    await outsider.addCookies([{ name: "codeproof-locale", value: locale === "ar" ? "en" : "ar", url: baseURL! }]);
    const candidatePage = await outsider.newPage();
    await candidatePage.goto(path);
    await layout(candidatePage, locale === "ar" ? "en" : "ar");
    // A returning visitor keeps their preference. A first-time visitor receives the requested language.
    await outsider.clearCookies();
    await candidatePage.goto(path);
    await layout(candidatePage, locale);
    await candidatePage.screenshot({ path: info.outputPath("candidate-consent.png"), fullPage: true });
    await candidatePage.getByRole("checkbox", { name: t("My work is confidential or private, and I cannot share it."), exact: true }).check();
    await candidatePage.getByRole("checkbox", { name: t("I agree that CodeProof reads the public repositories I listed and shows the result to the hiring team that sent me this link."), exact: true }).check();
    await candidatePage.getByRole("button", { name: t("Send to the hiring team"), exact: true }).click();
    await expect(candidatePage.getByRole("heading", { name: t("Thank you. Your answer was sent."), exact: true })).toBeVisible();
    expect((await outsider.request.post(`/api/evidence/${token}`, { data: { consent: true, confidential: true, repositories: [], otherLinks: [] } })).status()).toBe(404);
    await page.reload();
    await expect(page.getByText(t("The candidate says their work is confidential"), { exact: true })).toBeVisible();
    await layout(page, locale);
    const replacement = await context.request.post(`/api/candidates/${candidate.id}/evidence-requests`, { data: { locale } });
    expect(replacement.status()).toBe(201);
    const revoked = await replacement.json() as { request: { id: string }; path: string };
    expect((await context.request.delete(`/api/candidates/${candidate.id}/evidence-requests/${revoked.request.id}`)).status()).toBe(204);
    expect((await outsider.request.post(`/api/evidence/${revoked.path.split("/")[2]}`, { data: { consent: true, confidential: true, repositories: [], otherLinks: [] } })).status()).toBe(404);
    await page.goto("/review");
    await expect(page.getByRole("link", { name: "Synthetic confidential candidate", exact: true })).toBeVisible();
    await layout(page, locale);
  } finally {
    await outsider.close();
    expect((await context.request.delete(`/api/candidates/${candidate.id}`)).status()).toBe(204);
  }
});

test("account editing, workspace seats, tenant boundaries and responsive navigation", async ({ page, context, browser, baseURL }, info) => {
  test.setTimeout(120_000);
  const locale: Locale = info.project.name.endsWith("-ar") ? "ar" : "en";
  const t = (key: string) => translate(locale, key);
  await page.goto("/account");
  await page.getByLabel(t("Your name"), { exact: true }).fill("Synthetic updated recruiter");
  await page.getByRole("button", { name: t("Save name"), exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: t("Saved") })).toBeVisible();
  await layout(page, locale);
  const denied = await context.request.get("/api/admin/audit");
  expect(denied.status()).toBe(404);
  expect(await denied.json()).toEqual({ error: { code: "RESOURCE_UNAVAILABLE" } });
  const organization = await context.request.post("/api/organizations", { data: { name: "Synthetic QA agency", kind: "agency" } });
  expect(organization.status()).toBe(201);
  const inviteEmail = `release-${randomUUID()}@example.invalid`;
  const invitation = await context.request.post("/api/organizations/invitations", { data: { email: inviteEmail, role: "RECRUITER", locale } });
  expect(invitation.status()).toBe(201);
  expect((await context.request.post("/api/organizations/invitations", { data: { email: `full-${randomUUID()}@example.invalid`, role: "RECRUITER", locale } })).status()).toBe(409);
  const { link } = await invitation.json() as { link: string };
  const guest = await browser.newContext({ baseURL,
    extraHTTPHeaders: baseURL?.startsWith("http://127.0.0.1:") ? { "x-forwarded-for": `2001:db8:${randomUUID().slice(0, 4)}::3` } : {},
  });
  let guestCandidateId: string | null = null;
  try {
    await register(guest, inviteEmail);
    expect((await guest.request.post("/api/organizations/join", { data: { token: new URL(link).pathname.split("/").pop() } })).status()).toBe(200);
    expect((await context.request.delete(`/api/organizations/members/${registeredIds.get(context)!}`)).status()).toBe(409);
    expect((await guest.request.post("/api/organizations/invitations", { data: { email: "forbidden@example.invalid", role: "RECRUITER", locale } })).status()).toBe(403);
    const saved = await guest.request.post("/api/candidates/intake", { multipart: { candidateName: "Synthetic tenant boundary candidate", role: "Backend Engineer", isDemo: "true", resumeText: "Synthetic CV with TypeScript experience." } });
    expect(saved.status()).toBe(201);
    const { candidate } = await saved.json() as { candidate: { id: string } };
    guestCandidateId = candidate.id;
    expect((await context.request.get(`/api/candidates/${candidate.id}`)).status()).toBe(404);
    expect((await context.request.delete(`/api/candidates/${candidate.id}`)).status()).toBe(404);
    await page.goto(`/team/candidates/${candidate.id}`);
    await expect(page.getByRole("heading", { name: "Synthetic tenant boundary candidate", exact: true })).toBeVisible();
    await layout(page, locale);
    // A streamed Next.js not-found page may have a 200 shell; assert that no candidate data leaks.
    const deniedPage = await guest.request.get(`/team/candidates/${candidate.id}`);
    expect(await deniedPage.text()).not.toContain("Synthetic tenant boundary candidate");
  } finally {
    if (guestCandidateId) expect((await guest.request.delete(`/api/candidates/${guestCandidateId}`)).status()).toBe(204);
    await guest.close();
  }
  for (const route of ["/team", "/", "/candidates", "/compare", "/insights", "/cv-coverage", "/trust"]) {
    await page.goto(route);
    await expect(page.locator("main")).toBeVisible();
    await layout(page, locale);
  }
});

test("PDF upload through real repository analysis, dossier, project, queue and export", async ({ page, context }, info) => {
  test.setTimeout(180_000);
  const locale: Locale = info.project.name.endsWith("-ar") ? "ar" : "en";
  const t = (key: string) => translate(locale, key);
  await page.goto("/analyze");
  await expect(page.locator('input[type="file"]')).toBeEnabled();
  await page.locator('input[type="file"]').setInputFiles({ name: "synthetic-qa-cv.pdf", mimeType: "application/pdf", buffer: syntheticCvPdf() });
  await page.getByRole("button", { name: t("Detect candidate projects"), exact: false }).click();
  await expect(page.getByRole("heading", { name: t("Confirm candidate and projects"), exact: true })).toBeVisible();
  await page.getByLabel(t("Candidate name"), { exact: true }).fill("Synthetic QA Candidate");
  await layout(page, locale);
  const completed = page.waitForResponse((response) => response.url().endsWith("/api/candidates/analyze") && response.request().method() === "POST", { timeout: 150_000 });
  await page.getByRole("button", { name: t("Build candidate evidence report"), exact: false }).click();
  const result = await completed;
  expect(result.status()).toBe(201);
  const { candidate } = await result.json() as { candidate: { id: string; analyses: { id: string; result: { selectedFiles: unknown[] } }[] } };
  try {
    expect(candidate.analyses).toHaveLength(1);
    expect(candidate.analyses[0].result.selectedFiles.length).toBeGreaterThan(0);
    await expect(page.getByRole("heading", { name: "Synthetic QA Candidate", exact: true })).toBeVisible();
    await layout(page, locale);
    await page.screenshot({ path: info.outputPath("real-repository-dossier.png"), fullPage: true });
    for (const route of [`/candidates/${candidate.id}/projects/${candidate.analyses[0].id}`, `/candidates/${candidate.id}/share`, "/compare", "/review"]) {
      await page.goto(route);
      await expect(page.locator("main")).toBeVisible();
      await layout(page, locale);
    }
    await expect(page.getByText(t("Repository code was inspected, but the candidate's contribution is not verified"), { exact: true })).toBeVisible();
    await expect(page.getByText(t("Code was inspected. Verify the candidate's contribution before treating it as their skill evidence."), { exact: true })).toBeVisible();
    await page.getByRole("button", { name: t("Mark evidence as checked"), exact: true }).click();
    await expect(page.getByRole("button", { name: t("Undo check"), exact: true })).toBeVisible();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: t("Export order (CSV)"), exact: true }).click();
    expect((await downloadPromise).suggestedFilename()).toMatch(/^codeproof-review-order-.*\.csv$/);
  } finally {
    expect((await context.request.delete(`/api/candidates/${candidate.id}`)).status()).toBe(204);
  }
});
